import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppData } from "./App";
import { MEET_DATE, MEET_OPENING_AT } from "./meet-config";
import {
  compareMedals,
  DIVISIONS,
  SPORTS_CATEGORIES,
  winnerNames,
  type Coordinator,
  type DivisionFilter,
  type MeetEvent,
} from "./types";

type Nav = (path: string) => void;

const EVENT_FILTERS_KEY = "provincial-meet-event-filters";

type StoredEventFilters = {
  query: string;
  sport: string;
  category: string;
  division: string;
  status: string;
  assignedOnly: boolean;
};

function readEventFilters(): StoredEventFilters {
  const defaults: StoredEventFilters = {
    query: "",
    sport: "All Sports",
    category: "All Categories",
    division: "Overall",
    status: "All Statuses",
    assignedOnly: false,
  };
  try {
    const value = window.sessionStorage.getItem(EVENT_FILTERS_KEY);
    return value ? { ...defaults, ...JSON.parse(value) } : defaults;
  } catch {
    return defaults;
  }
}

const SPORT_ICONS: Record<string, string> = {
  archery: "🏹",
  arnis: "🥋",
  athletics: "🏃",
  badminton: "🏸",
  baseball: "⚾",
  basketball: "🏀",
  billiards: "🎱",
  bocce: "🎯",
  boxing: "🥊",
  chess: "♟️",
  dancesport: "💃",
  football: "⚽",
  futsal: "⚽",
  gymnastics: "🤸",
  "pencak silat": "🥋",
  "sepak takraw": "🏐",
  softball: "🥎",
  swimming: "🏊",
  "table tennis": "🏓",
  taekwondo: "🥋",
  tennis: "🎾",
  volleyball: "🏐",
  weightlifting: "🏋️",
  wrestling: "🤼",
  wushu: "🥋",
};

function sportIcon(sport: string | null) {
  return SPORT_ICONS[sport?.trim().toLowerCase() ?? ""] ?? "🏅";
}

function teamName(data: AppData, id: number | null, short = true) {
  const team = data.teams.find((item) => item.id === id);
  return team ? (short ? team.acronym : team.name) : "—";
}

function medalRows(data: AppData, division: DivisionFilter) {
  return data.teams
    .map((team) => {
      const rows = data.tallies.filter(
        (tally) =>
          tally.teamid === team.id &&
          (division === "Overall"
            ? tally.division !== "Paragames"
            : tally.division === division),
      );
      return {
        team,
        gold: rows.reduce((sum, row) => sum + row.gold, 0),
        silver: rows.reduce((sum, row) => sum + row.silver, 0),
        bronze: rows.reduce((sum, row) => sum + row.bronze, 0),
      };
    })
    .sort(compareMedals);
}

const filters: DivisionFilter[] = ["Overall", ...DIVISIONS];
const awarded = (row: { gold: number; silver: number; bronze: number }) =>
  row.gold + row.silver + row.bronze;
