import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppData } from "./App";
import {
  bulkDeleteQualifiers,
  clearResult,
  loadQualifiers,
  saveQualifier,
  saveQualifiers,
  saveResult,
} from "./data";
import { winnerNames, type Coordinator, type MeetEvent, type Qualifier } from "./types";

type Nav = (path: string) => void;

function problemMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    const value = (cause as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) return value;
  }
  return "The operation could not be completed.";
}

function displayDate(value: string | null) {
  if (!value) return "Not updated yet";
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function accessAllowed(event: MeetEvent | undefined, profile: Coordinator) {
  return Boolean(event && (profile.is_admin || event.coordinatorid === profile.id));
}

function Unavailable({ navigate, message = "You may submit results only for events assigned to you." }: { navigate: Nav; message?: string }) {
  return (
    <section className="panel state-message">
      <h1>Event unavailable</h1>
      <p>{message}</p>
      <button onClick={() => navigate("/events")}>Back to Events</button>
    </section>
  );
}

export function OfficialScoringPage({
  data,
  eventId,
  profile,
  refresh,
  navigate,
}: {
  data: AppData;
  eventId: number;
  profile: Coordinator;
  refresh: () => Promise<void>;
  navigate: Nav;
}) {
  const event = data.events.find((item) => item.id === eventId);
  const [result, setResult] = useState(() => ({
    goldteamid: event?.goldteamid ?? null,
    silverteamid: event?.silverteamid ?? null,
    bronzeteamid: event?.bronzeteamid ?? null,
    gold_winner_name: event?.gold_winner_name ?? "",
    silver_winner_name: event?.silver_winner_name ?? "",
    bronze_winner_name: event?.bronze_winner_name ?? "",
    status: "Completed" as const,
  }));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  if (!accessAllowed(event, profile) || !event) return <Unavailable navigate={navigate} />;

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (cause) {
      setError(problemMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function publish(formEvent: FormEvent) {
    formEvent.preventDefault();
    await run(
      () => saveResult(event!, result, profile.username),
      "Official results published successfully.",
    );
  }

  const medals = [
    { key: "gold", label: "Gold medalist", icon: "🥇" },
    { key: "silver", label: "Silver medalist", icon: "🥈" },
    { key: "bronze", label: "Bronze medalist", icon: "🥉" },
  ] as const;

  return (
    <section className="workflow-page">
      <button type="button" className="workflow-back" onClick={() => navigate("/events")}>
        <i className="bi bi-arrow-left" aria-hidden="true" /> Back to Events
      </button>
      <form className="workflow-card scoring-card" onSubmit={publish}>
        <div className="scoring-heading">
          <div>
            <h1><i className="bi bi-shield-check" aria-hidden="true" /> Official Scoring</h1>
            <div className="scoring-event-line">
              <span className="workflow-badge division">{event.division}</span>
              <span className="workflow-badge sport">{event.sport_name || "Sport"}</span>
              <strong>{event.title}</strong>
            </div>
          </div>
          <span className={`workflow-status ${event.status.toLowerCase()}`}>{event.status}</span>
        </div>

        <div className="updated-notice">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span>Last updated by: <strong>{event.last_updated_by || "No one yet"}</strong>{event.updatedat ? ` on ${displayDate(event.updatedat)}` : ""}</span>
        </div>
        {notice && <div className="alert success" role="status">{notice}</div>}
        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="medal-grid">
          {medals.map(({ key, label, icon }) => {
            const teamKey = `${key}teamid` as "goldteamid" | "silverteamid" | "bronzeteamid";
            const winnerKey = `${key}_winner_name` as "gold_winner_name" | "silver_winner_name" | "bronze_winner_name";
            return (
              <section className={`medal-panel ${key}`} key={key}>
                <h2><span aria-hidden="true">{icon}</span> {label}</h2>
                <label>
                  <span className="sr-only">{label} team</span>
                  <select value={result[teamKey] ?? ""} onChange={(change) => setResult({
                    ...result,
                    [teamKey]: change.target.value ? Number(change.target.value) : null,
                  })}>
                    <option value="">-- Select team --</option>
                    {data.teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.acronym} — {team.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">{label} athlete names</span>
                  <textarea rows={5} value={result[winnerKey]}
                    placeholder={key === "bronze" ? "Athlete Name(s)\nPress Enter for next line" : "Athlete Name(s)"}
                    onChange={(change) => setResult({ ...result, [winnerKey]: change.target.value })} />
                </label>
                <small>Enter one athlete per line.</small>
              </section>
            );
          })}
        </div>

        <div className="scoring-actions">
          <div>
            <button type="button" className="danger-outline" disabled={busy || event.status !== "Completed"}
              onClick={() => {
                if (window.confirm("Clear this result and all delegation participants for this event?"))
                  void run(async () => {
                    await clearResult(event.id);
                    setResult({
                      goldteamid: null, silverteamid: null, bronzeteamid: null,
                      gold_winner_name: "", silver_winner_name: "", bronze_winner_name: "", status: "Completed",
                    });
                  }, "The result and delegation were cleared.");
              }}>
              Clear All Data
            </button>
            {event.status === "Completed" && (
              <button type="button" className="delegation-button" onClick={() => navigate(`/delegation/${event.id}`)}>
                <i className="bi bi-people-fill" aria-hidden="true" /> Manage Delegation
              </button>
            )}
          </div>
          <button className="publish-button" disabled={busy}>
            {busy ? "Publishing…" : "Publish Official Results"}
          </button>
        </div>
      </form>
    </section>
  );
}

type WinnerCandidate = {
  key: string;
  name: string;
  team: string;
  medal: "Silver" | "Bronze";
  eventTitle: string;
  gender: string | null;
};

function winnerCandidates(data: AppData, current: MeetEvent): WinnerCandidate[] {
  const rows: WinnerCandidate[] = [];
  for (const event of data.events) {
    if (event.status !== "Completed" || event.division !== current.division || event.sport_name !== current.sport_name) continue;
    const medals = [
      ["Silver", event.silverteamid, event.silver_winner_name],
      ["Bronze", event.bronzeteamid, event.bronze_winner_name],
    ] as const;
    for (const [medal, teamId, names] of medals) {
      const team = data.teams.find((item) => item.id === teamId)?.name;
      if (!team) continue;
      for (const name of winnerNames(names)) {
        rows.push({
          key: `${name.toLowerCase()}|${team.toLowerCase()}`,
          name,
          team,
          medal,
          eventTitle: event.title,
          gender: event.sport_category === "Boys" ? "M" : event.sport_category === "Girls" ? "W" : null,
        });
      }
    }
  }
  return [...new Map(rows.map((row) => [row.key, row])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.team.localeCompare(b.team));
}

const blankParticipant = {
  participant_name: "",
  role: "Athlete",
  team: "",
  specific_district: "",
  school: "",
  gender: "",
  tshirt_size: "",
};

export function DelegationPage({
  data,
  eventId,
  profile,
  navigate,
}: {
  data: AppData;
  eventId: number;
  profile: Coordinator;
  navigate: Nav;
}) {
  const event = data.events.find((item) => item.id === eventId);
  const allowed = accessAllowed(event, profile) && event?.status === "Completed";
  const [participants, setParticipants] = useState<Qualifier[]>([]);
  const [form, setForm] = useState(blankParticipant);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedWinners, setSelectedWinners] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const candidates = useMemo(() => event ? winnerCandidates(data, event) : [], [data, event]);

  async function reload() {
    const rows = await loadQualifiers();
    setParticipants(rows.filter((row) => row.event_id === eventId));
  }

  useEffect(() => {
    if (allowed) void reload().catch((cause) => setError(problemMessage(cause)));
  }, [allowed, eventId]);

  if (!allowed || !event) return <Unavailable navigate={navigate}
    message={event?.status !== "Completed"
      ? "Publish the official results before managing this event's delegation."
      : "You may manage only events assigned to you."} />;

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await reload();
      setNotice(success);
    } catch (cause) {
      setError(problemMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addParticipant(formEvent: FormEvent) {
    formEvent.preventDefault();
    await run(async () => {
      await saveQualifier({
        ...form,
        event_id: event!.id,
        gender: form.gender || (event!.sport_category === "Boys" ? "M" : event!.sport_category === "Girls" ? "W" : null),
      });
      setForm(blankParticipant);
    }, "Participant added successfully.");
  }

  function updateParticipant(id: string, field: keyof Qualifier, value: string) {
    setParticipants((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  const participantFields = (participant: Qualifier) => (
    <>
      <label><span>Participant Name</span><input required value={participant.participant_name}
        onChange={(change) => updateParticipant(participant.id, "participant_name", change.target.value)} /></label>
      <label><span>Team</span><select value={participant.team ?? ""}
        onChange={(change) => updateParticipant(participant.id, "team", change.target.value)}>
        <option value="">Select team</option>
        {data.teams.map((team) => <option key={team.id} value={team.name}>{team.acronym} — {team.name}</option>)}
      </select></label>
      <label><span>School / District</span><input value={participant.specific_district ?? ""}
        onChange={(change) => updateParticipant(participant.id, "specific_district", change.target.value)} /></label>
      <label><span>Role</span><select value={participant.role ?? "Athlete"}
        onChange={(change) => updateParticipant(participant.id, "role", change.target.value)}>
        {['Athlete', 'Coach', 'Assistant Coach', 'Chaperon'].map((role) => <option key={role}>{role}</option>)}
      </select></label>
      <label><span>T-Shirt Size</span><select value={participant.tshirt_size ?? ""}
        onChange={(change) => updateParticipant(participant.id, "tshirt_size", change.target.value)}>
        <option value="">Select size</option>
        {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((size) => <option key={size}>{size}</option>)}
      </select></label>
    </>
  );

  return (
    <section className="workflow-page">
      <button type="button" className="workflow-back" onClick={() => navigate(`/scoring/${event.id}`)}>
        <i className="bi bi-arrow-left" aria-hidden="true" /> Back to Official Results
      </button>
      <div className="workflow-card delegation-card">
        <div className="delegation-heading">
          <h1><i className="bi bi-people-fill" aria-hidden="true" /> Delegation: {event.sport_name} - {event.title}</h1>
          <p>Manage athletes, coaches, and chaperons for this event.</p>
        </div>
        {notice && <div className="alert success" role="status">{notice}</div>}
        {error && <div className="alert error" role="alert">{error}</div>}

        <form className="add-participant-panel" onSubmit={addParticipant}>
          <h2><i className="bi bi-person-plus-fill" aria-hidden="true" /> Add New Participant</h2>
          <p>Enter a participant manually, or choose recorded winners below.</p>
          <div className="participant-form-grid">
            <label><span className="sr-only">Full name</span><input required placeholder="Full Name" value={form.participant_name}
              onChange={(change) => setForm({ ...form, participant_name: change.target.value })} /></label>
            <label><span className="sr-only">Role</span><select value={form.role}
              onChange={(change) => setForm({ ...form, role: change.target.value })}>
              {['Athlete', 'Coach', 'Assistant Coach', 'Chaperon'].map((role) => <option key={role}>{role}</option>)}
            </select></label>
            <label><span className="sr-only">Team</span><select required value={form.team}
              onChange={(change) => setForm({ ...form, team: change.target.value })}>
              <option value="">Select Team</option>
              {data.teams.map((team) => <option key={team.id} value={team.name}>{team.acronym} — {team.name}</option>)}
            </select></label>
            <label><span className="sr-only">School or district</span><input placeholder="School / district (optional)" value={form.specific_district}
              onChange={(change) => setForm({ ...form, specific_district: change.target.value })} /></label>
            <label><span className="sr-only">T-shirt size</span><select value={form.tshirt_size}
              onChange={(change) => setForm({ ...form, tshirt_size: change.target.value })}>
              <option value="">T-Shirt Size</option>
              {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((size) => <option key={size}>{size}</option>)}
            </select></label>
            <button disabled={busy}><i className="bi bi-plus-lg" aria-hidden="true" /> Add</button>
          </div>
        </form>

        <details className="recorded-winners">
          <summary>Choose recorded Silver and Bronze winners</summary>
          {candidates.length ? (
            <div className="winner-choices">
              {candidates.map((candidate) => {
                const alreadyAdded = participants.some((item) => item.participant_name.toLowerCase() === candidate.name.toLowerCase() && item.team?.toLowerCase() === candidate.team.toLowerCase());
                return <label key={candidate.key}>
                  <input type="checkbox" disabled={alreadyAdded} checked={!alreadyAdded && selectedWinners.includes(candidate.key)}
                    onChange={(change) => setSelectedWinners((previous) => change.target.checked ? [...previous, candidate.key] : previous.filter((key) => key !== candidate.key))} />
                  <span><strong>{candidate.name}</strong><small>{candidate.medal} · {candidate.team} · {candidate.eventTitle}</small></span>
                </label>;
              })}
              <button type="button" disabled={busy || !selectedWinners.length} onClick={() => void run(async () => {
                const chosen = candidates.filter((candidate) => selectedWinners.includes(candidate.key));
                await Promise.all(chosen.map((candidate) => saveQualifier({
                  event_id: event.id, participant_name: candidate.name, role: "Athlete", team: candidate.team,
                  gender: candidate.gender, specific_district: null, school: null, tshirt_size: null,
                })));
                setSelectedWinners([]);
              }, "Selected winners added as athletes.")}>Add selected winners</button>
            </div>
          ) : <p className="empty">No Silver or Bronze winners are available for this sport and division yet.</p>}
        </details>

        <div className="participant-tools">
          <p><i className="bi bi-info-circle" aria-hidden="true" /> Edit participants below, then click <strong>Save All Changes.</strong></p>
          <div>
            <button type="button" className="danger-outline" disabled={busy || !selectedIds.length}
              onClick={() => {
                if (window.confirm(`Delete ${selectedIds.length} selected participant(s)?`))
                  void run(async () => {
                    await bulkDeleteQualifiers(selectedIds);
                    setSelectedIds([]);
                  }, "Selected participants deleted.");
              }}><i className="bi bi-trash" aria-hidden="true" /> Delete Selected</button>
            <button type="button" disabled={busy || !participants.length}
              onClick={() => void run(() => saveQualifiers(participants), "All participant changes saved.")}>
              <i className="bi bi-save" aria-hidden="true" /> Save All Changes
            </button>
          </div>
        </div>

        {participants.length ? <>
          <div className="delegation-table-wrap">
            <table className="delegation-table">
              <thead><tr><th>Select</th><th>Participant Name</th><th>Team</th><th>School / District</th><th>Role</th><th>T-Shirt Size</th></tr></thead>
              <tbody>{participants.map((participant) => <tr key={participant.id}>
                <td><input type="checkbox" aria-label={`Select ${participant.participant_name}`} checked={selectedIds.includes(participant.id)}
                  onChange={(change) => setSelectedIds((previous) => change.target.checked ? [...previous, participant.id] : previous.filter((id) => id !== participant.id))} /></td>
                <td><input required value={participant.participant_name} onChange={(change) => updateParticipant(participant.id, "participant_name", change.target.value)} /></td>
                <td><select value={participant.team ?? ""} onChange={(change) => updateParticipant(participant.id, "team", change.target.value)}><option value="">Select team</option>{data.teams.map((team) => <option key={team.id} value={team.name}>{team.acronym}</option>)}</select></td>
                <td><input value={participant.specific_district ?? ""} onChange={(change) => updateParticipant(participant.id, "specific_district", change.target.value)} /></td>
                <td><select value={participant.role ?? "Athlete"} onChange={(change) => updateParticipant(participant.id, "role", change.target.value)}>{['Athlete', 'Coach', 'Assistant Coach', 'Chaperon'].map((role) => <option key={role}>{role}</option>)}</select></td>
                <td><select value={participant.tshirt_size ?? ""} onChange={(change) => updateParticipant(participant.id, "tshirt_size", change.target.value)}><option value="">—</option>{['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((size) => <option key={size}>{size}</option>)}</select></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="participant-cards">
            {participants.map((participant) => <article key={participant.id}>
              <label className="participant-select"><span>Select Participant</span><input type="checkbox" checked={selectedIds.includes(participant.id)}
                onChange={(change) => setSelectedIds((previous) => change.target.checked ? [...previous, participant.id] : previous.filter((id) => id !== participant.id))} /></label>
              {participantFields(participant)}
            </article>)}
          </div>
        </> : <p className="empty delegation-empty">No participants added yet.</p>}
      </div>
    </section>
  );
}
