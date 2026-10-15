import { useEffect, useMemo, useState } from "react";
import type { AppData } from "./App";
import {
  compareMedals,
  DIVISIONS,
  SPORTS_CATEGORIES,
  winnerNames,
  type DivisionFilter,
  type MeetEvent,
} from "./types";

type Nav = (path: string) => void;

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
function MeetPoster() {
  return (
    <section
      className="meet-poster"
      aria-label="Bohol Provincial Athletic Meet 2026"
    >
      <div className="poster-motto">
        One Province
        <br />
        One Spirit
        <br />
        Brighter Futures
      </div>
      <div className="poster-values">
        DISCIPLINE
        <br />
        SPORTSMANSHIP
        <br />
        EXCELLENCE
        <br />
        UNITY
      </div>
      <MeetArt />
      <h1 className="poster-title">
        <span className="poster-district">Province of Bohol</span>
        <span className="poster-event-line">
          <span className="poster-event">Athletic Meet</span>
          <span className="poster-year">2026</span>
        </span>
      </h1>
      <p className="poster-districts">ELEMENTARY · SECONDARY · PARAGAMES</p>
      <p className="poster-theme">“Strong Together. Greater Tomorrow”</p>
      <div className="poster-details">
        <span className="poster-date">▣ &nbsp; Schedule to be announced</span>
        <span className="poster-countdown">◷ &nbsp; DATE TBD</span>
      </div>
      <div className="poster-sports" aria-hidden="true">
        <span>⚽</span>
        <span>🏀</span>
        <span>🏸</span>
        <span>🏐</span>
        <span>🏆</span>
      </div>
      <div className="poster-corner poster-corner-left">
        PLAY
        <br />
        LEARN
        <br />
        LEAD
        <br />
        INSPIRE
      </div>
      <div className="poster-corner poster-corner-right">
        SPORTS
        <br />
        BUILD
        <br />
        BETTER
        <br />
        PEOPLE
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
              <span aria-hidden="true">▣</span>Results
            </button>
            <button className="btn-glass" onClick={() => navigate("/teams")}>
              <span aria-hidden="true">♟</span>Teams
            </button>
            <button
              className="btn-glass"
              onClick={() => navigate("/reports/general")}
            >
              <span aria-hidden="true">▤</span>Reports
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
          <p className="tally-district">Province of Bohol</p>
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
  navigate,
}: {
  data: AppData;
  navigate: Nav;
}) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("All Sports");
  const [category, setCategory] = useState("All Categories");
  const [division, setDivision] = useState("All Divisions");
  const [status, setStatus] = useState("All Statuses");
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
  const filtered = data.events.filter((event) => {
    const search = `${event.title} ${event.sport_name ?? ""}`.toLowerCase();
    return (
      search.includes(query.toLowerCase()) &&
      (sport === "All Sports" || event.sport_name === sport) &&
      (category === "All Categories" || event.sport_category === category) &&
      (division === "All Divisions" || event.division === division) &&
      (status === "All Statuses" || event.status === status)
    );
  });
  const finished = data.events.filter(
    (event) => event.status === "Completed",
  ).length;
  const percent = data.events.length
    ? Math.round((finished / data.events.length) * 100)
    : 0;
  return (
    <section className="panel events-page">
      <div className="page-heading">
        <span className="eyebrow dark">Competition catalog</span>
        <h1>Match Results &amp; Events</h1>
        <p>
          Browse events and official results by sport, category, division, and
          status.
        </p>
      </div>
      <div className="events-summary">
        <div className="event-stat">
          <span>Total Events</span>
          <strong>{data.events.length}</strong>
        </div>
        <div className="event-stat">
          <span>Completed</span>
          <strong>{finished}</strong>
        </div>
        <div className="event-stat">
          <span>Pending</span>
          <strong>{data.events.length - finished}</strong>
        </div>
        <div className="event-stat">
          <span>Meet Progress</span>
          <strong>{percent}%</strong>
          <div className="progress-bar-glass">
            <span className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
      <div className="filter-grid">
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Event title or sport"
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
          Division
          <select
            value={division}
            onChange={(event) => setDivision(event.target.value)}
          >
            <option>All Divisions</option>
            {DIVISIONS.map((value) => (
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
      <p className="result-count">
        {filtered.length} of {data.events.length} events
      </p>
      {filtered.length ? (
        <div className="event-list">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              data={data}
              navigate={navigate}
            />
          ))}
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
}: {
  event: MeetEvent;
  data: AppData;
  navigate: Nav;
}) {
  return (
    <article className="event-card">
      <div>
        <div className="event-meta">
          🏅 &nbsp; {event.sport_name || "Sport"} · {event.division} ·{" "}
          {event.sport_category || "Open"} · {event.event_category || "Event"}
        </div>
        <h3>{event.title}</h3>
        {event.status === "Completed" && (
          <div className="event-results">
            <span>
              🥇 {teamName(data, event.goldteamid)}{" "}
              {winnerNames(event.gold_winner_name).join(", ")}
            </span>
            <span>
              🥈 {teamName(data, event.silverteamid)}{" "}
              {winnerNames(event.silver_winner_name).join(", ")}
            </span>
            <span>
              🥉 {teamName(data, event.bronzeteamid)}{" "}
              {winnerNames(event.bronze_winner_name).join(", ")}
            </span>
          </div>
        )}
      </div>
      <div className="event-actions">
        <span
          className={
            event.status === "Completed" ? "status completed" : "status pending"
          }
        >
          {event.status}
        </span>
        <button
          className="text-link"
          onClick={() => navigate(`/teams/${event.goldteamid ?? ""}`)}
          disabled={!event.goldteamid}
        >
          Winning team →
        </button>
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