function lastUpdated(events: MeetEvent[]) {
  const latest = [...events]
    .filter((event) => event.status === "Completed" && event.updatedat)
    .sort((a, b) => (b.updatedat ?? "").localeCompare(a.updatedat ?? ""))[0];
  return latest?.updatedat
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      }).format(new Date(latest.updatedat))
    : "Awaiting results";
}
function MedalPill({
  row,
}: {
  row: { gold: number; silver: number; bronze: number };
}) {
  return (
    <span className="medal-pill">
      <span className="medal-text-gold">
        {row.gold}
        <small>G</small>
      </span>
      <span className="medal-text-silver">
        {row.silver}
        <small>S</small>
      </span>
      <span className="medal-text-bronze">
        {row.bronze}
        <small>B</small>
      </span>
    </span>
  );
}
function DivisionTabs({
  value,
  change,
}: {
  value: DivisionFilter;
  change: (division: DivisionFilter) => void;
}) {
  return (
    <div className="division-filters" role="group" aria-label="Division">
      {filters.map((item) => (
        <button
          type="button"
          key={item}
          className={value === item ? "filter-btn active-filter" : "filter-btn"}
          aria-pressed={value === item}
          onClick={() => change(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
function MeetArt() {
  return (
    <img
      className="meet-art"
      src="/images/meet-art.svg"
      alt=""
      aria-hidden="true"
    />
  );
}

function MeetCountdown() {
  const [now, setNow] = useState(() => Date.now());
  const target = new Date(MEET_OPENING_AT).getTime();
  const distance = target - now;
  const day = 86_400_000;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  let value: ReactNode;
  let accessibleValue: string;
  if (distance > day) {
    const days = Math.ceil(distance / day);
    accessibleValue = `${days} ${days === 1 ? "day" : "days"} to go`;
    value = (
      <>
        <span className="poster-days">{days}</span>
        <span className="poster-days-caption">
          {days === 1 ? "Day" : "Days"}<br />to go
        </span>
      </>
    );
  } else if (distance > 0) {
    const hours = Math.floor(distance / 3_600_000);
    const minutes = Math.floor((distance % 3_600_000) / 60_000);
    const seconds = Math.floor((distance % 60_000) / 1_000);
    accessibleValue = `${hours} hours, ${minutes} minutes, ${seconds} seconds to go`;
    value = <span className="poster-countdown-value">{hours}h {minutes}m {seconds}s</span>;
  } else if (distance > -day) {
    accessibleValue = "The event is today";
    value = <span className="poster-countdown-value">Today</span>;
  } else {
    accessibleValue = "Event started";
    value = <span className="poster-countdown-value">Event started</span>;
  }

  return (
    <span className="poster-countdown" role="timer" aria-label={accessibleValue}>
      <i className="bi bi-stopwatch" aria-hidden="true" />
      <span className="poster-countdown-content" aria-hidden="true">{value}</span>
    </span>
  );
}

function MeetPoster() {
  return (
    <section
      className="meet-poster"
      aria-label="Bohol Provincial Athletic Meet 2026"
    >
      <MeetArt />
      <h1 className="poster-title">
        <span className="poster-district">Bohol Provincial Athletic Meet 2026</span>
      </h1>
      <p className="poster-districts">ELEMENTARY · SECONDARY · PARAGAMES</p>
      <p className="poster-theme">“Strong Together. Greater Tomorrow”</p>
      <div className="poster-details">
        <span className="poster-date">▣ &nbsp; {MEET_DATE}</span>
        <MeetCountdown />
      </div>
      <div className="poster-sports" aria-hidden="true">
        <span>⚽</span>
        <span>🏀</span>
        <span>🏸</span>
        <span>🏐</span>
        <span>🏆</span>
      </div>
    </section>
  );
}

function MedalTable({
  data,
  division,
  navigate,
}: {
  data: AppData;
  division: DivisionFilter;
  navigate?: Nav;
}) {
  const rows = medalRows(data, division);
  return (
    <div className="table-scroll">
      <table className="meet-table medal-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th className="medal-header-gold">🥇 G</th>
            <th className="medal-header-silver">🥈 S</th>
            <th className="medal-header-bronze">🥉 B</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const previous = rows[index - 1];
            const rank =
              previous && compareMedals(previous, row) === 0
                ? rows.findIndex(
                    (candidate) => compareMedals(candidate, row) === 0,
                  ) + 1
                : index + 1;
            return (
              <tr
                key={row.team.id}
                className={
                  awarded(row) ? `rank-place-${Math.min(rank, 4)}` : ""
                }
              >
                <td className="rank-cell">
                  {rank <= 3 && awarded(row) ? (
                    <span className={`rank-badge rank-${rank}`}>{rank}</span>
                  ) : (
                    rank
                  )}
                </td>
                <td>
                  {navigate ? (
                    <button
                      className="text-link"
                      onClick={() => navigate(`/teams/${row.team.id}`)}
                    >
                      {row.team.acronym}
                    </button>
                  ) : (
                    row.team.acronym
                  )}
                  <small className="team-fullname">{row.team.name}</small>
                </td>
                <td className="medal-gold">{row.gold}</td>
                <td className="medal-silver">{row.silver}</td>
                <td className="medal-bronze">{row.bronze}</td>
                <td>{row.gold + row.silver + row.bronze}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HomePage({ data, navigate }: { data: AppData; navigate: Nav }) {
  const [division, setDivision] = useState<DivisionFilter>(() => {
    const saved = sessionStorage.getItem("prov_home_top3_division");
    return filters.includes(saved as DivisionFilter)
      ? (saved as DivisionFilter)
      : "Overall";
  });
  const completed = data.events.filter((event) => event.status === "Completed");
  const recent = [...completed]
    .sort((a, b) => (b.updatedat ?? "").localeCompare(a.updatedat ?? ""))
    .slice(0, 6);
  const leaders = medalRows(data, division).filter(awarded).slice(0, 3);
  const medalsWon = data.tallies.reduce((sum, row) => sum + awarded(row), 0);
  const progress = data.events.length
    ? Math.round((completed.length / data.events.length) * 100)
    : 0;
  return (
    <>
      <div className="home-grid">
        <div className="home-banner">
          <MeetPoster />
        </div>
        <section className="home-statistics" aria-labelledby="stats-title">
          <h2 className="section-title" id="stats-title">
            ◫ &nbsp; Statistics
          </h2>
          <div className="stat-grid">
            <div className="glass-card">
              <span className="stat-header">
                Leading Team <span>🏆</span>
              </span>
              <strong className="stat-value-prominent">
                {medalRows(data, "Overall").find(awarded)?.team.acronym ??
                  "TBD"}
              </strong>
              <small className="stat-subtext">Overall Leader</small>
            </div>
            <div className="glass-card">
              <span className="stat-header">
                Finished <span>✓</span>
              </span>
              <strong className="stat-value-prominent">
                {completed.length} / {data.events.length}
              </strong>
              <div className="progress-bar-glass">
                <span
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
                <span className="progress-text">{progress}%</span>
              </div>
            </div>
            <div className="glass-card">
              <span className="stat-header">
                Medals Won <span>🏅</span>
              </span>
              <strong className="stat-value-prominent">{medalsWon}</strong>
              <small className="stat-subtext">awarded so far</small>
            </div>
            <div className="glass-card">
              <span className="stat-header">
                Last Update <span>◷</span>
              </span>
              <strong className="stat-value-prominent stat-date">
                {lastUpdated(data.events)}
              </strong>
              <small className="stat-subtext">Live Data</small>
            </div>
          </div>
        </section>
        <section className="home-top-teams" aria-labelledby="top-teams-title">
          <h2 className="section-title" id="top-teams-title">
            ★ &nbsp; Top 3 Teams
          </h2>
          <DivisionTabs
            value={division}
            change={(value) => {
              setDivision(value);
              sessionStorage.setItem("prov_home_top3_division", value);
            }}
          />
          <div className="top3-grid">
            {leaders.length ? (
              leaders.map((row, index) => (
                <button
                  className="glass-card top3-card"
                  key={row.team.id}
                  onClick={() => navigate(`/teams/${row.team.id}`)}
                >
                  <span className="top3-rank">#{index + 1}</span>
                  <strong>{row.team.acronym}</strong>
                  <MedalPill row={row} />
                </button>
              ))
            ) : (
              <div className="glass-card top3-empty">
                No results recorded yet for {division}.
              </div>
            )}
          </div>
        </section>
        <section className="home-shortcuts" aria-labelledby="shortcuts-title">
          <h2 className="section-title" id="shortcuts-title">
            ▦ &nbsp; Shortcuts
          </h2>
          <div className="shortcut-grid">
            <button className="btn-glass" onClick={() => navigate("/rankings")}>
              <span aria-hidden="true">🏆</span>Rankings
            </button>
            <button className="btn-glass" onClick={() => navigate("/events")}>
              <span aria-hidden="true">🏅</span>Results
            </button>
            <button className="btn-glass" onClick={() => navigate("/teams")}>
              <span aria-hidden="true">👥</span>Teams
            </button>
            <button
              className="btn-glass"
              onClick={() => navigate("/reports/general")}
            >
              <span aria-hidden="true">📊</span>Reports
            </button>
          </div>
        </section>
      </div>
      <section className="panel home-latest">
        <div className="section-heading">
          <div>
            <span className="eyebrow dark">Latest updates</span>
            <h2>Recent results</h2>
          </div>
          <button className="text-link" onClick={() => navigate("/events")}>
            All events →
          </button>
        </div>
        {recent.length ? (
          <div className="result-feed">
            {recent.map((event) => (
              <article key={event.id} className="feed-item">
                <strong>{event.title}</strong>
                <small>
                  {event.sport_name || "Sport"} · {event.division} ·{" "}
                  {event.sport_category || "Open"}
                </small>
                <div className="feed-medals">
                  🥇 {teamName(data, event.goldteamid)}　🥈{" "}
                  {teamName(data, event.silverteamid)}　🥉{" "}
                  {teamName(data, event.bronzeteamid)}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">
            Results will appear here once events are completed.
          </p>
        )}
      </section>
    </>
  );
}

export function RankingsPage({
  data,
  refresh,
}: {
  data: AppData;
  refresh: () => Promise<void>;
}) {
  const [division, setDivision] = useState<DivisionFilter>(() => {
    const saved = sessionStorage.getItem("prov_rankings_division");
    return filters.includes(saved as DivisionFilter)
      ? (saved as DivisionFilter)
      : "Overall";
  });
  const [autoRotating, setAutoRotating] = useState(true);

  // Match the original scoreboard: advance every 10 seconds, then refresh
  // results on the return to Overall. A manual choice pauses for 15 seconds.
  useEffect(() => {
    if (!autoRotating) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const next = filters[(filters.indexOf(division) + 1) % filters.length];
      setDivision(next);
      if (next === "Overall") {
        sessionStorage.setItem("prov_rankings_division", "Overall");
        void refresh();
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [autoRotating, division, refresh]);

  useEffect(() => {
    if (autoRotating) return;
    let idleTimer: number;
    const resumeAfterIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setAutoRotating(true), 15_000);
    };
    resumeAfterIdle();
    window.addEventListener("pointermove", resumeAfterIdle, { passive: true });
    window.addEventListener("keydown", resumeAfterIdle);
    window.addEventListener("touchstart", resumeAfterIdle, { passive: true });
    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", resumeAfterIdle);
      window.removeEventListener("keydown", resumeAfterIdle);
      window.removeEventListener("touchstart", resumeAfterIdle);
    };
  }, [autoRotating]);
  const recent = [...data.events]
    .filter((event) => event.status === "Completed")
    .sort((a, b) => (b.updatedat ?? "").localeCompare(a.updatedat ?? ""))
    .slice(0, 8);
  return (
    <div className="rankings-layout">
      <section className="tally-board">
        <DivisionTabs
          value={division}
          change={(value) => {
            setDivision(value);
            setAutoRotating(false);
            sessionStorage.setItem("prov_rankings_division", value);
          }}
        />
        <header className="tally-hero">
          <MeetArt />
          <p className="tally-district">BOHOL PROVINCIAL</p>
          <h1 className="tally-event">
            ATHLETIC MEET <span>2026</span>
          </h1>
          <p className="tally-areas">ELEMENTARY · SECONDARY · PARAGAMES</p>
        </header>
        <h2 className="tally-title">🏅 &nbsp; MEDAL TALLY &nbsp; 🏅</h2>
        <p className="tally-asof">◷ &nbsp; As of {lastUpdated(data.events)}</p>
        <MedalTable data={data} division={division} />
      </section>
      <aside className="updates-sidebar-card">
        <div className="section-heading">
          <h2>Results</h2>
          <span className="latest-badge">Latest Results</span>
        </div>
        {recent.length ? (
          <div className="result-feed">
            {recent.map((event) => (
              <article key={event.id} className="feed-item">
                <div className="feed-heading">
                  <strong>{event.title}</strong>
                  <small>
                    {event.updatedat
                      ? new Intl.DateTimeFormat("en-PH", {
                          dateStyle: "medium",
                          timeZone: "Asia/Manila",
                        }).format(new Date(event.updatedat))
                      : ""}
                  </small>
                </div>
                <small>
                  {event.sport_name || "Sport"} · {event.division}
                </small>
                <div className="feed-medals">
                  🥇 {teamName(data, event.goldteamid)}　🥈{" "}
                  {teamName(data, event.silverteamid)}　🥉{" "}
                  {teamName(data, event.bronzeteamid)}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">Awaiting news from ongoing match events...</p>
        )}
      </aside>
    </div>
  );
}

export function EventsPage({
  data,
  profile,
  admin,
  navigate,
}: {
  data: AppData;
  profile: Coordinator | null;
  admin: boolean;
  navigate: Nav;
}) {
  const [storedFilters] = useState(readEventFilters);
  const [query, setQuery] = useState(storedFilters.query);
  const [sport, setSport] = useState(storedFilters.sport);
  const [category, setCategory] = useState(storedFilters.category);
  const [division, setDivision] = useState(storedFilters.division);
  const [status, setStatus] = useState(storedFilters.status);
  const [assignedOnly, setAssignedOnly] = useState(storedFilters.assignedOnly);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    window.sessionStorage.setItem(EVENT_FILTERS_KEY, JSON.stringify({
      query, sport, category, division, status, assignedOnly,
    }));
  }, [query, sport, category, division, status, assignedOnly]);
  const sports = useMemo(
    () =>
      [
        ...new Set(
          data.events
            .map((event) => event.sport_name)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [data.events],
  );
  const scopedEvents = assignedOnly && profile
    ? data.events.filter((event) => event.coordinatorid === profile.id)
    : data.events;
  const filtered = scopedEvents.filter((event) => {
    const search = `${event.title} ${event.sport_name ?? ""}`.toLowerCase();
    return (
      search.includes(query.toLowerCase()) &&
      (sport === "All Sports" || event.sport_name === sport) &&
      (category === "All Categories" || event.sport_category === category) &&
      (division === "Overall" || event.division === division) &&
      (status === "All Statuses" || event.status === status)
    );
  });
  const finished = data.events.filter(
    (event) => event.status === "Completed",
  ).length;
  const percent = data.events.length
    ? Math.round((finished / data.events.length) * 100)
    : 0;
  const lastUpdated = useMemo(() => {
    const latest = data.events
      .map((event) => event.updatedat)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return latest
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Manila",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(latest)
      : "No updates yet";
  }, [data.events]);
  return (
    <section className="panel events-page">
      <div className="page-heading events-heading">
        <h1><i className="bi bi-calendar-event-fill" aria-hidden="true" /> Event Records</h1>
        <p>Bohol Provincial Athletic Meet 2026 Event Records</p>
      </div>
      <div className="events-summary desktop-events-summary">
        <div className="event-stat">
          <span>Total Events <i className="bi bi-calendar-event" aria-hidden="true" /></span>
          <strong>{data.events.length}</strong>
        </div>
        <div className="event-stat">
          <span>Completed <i className="bi bi-check-circle" aria-hidden="true" /></span>
          <strong>{finished}</strong>
        </div>
        <div className="event-stat">
          <span>Pending <i className="bi bi-clock" aria-hidden="true" /></span>
          <strong>{data.events.length - finished}</strong>
        </div>
        <div className="event-stat">
          <span>Last Update <i className="bi bi-arrow-clockwise" aria-hidden="true" /></span>
          <strong className="last-update-value">{lastUpdated}</strong>
        </div>
      </div>
      <div className="mobile-events-summary" aria-label="Meet progress summary">
        <div className="event-stat">
          <span>Finished <i className="bi bi-check-circle-fill" aria-hidden="true" /></span>
          <strong>{finished} / {data.events.length}</strong>
          <div className="progress-bar-glass">
            <span className="progress-fill" style={{ width: `${percent}%` }} />
            <b>{percent}%</b>
          </div>
        </div>
        <div className="event-stat">
          <span>Last Update <i className="bi bi-clock-history" aria-hidden="true" /></span>
          <strong className="last-update-value">{lastUpdated}</strong>
          <small><i className="live-dot" /> Live Data</small>
        </div>
      </div>

      <div className="events-section-heading">
        <h2>Events</h2>
        <div className="events-toolbar">
          {profile && (
            <button
              type="button"
              className="button-outline assigned-events-button"
              onClick={() => {
                setAssignedOnly((current) => !current);
              }}
            >
              <i className={assignedOnly ? "bi bi-list" : "bi bi-person-lines-fill"} aria-hidden="true" />{" "}
              {assignedOnly ? "View all events" : "View assigned events"}
            </button>
          )}
          {admin && (
            <button type="button" className="button-outline pending-report-button"
              onClick={() => navigate("/reports/pending")}>
              <i className="bi bi-clock-history" aria-hidden="true" /> Pending report
            </button>
          )}
          {admin && (
            <button type="button" onClick={() => navigate("/manage")}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> Add event
            </button>
          )}
        </div>
      </div>

      <div className="division-filters events-division-filters" role="group" aria-label="Event division">
        {["Overall", "Elementary", "Secondary", "Paragames"].map((value) => (
          <button key={value} type="button"
            className={division === value ? "filter-btn active-filter" : "filter-btn"}
            onClick={() => setDivision(value)}>{value}</button>
        ))}
      </div>

      <div className="mobile-event-search">
        <label>
          <i className="bi bi-search" aria-hidden="true" />
          <span className="sr-only">Search events</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Search event title…" />
        </label>
        <button type="button" onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen} aria-controls="eventFilters">
          <i className="bi bi-sliders" aria-hidden="true" /> Filters
        </button>
      </div>

      <div className={filtersOpen ? "filter-grid events-filter-grid open" : "filter-grid events-filter-grid"}
        id="eventFilters">
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search event title…"
          />
        </label>
        <label>
          Sport
          <select
            value={sport}
            onChange={(event) => setSport(event.target.value)}
          >
            <option>All Sports</option>
            {sports.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option>All Categories</option>
            {SPORTS_CATEGORIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option>All Statuses</option>
            <option>Pending</option>
            <option>Completed</option>
          </select>
        </label>
      </div>
      <p className="result-count events-result-count">
        {filtered.length} of {scopedEvents.length} events
      </p>
      {filtered.length ? (
        <div className="event-records">
          <div className="event-table-header" aria-hidden="true">
            <span>Sport &amp; Class</span>
            <span>Event Title</span>
            <span>Winners Allocation</span>
            <span>Action</span>
          </div>
          <div className="event-list">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              data={data}
              navigate={navigate}
              canEdit={Boolean(
                profile && (admin || event.coordinatorid === profile.id),
              )}
            />
          ))}
          </div>
        </div>
      ) : (
        <p className="empty">No events match the selected filters.</p>
      )}
    </section>
  );
}

function EventCard({
  event,
  data,
  navigate,
  canEdit,
}: {
  event: MeetEvent;
  data: AppData;
  navigate: Nav;
  canEdit: boolean;
}) {
  const resultLines = event.status === "Completed"
    ? [
        ["🥇", event.goldteamid, event.gold_winner_name],
        ["🥈", event.silverteamid, event.silver_winner_name],
        ["🥉", event.bronzeteamid, event.bronze_winner_name],
      ].filter(([, teamId, names]) => Boolean(teamId || winnerNames(names as string | null).length))
    : [];
  return (
    <article className="event-card">
      <div className="event-card-summary">
        <div className="event-record-sport">
          <span className={event.status === "Completed" ? "record-status completed" : "record-status pending"}>
            <i aria-hidden="true" /> {event.status}
          </span>
          <div className="event-badges">
            <span className="sport-badge">
              <span className="sport-icon" aria-hidden="true">{sportIcon(event.sport_name)}</span>
              {event.sport_name || "Sport"}
            </span>
            <span className="division-badge">{event.division}</span>
          </div>
        </div>
        <div className="event-record-title">
          <h3>{event.title}</h3>
          <small>{event.sport_category || "Open"} · {event.event_category || "Event"}</small>
        </div>
        <div className="event-record-winners">
          {resultLines.length ? resultLines.map(([medal, teamId, names]) => (
            <span key={medal as string}>
              {medal as string} {teamName(data, teamId as number | null)}{" "}
              {winnerNames(names as string | null).join(", ")}
            </span>
          )) : <span className="no-results">– No results recorded</span>}
        </div>
        <div className="event-actions">
          {canEdit && (
            <button type="button" className="button-outline"
              onClick={() => navigate(`/scoring/${event.id}`)}>
              {event.status === "Completed" ? "Update" : "Submit"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function TeamsPage({
  data,
  path,
  navigate,
}: {
  data: AppData;
  path: string;
  navigate: Nav;
}) {
  const id = Number(path.split("/")[2]);
  const team = data.teams.find((item) => item.id === id);
  const [division, setDivision] = useState<DivisionFilter>("Overall");
  if (path !== "/teams" && !team)
    return (
      <section className="panel state-message">
        <h1>Team not found</h1>
        <button onClick={() => navigate("/teams")}>All teams</button>
      </section>
    );
  if (!team) {
    const standings = medalRows(data, division);
    return (
      <section className="teams-page">
        <div className="page-heading centered-heading">
          <span className="eyebrow dark">Provincial delegations</span>
          <h1>♟ &nbsp; Participating Teams</h1>
          <p>
            Each delegation competes across Elementary, Secondary, and
            Paragames.
          </p>
        </div>
        <DivisionTabs value={division} change={setDivision} />
        <div className="teams-grid">
          {standings.map((row, index) => (
            <button
              className="team-card school-card"
              key={row.team.id}
              onClick={() => navigate(`/teams/${row.team.id}`)}
            >
              <span className="card-left-content">
                <strong className="team-acronym">{row.team.acronym}</strong>
                <span className="team-division">{division}</span>
                <span className="area-rank">
                  Rank #
                  {standings.findIndex(
                    (candidate) => compareMedals(candidate, row) === 0,
                  ) + 1 || index + 1}
                </span>
                <MedalPill row={row} />
              </span>
              <img
                src="/images/bohol_logo.png"
                alt=""
                aria-hidden="true"
                className="area-card-logo"
              />
            </button>
          ))}
        </div>
      </section>
    );
  }
  const completed = data.events.filter(
    (event) =>
      event.status === "Completed" &&
      [event.goldteamid, event.silverteamid, event.bronzeteamid].includes(
        team.id,
      ) &&
      (division === "Overall"
        ? event.division !== "Paragames"
        : event.division === division),
  );
  const row = medalRows(data, division).find(
    (item) => item.team.id === team.id,
  );
  return (
    <section className="panel team-detail">
      <button
        className="text-link back-link"
        onClick={() => navigate("/teams")}
      >
        ← All teams
      </button>
      <header className="team-detail-hero">
        <div>
          <span className="eyebrow">Provincial delegation</span>
          <h1>{team.acronym}</h1>
          <p>{team.name}</p>
          <MedalPill row={row ?? { gold: 0, silver: 0, bronze: 0 }} />
        </div>
        <img src="/images/bohol_logo.png" alt="" aria-hidden="true" />
      </header>
      <DivisionTabs value={division} change={setDivision} />
      <h2 className="section-title">🏅 &nbsp; Results</h2>
      {completed.length ? (
        <div className="event-list">
          {completed.map((event) => (
            <article className="event-card" key={event.id}>
              <div>
                <div className="event-meta">
                  {event.sport_name} · {event.division}
                </div>
                <h3>{event.title}</h3>
              </div>
              <strong className="team-medal">
                {event.goldteamid === team.id
                  ? "🥇 Gold"
                  : event.silverteamid === team.id
                    ? "🥈 Silver"
                    : "🥉 Bronze"}
              </strong>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">No completed medals in this division yet.</p>
      )}
    </section>
  );
}
