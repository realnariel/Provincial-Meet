import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppData } from "./App";
import {
  bulkAddQualifiers,
  bulkDeleteQualifiers,
  loadCoordinators,
  loadQualifiers,
  removeEvent,
  removeQualifier,
  saveEvent,
  saveQualifier,
} from "./data";
import { requireSupabase, usernameEmail } from "./supabase";
import {
  DIVISIONS,
  SPORTS_CATEGORIES,
  type Coordinator,
  type Division,
  type MeetEvent,
  type Qualifier,
} from "./types";

type Nav = (path: string) => void;
const blankEvent = {
  title: "",
  sport_name: "",
  sport_category: "Boys",
  event_category: "Individual",
  division: "Secondary" as Division,
  coordinatorid: null as number | null,
  status: "Pending" as MeetEvent["status"],
};

function message(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object") {
    const problem = cause as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [problem.message, problem.details, problem.hint]
      .filter((value): value is string =>
        typeof value === "string" && value.trim().length > 0,
      )
      .map((value) => value.trim());
    if (parts.length) {
      const code =
        typeof problem.code === "string" && problem.code.trim()
          ? ` (${problem.code.trim()})`
          : "";
      return `${[...new Set(parts)].join(" ")}${code}`;
    }
  }
  return "The operation failed.";
}
function signInError(error: {
  code?: string;
  status?: number;
  message: string;
}) {
  if (error.status === 429 || error.code?.includes("rate_limit"))
    return "Too many sign-in attempts. Please wait a few minutes and try again.";
  if (error.code === "email_not_confirmed")
    return "This account has not been confirmed in Supabase Authentication.";
  if (error.code === "weak_password")
    return "Supabase rejected this password under the project’s password security policy.";
  if (error.code === "invalid_credentials" || error.code === "invalid_grant")
    return "Invalid username or password.";
  if (error.status === 0 || error.message.toLowerCase().includes("fetch"))
    return "Could not reach Supabase Authentication. Check your connection and try again.";
  return `Sign-in failed: ${error.message}`;
}

export function LoginPage({
  profile,
  navigate,
}: {
  profile: Coordinator | null;
  navigate: Nav;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!profile) return;
    const timer = window.setTimeout(() => navigate("/"), 1400);
    return () => window.clearTimeout(timer);
  }, [profile, navigate]);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: loginError } =
        await requireSupabase().auth.signInWithPassword({
          email: usernameEmail(username),
          password,
        });
      if (loginError) throw new Error(signInError(loginError));
      setPassword("");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  if (profile)
    return (
      <section className="panel auth-card">
        <h1>Signed in</h1>
        <div className="alert success" role="status">
          Welcome, {profile.fullname}. Redirecting to Home…
        </div>
      </section>
    );
  return (
    <section className="panel auth-card">
      <span className="eyebrow dark">Secure access</span>
      <h1>Sign in</h1>
      <p>Sign in using your assigned username, or the email address used to create your account.</p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={signIn} className="form-stack">
        <label>
          Username or email
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </section>
  );
}

