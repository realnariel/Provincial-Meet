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
    const { error: rowError } = await admin.from("prov_coordinators").insert({
      username,
      fullname,
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
    const { error: updateError } = await admin
      .from("prov_coordinators")
      .update({ fullname, is_admin: body.isAdmin === true })
      .eq("id", id);
    if (updateError) return json({ error: updateError.message }, 400);
    return json({ ok: true });
  }
  if (body.action === "delete") {
    if (id === profile.id)
      return json({ error: "You cannot delete your own account" }, 400);
    const { error: deleteError } = await admin.auth.admin.deleteUser(
      target.auth_user_id,
    );
    if (deleteError) return json({ error: deleteError.message }, 400);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
});
