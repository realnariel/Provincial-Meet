import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AppData } from "./App";
import {
  bulkDeleteQualifiers,
  clearResult,
  loadQualifiers,
  saveQualifier,
  saveQualifiers,
  saveResult,
} from "./data";
import { MEDALS, eventAwards } from "./awards";
import { districtsForTeam } from "./districts";
import { winnerNames, type Coordinator, type Medal, type MeetEvent, type Qualifier } from "./types";

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

function winnerNameOptions(data: AppData) {
  const names = new Map<string, string>();
  for (const award of data.awards) {
    for (const name of winnerNames(award.winner_names)) {
      const key = name.toLocaleLowerCase();
      if (!names.has(key)) names.set(key, name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

type AwardDraft = { key: number; medal: Medal; team_id: number | null; winner_names: string };

function initialAwardDrafts(data: AppData, event: MeetEvent | undefined): AwardDraft[] {
  return MEDALS.flatMap((medal): AwardDraft[] => {
    const existing = event ? eventAwards(data, event, medal) : [];
    return existing.length
      ? existing.map((award, index) => ({ key: MEDALS.indexOf(medal) * 1000 + index, medal, team_id: award.team_id, winner_names: award.winner_names ?? "" }))
      : [{ key: MEDALS.indexOf(medal) * 1000, medal, team_id: null, winner_names: "" }];
  });
}

function currentWinnerLine(value: string, caret: number) {
  const start = value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const next = value.indexOf("\n", caret);
  return { start: caret === 0 ? 0 : start, end: next < 0 ? value.length : next };
}

function WinnerNameField({
  id,
  label,
  value,
  names,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  names: string[];
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = `${id}-suggestions`;
  const line = currentWinnerLine(value, caret);
  const query = value.slice(line.start, caret).trim().toLocaleLowerCase();
  const otherNames = new Set(winnerNames(`${value.slice(0, line.start)}\n${value.slice(line.end)}`).map((name) => name.toLocaleLowerCase()));
  const matches = open && query.length >= 2
    ? names.filter((name) => name.toLocaleLowerCase().includes(query) && !otherNames.has(name.toLocaleLowerCase())).slice(0, 8)
    : [];

  function choose(name: string) {
    const position = input.current?.selectionStart ?? caret;
    const currentLine = currentWinnerLine(value, position);
    onChange(value.slice(0, currentLine.start) + name + value.slice(currentLine.end));
    setCaret(currentLine.start + name.length);
    setOpen(false);
    setActive(-1);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(currentLine.start + name.length, currentLine.start + name.length);
    });
  }

  return (
    <div className="winner-name-field" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label htmlFor={id} className="sr-only">{label} athlete names</label>
      <textarea id={id} ref={input} rows={5} value={value}
        placeholder="Athlete Name(s)\nPress Enter for next line"
        aria-autocomplete="list" aria-controls={listId}
        aria-activedescendant={active >= 0 && matches[active] ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setActive(-1);
          setOpen(true);
        }}
        onClick={(event) => {
          setCaret(event.currentTarget.selectionStart);
          setActive(-1);
          setOpen(true);
        }}
        onKeyUp={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            setCaret(event.currentTarget.selectionStart);
            setActive(-1);
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Enter") {
            setOpen(false);
            setActive(-1);
            return;
          }
          if (!matches.length) return;
          if (event.key === "Tab" && active >= 0) {
            event.preventDefault();
            choose(matches[active]);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
          }
        }} />
      {matches.length > 0 && <div id={listId} className="winner-name-suggestions" role="listbox" aria-label="Recorded winner names">
        {matches.map((name, index) => <button key={name} id={`${listId}-${index}`} type="button" role="option"
          aria-selected={active === index} className={active === index ? "active" : ""}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(name)}>{name}</button>)}
      </div>}
      <small>Type a name for suggestions. Use Arrow Down and Tab, or click a name. Enter starts a new athlete line.</small>
    </div>
  );
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
  const nextKey = useRef(3000);
  const [drafts, setDrafts] = useState(() => initialAwardDrafts(data, event));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const recordedNames = useMemo(() => winnerNameOptions(data), [data.awards]);

  useEffect(() => {
    setDrafts(initialAwardDrafts(data, data.events.find((item) => item.id === eventId)));
  }, [eventId]);

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
    if (!drafts.some((draft) => draft.team_id !== null)) {
      setError("Select a team for at least one award before publishing.");
      return;
    }
    if (drafts.some((draft) => draft.team_id === null && draft.winner_names.trim())) {
      setError("Select a team for every athlete name, or clear that name before publishing.");
      return;
    }
    const filled = drafts.filter((draft) => draft.team_id !== null);
    const unique = new Set(filled.map((draft) => `${draft.medal}|${draft.team_id}|${draft.winner_names.trim().toLocaleLowerCase()}`));
    if (unique.size !== filled.length) {
      setError("The same team and athlete names cannot be entered twice for one medal.");
      return;
    }
    await run(
      () => saveResult(event!, filled
        .map((draft) => ({ medal: draft.medal, team_id: draft.team_id!, winner_names: draft.winner_names.trim() || null })), profile.username),
      "Official results published successfully.",
    );
  }

  const medals = [
    { key: "gold", medal: "Gold", label: "Gold medalist", icon: "🥇" },
    { key: "silver", medal: "Silver", label: "Silver medalist", icon: "🥈" },
    { key: "bronze", medal: "Bronze", label: "Bronze medalist", icon: "🥉" },
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
          {medals.map(({ key, medal, label, icon }) => (
              <section className={`medal-panel ${key}`} key={key}>
                <h2><span aria-hidden="true">{icon}</span> {label}</h2>
                {drafts.filter((draft) => draft.medal === medal).map((draft, index) => (
                  <div className="award-entry" key={draft.key}>
                    <div className="award-entry-heading">
                      <strong>{index === 0 ? label : `Additional ${medal} award ${index + 1}`}</strong>
                      {index > 0 && <button type="button" className="award-remove" aria-label={`Remove ${medal} award ${index + 1}`}
                        onClick={() => setDrafts((previous) => previous.filter((item) => item.key !== draft.key))}>Remove</button>}
                    </div>
                    <label>
                      <span className="sr-only">{medal} award {index + 1} team</span>
                      <select value={draft.team_id ?? ""} onChange={(change) => setDrafts((previous) => previous.map((item) => item.key === draft.key
                        ? { ...item, team_id: change.target.value ? Number(change.target.value) : null } : item))}>
                        <option value="">-- Select team or leave blank --</option>
                        {data.teams.map((team) => (
                          <option key={team.id} value={team.id}>{team.acronym} — {team.name}</option>
                        ))}
                      </select>
                    </label>
                    <WinnerNameField id={`${key}-winner-names-${draft.key}`} label={`${label} ${index + 1}`} value={draft.winner_names}
                      names={recordedNames} onChange={(value) => setDrafts((previous) => previous.map((item) => item.key === draft.key
                        ? { ...item, winner_names: value } : item))} />
                  </div>
                ))}
                <button type="button" className="award-add" disabled={drafts.length >= 100} onClick={() => setDrafts((previous) => [...previous,
                  { key: nextKey.current++, medal, team_id: null, winner_names: "" }])}>
                  <i className="bi bi-plus-circle" aria-hidden="true" /> Add another {medal} award
                </button>
              </section>
          ))}
        </div>
        <p className="award-rule-note">Ties can have multiple awards of the same medal. Leave a medal blank if no award is given; Silver and Bronze are not skipped automatically.</p>

        <div className="scoring-actions">
          <div>
            <button type="button" className="danger-outline" disabled={busy || event.status !== "Completed"}
              onClick={() => {
                if (window.confirm("Clear this result and all delegation participants for this event?"))
                  void run(async () => {
                    await clearResult(event.id);
                    setDrafts(initialAwardDrafts({ ...data, awards: [] }, event));
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
    for (const award of eventAwards(data, event).filter((item) => item.medal !== "Gold")) {
      const team = data.teams.find((item) => item.id === award.team_id)?.name;
      if (!team) continue;
      for (const name of winnerNames(award.winner_names)) {
        rows.push({
          key: `${name.toLowerCase()}|${team.toLowerCase()}`,
          name,
          team,
          medal: award.medal as "Silver" | "Bronze",
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

function DistrictField({
  team,
  teams,
  value,
  onChange,
  label,
}: {
  team: string | null;
  teams: AppData["teams"];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const districts = districtsForTeam(team, teams);
  const [manualTeam, setManualTeam] = useState<string | null>(null);
  if (!districts) return (
    <input aria-label={label} value={value} placeholder="District"
      onChange={(change) => onChange(change.target.value)} />
  );
  const manual = manualTeam === team || Boolean(value && !districts.includes(value));
  return (
    <div className="district-field">
      <select aria-label={label} value={manual ? "__manual__" : value} onChange={(change) => {
        const selected = change.target.value;
        setManualTeam(selected === "__manual__" ? team : null);
        onChange(selected === "__manual__" ? "" : selected);
      }}>
        <option value="">Select district</option>
        {districts.map((district) => <option key={district} value={district}>{district}</option>)}
        <option value="__manual__">Enter district manually</option>
      </select>
      {manual && <input aria-label={`Manual ${label}`} value={value} placeholder="Type district name"
        onChange={(change) => {
          setManualTeam(team);
          onChange(change.target.value);
        }} />}
    </div>
  );
}

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
    setParticipants((rows) => rows.map((row) => row.id === id
      ? { ...row, [field]: value, ...(field === "team" ? { specific_district: null } : {}) }
      : row));
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
      <label><span>District</span>
        <DistrictField team={participant.team} teams={data.teams} value={participant.specific_district ?? ""}
          onChange={(value) => updateParticipant(participant.id, "specific_district", value)} label={`District for ${participant.participant_name}`} />
      </label>
      <label><span>School</span><input value={participant.school ?? ""} placeholder="School name"
        onChange={(change) => updateParticipant(participant.id, "school", change.target.value)} /></label>
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
              onChange={(change) => setForm({ ...form, team: change.target.value, specific_district: "" })}>
              <option value="">Select Team</option>
              {data.teams.map((team) => <option key={team.id} value={team.name}>{team.acronym} — {team.name}</option>)}
            </select></label>
            <label className="delegation-location-field">
              <span>District</span><DistrictField team={form.team} teams={data.teams} value={form.specific_district}
                onChange={(value) => setForm({ ...form, specific_district: value })} label="District" />
            </label>
            <label className="delegation-location-field"><span>School</span>
              <input placeholder="School name" value={form.school}
                onChange={(change) => setForm({ ...form, school: change.target.value })} />
            </label>
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
              <thead><tr><th>Select</th><th>Participant Name</th><th>Team</th><th>District</th><th>School</th><th>Role</th><th>T-Shirt Size</th></tr></thead>
              <tbody>{participants.map((participant) => <tr key={participant.id}>
                <td><input type="checkbox" aria-label={`Select ${participant.participant_name}`} checked={selectedIds.includes(participant.id)}
                  onChange={(change) => setSelectedIds((previous) => change.target.checked ? [...previous, participant.id] : previous.filter((id) => id !== participant.id))} /></td>
                <td><input required value={participant.participant_name} onChange={(change) => updateParticipant(participant.id, "participant_name", change.target.value)} /></td>
                <td><select value={participant.team ?? ""} onChange={(change) => updateParticipant(participant.id, "team", change.target.value)}><option value="">Select team</option>{data.teams.map((team) => <option key={team.id} value={team.name}>{team.acronym}</option>)}</select></td>
                <td><DistrictField team={participant.team} teams={data.teams} value={participant.specific_district ?? ""}
                  onChange={(value) => updateParticipant(participant.id, "specific_district", value)} label={`District for ${participant.participant_name}`} /></td>
                <td><input aria-label={`School for ${participant.participant_name}`} placeholder="School name" value={participant.school ?? ""}
                  onChange={(change) => updateParticipant(participant.id, "school", change.target.value)} /></td>
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