export function ManagePage({
  data,
  profile,
  admin,
  section,
  refresh,
  navigate,
}: {
  data: AppData;
  profile: Coordinator;
  admin: boolean;
  section: "events" | "assignments" | "coordinators";
  refresh: () => Promise<void>;
  navigate: Nav;
}) {
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [tab, setTab] = useState<"events" | "assignments" | "coordinators">(
    admin ? section : "events",
  );
  const [selected, setSelected] = useState<MeetEvent | null>(null);
  const [form, setForm] = useState(blankEvent);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const visible = useMemo(
    () =>
      data.events.filter(
        (event) =>
          (admin || event.coordinatorid === profile.id) &&
          `${event.title} ${event.sport_name ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [data.events, admin, profile.id, search],
  );
  useEffect(() => {
    if (admin)
      void loadCoordinators()
        .then(setCoordinators)
        .catch((cause) => setError(message(cause)));
  }, [admin]);
  useEffect(() => { setTab(admin ? section : "events"); }, [admin, section]);
  function choose(event: MeetEvent) {
    setSelected(event);
    setForm({
      title: event.title,
      sport_name: event.sport_name ?? "",
      sport_category: event.sport_category ?? "",
      event_category: event.event_category ?? "",
      division: event.division,
      coordinatorid: event.coordinatorid,
      status: event.status,
    });
    setNotice("");
    setError("");
  }
  async function run(action: () => Promise<void>, success: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }
  async function submitEvent(event: FormEvent) {
    event.preventDefault();
    await run(
      () => saveEvent({ ...form, id: selected?.id }),
      selected ? "Event updated." : "Event created.",
    );
  }
  return (
    <section className="panel">
      <div className="page-heading">
        <span className="eyebrow dark">Staff workspace</span>
        <h1>Meet management</h1>
        <p>
          {admin
            ? "Manage events, assignments, and coordinators."
            : `Events for ${profile.fullname}.`}
        </p>
      </div>
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="tabs" role="group">
        <button
          className={tab === "events" ? "active" : ""}
          onClick={() => { setTab("events"); navigate("/manage"); }}
        >
          Events
        </button>
        {admin && (
          <button
            className={tab === "assignments" ? "active" : ""}
            onClick={() => { setTab("assignments"); navigate("/manage/assignments"); }}
          >
            Assignments
          </button>
        )}
        {admin && (
          <button
            className={tab === "coordinators" ? "active" : ""}
            onClick={() => { setTab("coordinators"); navigate("/manage/coordinators"); }}
          >
            Coordinators
          </button>
        )}
      </div>
      {tab === "events" && (
        <div className="manage-grid">
          <div>
            <label className="search-label">
              Find an event
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Title or sport"
              />
            </label>
            {admin && (
              <button
                className="button-outline create-button"
                onClick={() => {
                  setSelected(null);
                  setForm(blankEvent);
                  setNotice("");
                  setError("");
                }}
              >
                + Add event
              </button>
            )}
            <div className="manage-list">
              {visible.map((event) => (
                <button
                  key={event.id}
                  className={
                    selected?.id === event.id
                      ? "manage-item selected"
                      : "manage-item"
                  }
                  onClick={() => choose(event)}
                >
                  <strong>{event.title}</strong>
                  <small>
                    {event.sport_name} · {event.division} · {event.status}
                  </small>
                </button>
              ))}
            </div>
            {!visible.length && (
              <p className="empty">No assigned events match this search.</p>
            )}
          </div>
          <div className="edit-panel">
            {!selected && !admin ? (
              <p className="empty">
                Choose an assigned event to enter results.
              </p>
            ) : (
              <>
                {admin && (
                  <form onSubmit={submitEvent} className="form-stack">
                    <h2>{selected ? "Event details" : "Add event"}</h2>
                    <label>
                      Event title
                      <input
                        value={form.title}
                        onChange={(event) =>
                          setForm({ ...form, title: event.target.value })
                        }
                        required
                      />
                    </label>
                    <div className="form-two">
                      <label>
                        Sport
                        <input
                          value={form.sport_name}
                          onChange={(event) =>
                            setForm({ ...form, sport_name: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Category (Boys/Girls/Mixed)
                        <select
                          value={form.sport_category}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              sport_category: event.target.value,
                            })
                          }
                        >
                          <option value="">Open</option>
                          {SPORTS_CATEGORIES.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="form-two">
                      <label>
                        Type (event category)
                        <input
                          value={form.event_category}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              event_category: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Division
                        <select
                          value={form.division}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              division: event.target.value as Division,
                            })
                          }
                        >
                          {DIVISIONS.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Coordinator
                      <select
                        value={form.coordinatorid ?? ""}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            coordinatorid: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      >
                        <option value="">Unassigned</option>
                        {coordinators.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.fullname}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="button-row">
                      <button disabled={saving}>
                        {saving
                          ? "Saving…"
                          : selected
                            ? "Save event"
                            : "Create event"}
                      </button>
                      {selected && (
                        <button
                          type="button"
                          className="button-danger"
                          disabled={saving}
                          onClick={() => {
                            if (window.confirm(`Delete ${selected.title}?`))
                              void run(async () => {
                                await removeEvent(selected.id);
                                setSelected(null);
                              }, "Event deleted.");
                          }}
                        >
                          Delete event
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {tab === "assignments" && admin && (
        <Assignments
          data={data}
          coordinators={coordinators}
          refresh={refresh}
        />
      )}
      {tab === "coordinators" && admin && (
        <CoordinatorAdmin
          coordinators={coordinators}
          reload={async () => setCoordinators(await loadCoordinators())}
        />
      )}
    </section>
  );
}

function Assignments({
  data,
  coordinators,
  refresh,
}: {
  data: AppData;
  coordinators: Coordinator[];
  refresh: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const changes = Object.entries(values);
      const { error: updateError } = await requireSupabase()
        .rpc("prov_set_event_assignments", {
          p_assignments: changes.map(([id, value]) => ({
            event_id: Number(id), coordinator_id: value ? Number(value) : null,
          })),
        });
      if (updateError) throw updateError;
      await refresh();
      setValues({});
      setNotice(`${changes.length} assignment(s) saved.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p>
        Assign coordinators to events. Only assigned coordinators may enter
        their results.
      </p>
      {notice && <div className="alert success">{notice}</div>}
      {error && <div className="alert error">{error}</div>}
      <div className="table-scroll">
        <table className="meet-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Division</th>
              <th>Coordinator</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((event) => (
              <tr key={event.id}>
                <td>{event.title}</td>
                <td>{event.division}</td>
                <td>
                  <select
                    aria-label={`Coordinator for ${event.title}`}
                    value={
                      values[event.id] ?? String(event.coordinatorid ?? "")
                    }
                    onChange={(change) =>
                      setValues({ ...values, [event.id]: change.target.value })
                    }
                  >
                    <option value="">Unassigned</option>
                    {coordinators.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullname}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        disabled={busy || !Object.keys(values).length}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Save assignments"}
      </button>
    </div>
  );
}

function CoordinatorAdmin({
  coordinators,
  reload,
}: {
  coordinators: Coordinator[];
  reload: () => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [fullname, setFullname] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editAdmin, setEditAdmin] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  async function request(action: string, extra: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } =
        await requireSupabase().functions.invoke("coordinator-admin", {
          body: { action, ...extra },
        });
      if (invokeError) {
        const response = (invokeError as { context?: unknown }).context;
        if (response instanceof Response) {
          const payload: unknown = await response
            .clone()
            .json()
            .catch(() => null);
          if (payload && typeof payload === "object" && "error" in payload) {
            const serverError = (payload as { error?: unknown }).error;
            if (typeof serverError === "string" && serverError.trim())
              throw new Error(serverError);
          }
        }
        throw invokeError;
      }
      if (data?.error) throw new Error(data.error);
      await reload();
      setNotice("Coordinator account updated.");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="manage-grid">
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void request("create", {
            username,
            fullname,
            password,
            isAdmin,
          }).then(() => {
            setPassword("");
          });
        }}
      >
        <h2>Add coordinator</h2>
        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            pattern="[a-zA-Z0-9._-]+"
            required
          />
        </label>
        <label>
          Full name
          <input
            value={fullname}
            onChange={(event) => setFullname(event.target.value)}
            required
          />
        </label>
        <label>
          Temporary password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(event) => setIsAdmin(event.target.checked)}
          />{" "}
          Administrator
        </label>
        <button disabled={busy}>Create account</button>
      </form>
      <div>
        <h2>Existing coordinators</h2>
        <div className="manage-list">
          {coordinators.map((item) => (
            <div className="coordinator-item" key={item.id}>
              <div>
                <strong>{item.fullname}</strong>
                <small>
                  @{item.username} · {item.is_admin ? "Admin" : "Coordinator"}
                </small>
              </div>
              <div className="button-row">
                <button
                  className="button-outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(editing === item.id ? null : item.id);
                    setEditName(item.fullname);
                    setEditAdmin(item.is_admin);
                    setResetPassword("");
                  }}
                >
                  Edit
                </button>
                <button
                  className="button-danger"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete coordinator ${item.username}?`))
                      void request("delete", { id: item.id });
                  }}
                >
                  Delete
                </button>
              </div>
              {editing === item.id && (
                <div className="coordinator-edit form-stack">
                  <label>
                    Full name
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={editAdmin}
                      onChange={(event) => setEditAdmin(event.target.checked)}
                    />{" "}
                    Administrator
                  </label>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void request("update", {
                        id: item.id,
                        fullname: editName,
                        isAdmin: editAdmin,
                      })
                    }
                  >
                    Save details
                  </button>
                  <label>
                    New temporary password
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                    />
                  </label>
                  <button
                    className="button-outline"
                    disabled={busy || resetPassword.length < 6}
                    onClick={() =>
                      void request("reset-password", {
                        id: item.id,
                        password: resetPassword,
                      }).then(() => setResetPassword(""))
                    }
                  >
                    Reset password
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QualifiersPage({
  data,
  profile,
  path,
  navigate,
}: {
  data: AppData;
  profile: Coordinator;
  path: string;
  navigate: Nav;
}) {
  const eventId = Number(path.split("/")[2]);
  const event = data.events.find((item) => item.id === eventId);
  const allowed =
    event && (profile.is_admin || event.coordinatorid === profile.id);
  const [qualifiers, setQualifiers] = useState<Qualifier[]>([]);
  const [selected, setSelected] = useState<Qualifier | null>(null);
  const [form, setForm] = useState({
    participant_name: "",
    role: "Athlete",
    team: "",
    specific_district: "",
    school: "",
    gender: "",
    tshirt_size: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkNames, setBulkNames] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    if (allowed)
      void loadQualifiers()
        .then((rows) =>
          setQualifiers(rows.filter((row) => row.event_id === eventId)),
        )
        .catch((cause) => setError(message(cause)));
  }, [allowed, eventId]);
  if (!allowed)
    return (
      <section className="panel state-message">
        <h1>Event unavailable</h1>
        <p>You may manage only your assigned events.</p>
      </section>
    );
  async function submit(eventForm: FormEvent) {
    eventForm.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveQualifier({ ...form, event_id: eventId, id: selected?.id });
      setQualifiers(
        (await loadQualifiers()).filter((row) => row.event_id === eventId),
      );
      setSelected(null);
      setForm({
        participant_name: "",
        role: "Athlete",
        team: "",
        specific_district: "",
        school: "",
        gender: "",
        tshirt_size: "",
      });
      setNotice("Qualifier saved.");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <button
        className="text-link back-link"
        onClick={() => navigate("/manage")}
      >
        ← Event management
      </button>
      <div className="page-heading">
        <span className="eyebrow dark">Delegation management</span>
        <h1>Qualifiers</h1>
        <p>
          {event.title} · {event.division}
        </p>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      <div className="manage-grid">
        <div>
          <h2>Participants and staff</h2>
          <div className="manage-list">
            {qualifiers.map((item) => (
              <div className="qualifier-row" key={item.id}>
                <input
                  type="checkbox"
                  aria-label={`Select ${item.participant_name}`}
                  checked={selectedIds.includes(item.id)}
                  onChange={(change) =>
                    setSelectedIds((previous) =>
                      change.target.checked
                        ? [...previous, item.id]
                        : previous.filter((id) => id !== item.id),
                    )
                  }
                />
                <button
                  className="manage-item"
                  onClick={() => {
                    setSelected(item);
                    setForm({
                      participant_name: item.participant_name,
                      role: item.role ?? "",
                      team: item.team ?? "",
                      specific_district: item.specific_district ?? "",
                      school: item.school ?? "",
                      gender: item.gender ?? "",
                      tshirt_size: item.tshirt_size ?? "",
                    });
                  }}
                >
                  <strong>{item.participant_name}</strong>
                  <small>
                    {item.role} · {item.team || "No team"} ·{" "}
                    {item.school || "No school"}
                  </small>
                </button>
              </div>
            ))}
          </div>
          {!qualifiers.length && (
            <p className="empty">No qualifiers recorded yet.</p>
          )}
          {selectedIds.length > 0 && (
            <button
              className="button-danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${selectedIds.length} selected qualifier(s)?`,
                  )
                ) {
                  setBusy(true);
                  void bulkDeleteQualifiers(selectedIds)
                    .then(async () => {
                      setQualifiers(
                        (await loadQualifiers()).filter(
                          (row) => row.event_id === eventId,
                        ),
                      );
                      setSelectedIds([]);
                      setNotice("Selected qualifiers deleted.");
                    })
                    .catch((cause) => setError(message(cause)))
                    .finally(() => setBusy(false));
                }
              }}
            >
              Delete selected ({selectedIds.length})
            </button>
          )}
        </div>
        <div>
          <form className="form-stack" onSubmit={submit}>
            <h2>{selected ? "Edit qualifier" : "Add qualifier"}</h2>
            <label>
              Name
              <input
                required
                value={form.participant_name}
                onChange={(change) =>
                  setForm({ ...form, participant_name: change.target.value })
                }
              />
            </label>
            <div className="form-two">
              <label>
                Role
                <input
                  value={form.role}
                  onChange={(change) =>
                    setForm({ ...form, role: change.target.value })
                  }
                />
              </label>
              <label>
                Team
                <select
                  value={form.team}
                  onChange={(change) =>
                    setForm({ ...form, team: change.target.value })
                  }
                >
                  <option value="">Select team</option>
                  {data.teams.map((team) => (
                    <option key={team.id} value={team.name}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-two">
              <label>
                Specific district
                <input
                  value={form.specific_district}
                  onChange={(change) =>
                    setForm({ ...form, specific_district: change.target.value })
                  }
                />
              </label>
              <label>
                School
                <input
                  value={form.school}
                  onChange={(change) =>
                    setForm({ ...form, school: change.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-two">
              <label>
                Gender
                <input
                  value={form.gender}
                  onChange={(change) =>
                    setForm({ ...form, gender: change.target.value })
                  }
                />
              </label>
              <label>
                T-shirt size
                <input
                  value={form.tshirt_size}
                  onChange={(change) =>
                    setForm({ ...form, tshirt_size: change.target.value })
                  }
                />
              </label>
            </div>
            <div className="button-row">
              <button disabled={busy}>
                {busy ? "Saving…" : "Save qualifier"}
              </button>
              {selected && (
                <button
                  className="button-outline"
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setForm({
                      participant_name: "",
                      role: "Athlete",
                      team: "",
                      specific_district: "",
                      school: "",
                      gender: "",
                      tshirt_size: "",
                    });
                  }}
                >
                  Cancel edit
                </button>
              )}
              {selected && (
                <button
                  className="button-danger"
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete ${selected.participant_name}?`))
                      void removeQualifier(selected.id)
                        .then(async () => {
                          setQualifiers(
                            (await loadQualifiers()).filter(
                              (row) => row.event_id === eventId,
                            ),
                          );
                          setSelected(null);
                        })
                        .catch((cause) => setError(message(cause)));
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </form>
          <div className="bulk-box form-stack">
            <h2>Add several qualifiers</h2>
            <p>
              One name per line. The team and other details above will be used
              for each new person.
            </p>
            <label>
              Names
              <textarea
                rows={5}
                value={bulkNames}
                onChange={(change) => setBulkNames(change.target.value)}
                placeholder="One participant per line"
              />
            </label>
            <button
              disabled={busy || !bulkNames.trim()}
              onClick={() => {
                setBusy(true);
                setError("");
                void bulkAddQualifiers(eventId, bulkNames.split(/\r?\n/), {
                  role: form.role,
                  team: form.team,
                  specific_district: form.specific_district,
                  school: form.school,
                  gender: form.gender,
                  tshirt_size: form.tshirt_size,
                })
                  .then(async () => {
                    setQualifiers(
                      (await loadQualifiers()).filter(
                        (row) => row.event_id === eventId,
                      ),
                    );
                    setBulkNames("");
                    setNotice("Qualifiers added.");
                  })
                  .catch((cause) => setError(message(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Add all names
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
