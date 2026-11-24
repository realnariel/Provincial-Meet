// Deploy only to the NEW Supabase project. The service key stays in Supabase's
// Edge Function environment and is never embedded in the React application.
import { createClient } from "@supabase/supabase-js";

// This file runs in Supabase's Deno runtime, not in the React browser bundle.
// A narrow runtime type also lets the React workspace's TypeScript checker
// validate the function without requiring Deno globals in every source file.
const edgeRuntime = (globalThis as unknown as {
  Deno: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
}).Deno;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function validPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 6 &&
    value.length <= 128 &&
    value !== "coordinator"
  );
}
function accountEmail(username: string) {
  return `${username}@accounts.provmeet.example.com`;
}

edgeRuntime.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const token = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign-in required" }, 401);
  const url = edgeRuntime.env.get("SUPABASE_URL");
  const serviceKey = edgeRuntime.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey)
    return json({ error: "Function configuration missing" }, 500);
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller, error: identityError } =
    await admin.auth.getUser(token);
  if (identityError || !caller.user)
    return json({ error: "Invalid session" }, 401);
  const { data: profile, error: profileError } = await admin
    .from("prov_coordinators")
    .select("id,username,is_admin")
    .eq("auth_user_id", caller.user.id)
    .single();
  if (profileError || !profile)
    return json({ error: "No coordinator account" }, 403);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return json({ error: "Invalid request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  if (!profile.is_admin)
    return json({ error: "Administrator access required" }, 403);

  if (body.action === "list-pending") {
    const { data: coords } = await admin
      .from("prov_coordinators")
      .select("auth_user_id, email");
    const existingAuthIds = new Set(
      (coords ?? []).map((c) => c.auth_user_id as string).filter(Boolean),
    );
    const existingEmails = new Set(
      (coords ?? [])
        .map((c) => ((c.email as string) || "").toLowerCase().trim())
        .filter(Boolean),
    );

    const results: Array<Record<string, unknown>> = [];

    // Query prov_coordinator_requests table if it exists
    try {
      const { data: reqs } = await admin
        .from("prov_coordinator_requests")
        .select("*")
        .eq("status", "pending")
        .not("email", "like", "%@accounts.provmeet.example.com")
        .order("created_at", { ascending: false });
      if (reqs && reqs.length > 0) {
        for (const r of reqs) {
          const reqEmail = ((r.email as string) || "").toLowerCase().trim();
          // Filter out requests for accounts that are already coordinators
          if (
            !existingAuthIds.has(r.auth_user_id as string) &&
            !existingEmails.has(reqEmail)
          ) {
            results.push(r);
          }
        }
      }
    } catch {
      // Table may not exist yet
    }

    const seenAuthIds = new Set(results.map((r) => r.auth_user_id as string));

    // Fallback: check auth.users directly via admin API
    try {
      const { data: authUsers } = await admin.auth.admin.listUsers();
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          const email = (u.email ?? "").toLowerCase().trim();
          // Never list internal username/password credential accounts as pending Google signups
          if (!email || email.endsWith("@accounts.provmeet.example.com")) continue;

          // If this email already belongs to an existing coordinator, auto-link auth_user_id and DO NOT list as pending!
          if (existingEmails.has(email)) {
            try {
              await admin
                .from("prov_coordinators")
                .update({ auth_user_id: u.id })
                .ilike("email", email)
                .is("auth_user_id", null);
            } catch {
              // Ignore
            }
            continue;
          }

          if (!existingAuthIds.has(u.id) && !seenAuthIds.has(u.id)) {
            results.push({
              id: `auth_${u.id}`,
              auth_user_id: u.id,
              email: u.email ?? "",
              fullname:
                (u.user_metadata?.full_name as string) ||
                (u.user_metadata?.name as string) ||
                u.email?.split("@")[0] ||
                "Google User",
              status: "pending",
              created_at: u.created_at,
            });
            seenAuthIds.add(u.id);
          }
        }
      }
    } catch {
      // Ignore
    }

    return json({ requests: results });
  }

  if (body.action === "reject-user") {
    const authUserId =
      typeof body.authUserId === "string" ? body.authUserId.trim() : null;
    const requestId = typeof body.requestId === "number" ? body.requestId : null;

    if (!authUserId && !requestId)
      return json({ error: "authUserId or requestId required" }, 400);

    if (requestId) {
      try {
        await admin
          .from("prov_coordinator_requests")
          .update({ status: "rejected", reviewed_at: new Date().toISOString() })
          .eq("id", requestId);
      } catch {
        // Ignore
      }
    }

    if (authUserId) {
      try {
        await admin
          .from("prov_coordinator_requests")
          .delete()
          .eq("auth_user_id", authUserId);
      } catch {
        // Ignore
      }

      // Permanently delete user from Supabase Auth so they never return on refresh!
      try {
        await admin.auth.admin.deleteUser(authUserId);
      } catch (authDelErr) {
        console.warn("Could not delete from auth.users:", authDelErr);
      }
    }

    return json({ ok: true, message: "Pending sign-up rejected and removed" });
  }

  if (body.action === "approve-user") {
    const authUserId =
      typeof body.authUserId === "string" ? body.authUserId.trim() : null;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullname =
      typeof body.fullname === "string" ? body.fullname.trim() : "";
    const isAdmin = body.isAdmin === true;

    if (!authUserId) return json({ error: "Auth user ID required" }, 400);

    const { data: existing } = await admin
      .from("prov_coordinators")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (existing) {
      return json({ ok: true, message: "User is already a coordinator", coordinator_id: existing.id });
    }

    // Check if coordinator already exists with this email! Link them!
    if (email) {
      const { data: existingEmail } = await admin
        .from("prov_coordinators")
        .select("id,username,is_admin")
        .ilike("email", email)
        .maybeSingle();
      if (existingEmail) {
        await admin
          .from("prov_coordinators")
          .update({
            auth_user_id: authUserId,
            is_admin: isAdmin || existingEmail.is_admin,
          })
          .eq("id", existingEmail.id);
        try {
          await admin
            .from("prov_coordinator_requests")
            .update({ status: "approved", reviewed_at: new Date().toISOString() })
            .eq("auth_user_id", authUserId);
        } catch {
          // Table may not exist yet
        }
        return json({
          ok: true,
          message: "Linked Google account to existing coordinator profile",
          coordinator_id: existingEmail.id,
        });
      }
    }

    let baseUsername = (email.split("@")[0] || "coord")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "");
    if (baseUsername.length < 3) baseUsername = "coord_" + baseUsername;
    let username = baseUsername;
    let counter = 1;

    while (true) {
      const { data: taken } = await admin
        .from("prov_coordinators")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (!taken) break;
      counter++;
      username = `${baseUsername}${counter}`;
    }

    const { data: newCoord, error: insertErr } = await admin
      .from("prov_coordinators")
      .insert({
        username,
        fullname: fullname || email.split("@")[0] || "Coordinator",
        email: email || null,
        is_admin: isAdmin,
        auth_user_id: authUserId,
        passwordhash: "",
        must_change_password: false,
      })
      .select("id")
      .maybeSingle();
    if (insertErr) return json({ error: insertErr.message }, 400);

    try {
      await admin
        .from("prov_coordinator_requests")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("auth_user_id", authUserId);
    } catch {
      // Table may not exist yet
    }

    return json({ ok: true, coordinator_id: newCoord?.id });
  }
  if (body.action === "create") {
    const username =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";
    const fullname =
      typeof body.fullname === "string" ? body.fullname.trim() : "";
    if (
      !/^[a-z0-9._-]{1,50}$/.test(username) ||
      !fullname ||
      fullname.length > 100 ||
      !validPassword(body.password)
    )
      return json(
        {
          error:
            "Valid username, full name, and a 6–128 character temporary password are required",
        },
        400,
      );
    const { data: created, error: authError } =
      await admin.auth.admin.createUser({
        email: accountEmail(username),
        password: body.password,
        email_confirm: true,
      });
    if (authError || !created.user)
      return json(
        { error: authError?.message ?? "Could not create account" },
        400,
      );
    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : null;
    const { error: rowError } = await admin.from("prov_coordinators").insert({
      username,
      fullname,
      email,
      is_admin: body.isAdmin === true,
      auth_user_id: created.user.id,
      passwordhash: "",
      must_change_password: false,
    });
    if (rowError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: rowError.message }, 400);
    }
    return json({ ok: true });
  }
  const id =
    typeof body.id === "number" && Number.isInteger(body.id) ? body.id : null;
  if (!id) return json({ error: "Coordinator ID is required" }, 400);
  const { data: target, error: targetError } = await admin
    .from("prov_coordinators")
    .select("id,auth_user_id,is_admin")
    .eq("id", id)
    .single();
  if (targetError || !target?.auth_user_id)
    return json({ error: "Coordinator not found" }, 404);
  if (body.action === "reset-password") {
    if (!validPassword(body.password))
      return json({ error: "Use a 6–128 character temporary password" }, 400);
    const { error: resetError } = await admin.auth.admin.updateUserById(
      target.auth_user_id,
      { password: body.password },
    );
    if (resetError) return json({ error: resetError.message }, 400);
    const { error: rowError } = await admin
      .from("prov_coordinators")
      .update({ must_change_password: false })
      .eq("id", id);
    if (rowError) return json({ error: rowError.message }, 500);
    return json({ ok: true });
  }
  if (body.action === "update") {
    const fullname =
      typeof body.fullname === "string" ? body.fullname.trim() : "";
    if (!fullname || fullname.length > 100)
      return json({ error: "Enter a valid full name" }, 400);
    if (id === profile.id && body.isAdmin !== true)
      return json({ error: "You cannot remove your own admin access" }, 400);

    const updatePayload: Record<string, unknown> = {
      fullname,
      is_admin: body.isAdmin === true,
    };

    if (typeof body.username === "string" && body.username.trim()) {
      const cleaned = body.username.trim().toLowerCase();
      if (!/^[a-z0-9._-]{1,50}$/.test(cleaned))
        return json({ error: "Invalid username format" }, 400);
      updatePayload.username = cleaned;
    }

    if (typeof body.email === "string") {
      updatePayload.email = body.email.trim() || null;
    }

    const { error: updateError } = await admin
      .from("prov_coordinators")
      .update(updatePayload)
      .eq("id", id);
    if (updateError) return json({ error: updateError.message }, 400);
    return json({ ok: true });
  }
  if (body.action === "delete") {
    if (id === profile.id)
      return json({ error: "You cannot delete your own account" }, 400);

    // Set all events assigned to this coordinator back to Unassigned (null)
    await admin
      .from("prov_events")
      .update({ coordinatorid: null })
      .eq("coordinatorid", target.id);

    // Delete coordinator record
    await admin
      .from("prov_coordinators")
      .delete()
      .eq("id", target.id);

    // Delete associated auth user if one exists
    if (target.auth_user_id) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(
        target.auth_user_id,
      );
      if (deleteError) return json({ error: deleteError.message }, 400);
    }
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
});
