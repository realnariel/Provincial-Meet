import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  const [error, setError] = useState("");
  useEffect(() => {
    if (admin)
      void loadCoordinators()
        .then(setCoordinators)
        .catch((cause) => setError(message(cause)));
  }, [admin]);

  if (admin && section === "coordinators") {
    return (
      <CoordinatorAdmin
        coordinators={coordinators}
        loadError={error}
        reload={async () => setCoordinators(await loadCoordinators())}
      />
    );
  }

  return (
    <EventManagement
      data={data}
      profile={profile}
      admin={admin}
      coordinators={coordinators}
      loadError={error}
      refresh={refresh}
      navigate={navigate}
    />
  );
}

const MANAGE_FILTERS_KEY = "prov_manage_event_filters";

function EventManagement({
  data,
  profile,
  admin,
  coordinators,
  loadError,
  refresh,
  navigate,
}: {
  data: AppData;
  profile: Coordinator;
  admin: boolean;
  coordinators: Coordinator[];
  loadError: string;
  refresh: () => Promise<void>;
  navigate: Nav;
}) {
  const [selected, setSelected] = useState<MeetEvent | null>(null);
  const [form, setForm] = useState({ ...blankEvent });
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("All Divisions");
  const [sportFilter, setSportFilter] = useState("All Sports");
  const [assignmentValues, setAssignmentValues] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(loadError);
  const editorRef = useRef<HTMLDivElement>(null);
  const sports = useMemo(
    () => [...new Set(data.events.map((item) => item.sport_name).filter((value): value is string => Boolean(value)))].sort(),
    [data.events],
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.events.filter((event) => {
      if (!admin && event.coordinatorid !== profile.id) return false;
      if (divisionFilter !== "All Divisions" && event.division !== divisionFilter) return false;
      if (sportFilter !== "All Sports" && event.sport_name !== sportFilter) return false;
      return !query || `${event.title} ${event.sport_name ?? ""}`.toLowerCase().includes(query);
    });
  }, [data.events, admin, profile.id, search, divisionFilter, sportFilter]);

  useEffect(() => {
    const saved = sessionStorage.getItem(MANAGE_FILTERS_KEY);
    if (saved) {
      try {
        const filters = JSON.parse(saved) as { search?: string; division?: string; sport?: string };
        setSearch(filters.search ?? "");
        setDivisionFilter(filters.division ?? "All Divisions");
        setSportFilter(filters.sport ?? "All Sports");
      } catch { sessionStorage.removeItem(MANAGE_FILTERS_KEY); }
    }
    if (sessionStorage.getItem("prov_manage_new_event") === "1") {
      sessionStorage.removeItem("prov_manage_new_event");
      setSelected(null);
      setForm({ ...blankEvent });
      setEditorOpen(true);
      window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, []);
  useEffect(() => {
    sessionStorage.setItem(MANAGE_FILTERS_KEY, JSON.stringify({ search, division: divisionFilter, sport: sportFilter }));
  }, [search, divisionFilter, sportFilter]);

  function openEditor(event?: MeetEvent) {
    setSelected(event ?? null);
    setForm(event ? {
      title: event.title,
      sport_name: event.sport_name ?? "",
      sport_category: event.sport_category ?? "Boys",
      event_category: event.event_category ?? "Individual",
      division: event.division,
      coordinatorid: event.coordinatorid,
      status: event.status,
    } : { ...blankEvent });
    setEditorOpen(true);
    setNotice("");
    setError("");
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function resetFilters() {
    setSearch("");
    setDivisionFilter("All Divisions");
    setSportFilter("All Sports");
  }
  async function submitEvent(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveEvent({ ...form, id: selected?.id });
      await refresh();
      setNotice(selected ? "Event updated successfully." : "Event created successfully.");
      setSelected(null);
      setForm({ ...blankEvent });
      setEditorOpen(false);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  async function deleteEvent(event: MeetEvent) {
    if (!window.confirm(`Delete ${event.title}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await removeEvent(event.id);
      await refresh();
      setAssignmentValues((current) => {
        const next = { ...current };
        delete next[event.id];
        return next;
      });
      if (selected?.id === event.id) { setSelected(null); setEditorOpen(false); }
      setNotice("Event deleted.");
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  async function saveAssignments() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const changes = Object.entries(assignmentValues);
      const { error: updateError } = await requireSupabase()
        .rpc("prov_set_event_assignments", {
          p_assignments: changes.map(([id, value]) => ({
            event_id: Number(id), coordinator_id: value ? Number(value) : null,
          })),
        });
      if (updateError) throw updateError;
      await refresh();
      setAssignmentValues({});
      setNotice(`${changes.length} assignment(s) saved.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel staff-admin-page">
      <div className="staff-page-header">
        <div>
          <span className="staff-page-icon"><i className="bi bi-calendar2-week" aria-hidden="true" /></span>
          <div><h1>Event Management</h1><p>Administer events, divisions, and coordinators</p></div>
        </div>
        {admin && <button type="button" onClick={() => openEditor()}><i className="bi bi-plus-lg" /> Add Event</button>}
      </div>
      {notice && <div className="alert success" role="status">{notice}</div>}
      {error && <div className="alert error" role="alert">{error}</div>}
      {editorOpen && admin && (
        <div className="staff-form-card" ref={editorRef}>
          <div className="staff-card-heading"><h2>{selected ? "Edit Event" : "Add Event"}</h2><button type="button" className="staff-close-button" onClick={() => setEditorOpen(false)} aria-label="Close event form"><i className="bi bi-x-lg" /></button></div>
          <form onSubmit={submitEvent} className="form-stack">
            <label>Event Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
            <div className="form-two">
              <label>Sports Name<input value={form.sport_name} onChange={(event) => setForm({ ...form, sport_name: event.target.value })} required /></label>
              <label>Division<select value={form.division} onChange={(event) => setForm({ ...form, division: event.target.value as Division })}>{DIVISIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
            </div>
            <div className="form-two">
              <label>Type<select value={form.event_category} onChange={(event) => setForm({ ...form, event_category: event.target.value })}><option>Individual</option><option>Team</option><option>Demonstration</option></select></label>
              <label>Category<select value={form.sport_category} onChange={(event) => setForm({ ...form, sport_category: event.target.value })}>{SPORTS_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
            </div>
            <div className="form-two">
              <label>Assigned Coordinator<select value={form.coordinatorid ?? ""} onChange={(event) => setForm({ ...form, coordinatorid: event.target.value ? Number(event.target.value) : null })}><option value="">Unassigned</option>{coordinators.map((item) => <option key={item.id} value={item.id}>{item.fullname}</option>)}</select></label>
              <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as MeetEvent["status"] })}><option>Pending</option><option>Completed</option></select></label>
            </div>
            <div className="button-row"><button disabled={busy}>{busy ? "Saving…" : selected ? "Save Changes" : "Create Event"}</button><button type="button" className="button-outline" onClick={() => setEditorOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      <div className="staff-filter-bar">
        <label><span>Search</span><div className="staff-search-input"><i className="bi bi-search" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event title or sport" /></div></label>
        <label><span>Division</span><select value={divisionFilter} onChange={(event) => setDivisionFilter(event.target.value)}><option>All Divisions</option>{DIVISIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Sport</span><select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}><option>All Sports</option>{sports.map((value) => <option key={value}>{value}</option>)}</select></label>
        <button type="button" className="button-outline staff-reset-button" onClick={resetFilters}><i className="bi bi-arrow-counterclockwise" /> Reset</button>
      </div>
      <p className="staff-result-count">Showing {visible.length} of {admin ? data.events.length : data.events.filter((item) => item.coordinatorid === profile.id).length} events</p>
      <div className="staff-table-card">
        <table className="staff-responsive-table event-admin-table">
          <thead>
            <tr><th>Classification</th><th>Event Title</th>{admin && <th>Assigned Coordinator</th>}<th>Action</th></tr>
          </thead>
          <tbody>
            {visible.map((event) => (
              <tr key={event.id}>
                <td data-label="Classification"><div className="staff-badge-stack"><span className="staff-division-badge">{event.division}</span><span>{event.sport_name || "No sport"}</span></div></td>
                <td data-label="Event Title"><strong className="staff-event-title">{event.title}</strong><small>{event.sport_category || "Open"} · {event.event_category || "Event"} · <span className={event.status === "Completed" ? "staff-status completed" : "staff-status"}>{event.status}</span></small></td>
                {admin && <td data-label="Coordinator"><select aria-label={`Coordinator for ${event.title}`} value={assignmentValues[event.id] ?? String(event.coordinatorid ?? "")} onChange={(change) => setAssignmentValues({ ...assignmentValues, [event.id]: change.target.value })}><option value="">Unassigned</option>{coordinators.map((item) => <option key={item.id} value={item.id}>{item.fullname}</option>)}</select></td>}
                <td data-label="Action"><div className="staff-actions"><button type="button" className="staff-icon-button edit" onClick={() => admin ? openEditor(event) : navigate(`/scoring/${event.id}`)} aria-label={admin ? `Edit ${event.title}` : `Enter results for ${event.title}`}><i className={admin ? "bi bi-pencil-square" : "bi bi-trophy"} /></button>{admin && <button type="button" className="staff-icon-button delete" disabled={busy} onClick={() => void deleteEvent(event)} aria-label={`Delete ${event.title}`}><i className="bi bi-trash3" /></button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && <p className="empty">No events match the selected filters.</p>}
      {admin && <div className="staff-save-row"><button disabled={busy || !Object.keys(assignmentValues).length} onClick={() => void saveAssignments()}><i className="bi bi-floppy" /> {busy ? "Saving…" : `Save Coordinator Assignments${Object.keys(assignmentValues).length ? ` (${Object.keys(assignmentValues).length})` : ""}`}</button></div>}
    </section>
  );
}

function CoordinatorAdmin({
  coordinators,
  loadError,
  reload,
}: {
  coordinators: Coordinator[];
  loadError: string;
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
  const [showCreate, setShowCreate] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  async function request(action: string, extra: Record<string, unknown>, success: string) {
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
      setNotice(success);
      return true;
    } catch (cause) {
      setError(message(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function createCoordinator(event: FormEvent) {
    event.preventDefault();
    const success = await request("create", { username, fullname, password, isAdmin }, "Coordinator account created.");
    if (success) { setUsername(""); setFullname(""); setPassword(""); setIsAdmin(false); setShowCreate(false); }
  }
  function beginEdit(item: Coordinator) {
    setEditing(item.id);
    setEditName(item.fullname);
    setEditAdmin(item.is_admin);
    setResetPassword("");
    setNotice("");
    setError("");
    window.setTimeout(() => editRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  return (
    <section className="panel staff-admin-page">
      <div className="staff-page-header"><div><span className="staff-page-icon"><i className="bi bi-people-fill" /></span><div><h1>Coordinator Directory</h1><p>Manage system access credentials</p></div></div><button type="button" onClick={() => { setShowCreate(true); setEditing(null); }}><i className="bi bi-person-plus-fill" /> Add New</button></div>
      {(error || loadError) && <div className="alert error" role="alert">{error || loadError}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {showCreate && <div className="staff-form-card"><div className="staff-card-heading"><h2>Add Coordinator</h2><button type="button" className="staff-close-button" onClick={() => setShowCreate(false)} aria-label="Close coordinator form"><i className="bi bi-x-lg" /></button></div><form className="form-stack" onSubmit={createCoordinator}><div className="form-two"><label>Full Name<input value={fullname} onChange={(event) => setFullname(event.target.value)} required /></label><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} pattern="[a-zA-Z0-9._-]+" required /></label></div><label>Account Password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label><label className="checkbox"><input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} /> Administrator access</label><div className="button-row"><button disabled={busy}>{busy ? "Creating…" : "Create Account"}</button><button type="button" className="button-outline" onClick={() => setShowCreate(false)}>Cancel</button></div></form></div>}
      <div className="staff-table-card"><table className="staff-responsive-table coordinator-admin-table"><thead><tr><th>Full Name</th><th>Username</th><th>Access Level</th><th>Actions</th></tr></thead><tbody>{coordinators.map((item) => <tr key={item.id}><td data-label="Full Name"><strong>{item.fullname}</strong></td><td data-label="Username">@{item.username}</td><td data-label="Access Level"><span className={item.is_admin ? "staff-role-badge admin" : "staff-role-badge"}>{item.is_admin ? "Administrator" : "Coordinator"}</span></td><td data-label="Actions"><div className="staff-actions"><button type="button" className="staff-icon-button edit" disabled={busy} onClick={() => beginEdit(item)} aria-label={`Edit ${item.fullname}`}><i className="bi bi-pencil-square" /></button><button type="button" className="staff-icon-button delete" disabled={busy} onClick={() => { if (window.confirm(`Delete coordinator ${item.username}?`)) void request("delete", { id: item.id }, "Coordinator account deleted."); }} aria-label={`Delete ${item.fullname}`}><i className="bi bi-trash3" /></button></div></td></tr>)}</tbody></table></div>
      {!coordinators.length && !loadError && <p className="empty">No coordinator accounts found.</p>}
      {editing !== null && (() => { const item = coordinators.find((value) => value.id === editing); if (!item) return null; return <div className="staff-form-card" ref={editRef}><div className="staff-card-heading"><h2>Edit Coordinator</h2><button type="button" className="staff-close-button" onClick={() => setEditing(null)} aria-label="Close edit form"><i className="bi bi-x-lg" /></button></div><div className="form-stack"><label>Username<input value={item.username} disabled /></label><label>Full Name<input value={editName} onChange={(event) => setEditName(event.target.value)} required /></label><label className="checkbox"><input type="checkbox" checked={editAdmin} onChange={(event) => setEditAdmin(event.target.checked)} /> Administrator access</label><div className="button-row"><button type="button" disabled={busy || !editName.trim()} onClick={async () => { const success = await request("update", { id: item.id, fullname: editName, isAdmin: editAdmin }, "Coordinator details updated."); if (success) setEditing(null); }}>{busy ? "Saving…" : "Save Details"}</button></div><div className="staff-password-reset"><h3>Reset Password</h3><label>New Temporary Password<input type="password" autoComplete="new-password" minLength={6} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label><button type="button" className="button-outline" disabled={busy || resetPassword.length < 6} onClick={async () => { const success = await request("reset-password", { id: item.id, password: resetPassword }, "Password reset successfully."); if (success) setResetPassword(""); }}>Reset Password</button></div></div></div>; })()}
    </section>
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
