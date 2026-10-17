import { useEffect, useMemo, useState } from "react";
import type { AppData } from "./App";
import { loadQualifiers } from "./data";
import { MEET_DATE } from "./meet-config";
import {
  compareMedals,
  DIVISIONS,
  SPORTS_CATEGORIES,
  winnerNames,
  type DivisionFilter,
  type MeetEvent,
  type Qualifier,
} from "./types";

type Nav = (path: string) => void;
type Report =
  | "general"
  | "results"
  | "pending"
  | "qualifiers"
  | "players"
  | "player-events";

const titles: Record<Report, string> = {
  general: "General Official Report",
  results: "All Events Results Report",
  pending: "Pending Events Report",
  qualifiers: "District / Regional Qualifier Report",
  players: "Player Medal Report",
  "player-events": "Player Event Report",
};

function csvDownload(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const escape = (value: string | number | null | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv =
    "\ufeff" +
    [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function team(data: AppData, id: number | null, short = false) {
  const found = data.teams.find((item) => item.id === id);
  return found ? (short ? found.acronym : found.name) : "";
}

function ReportTable({
  headers,
  rows,
  onRowClick,
}: {
  headers: string[];
  rows: (string | number)[][];
  onRowClick?: (index: number) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="meet-table report-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((value, cell) => (
                <td key={cell}>
                  {cell === 0 && onRowClick ? (
                    <button className="text-link" type="button" onClick={() => onRowClick(index)}
                      aria-label={`Show events won by ${value}`}>{value}</button>
                  ) : value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">No records match these filters.</p>}
    </div>
  );
}

export function ReportsPage({
  data,
  path,
  admin,
  navigate,
}: {
  data: AppData;
  path: string;
  admin: boolean;
  navigate: Nav;
}) {
  const slug = path.split("/")[2] as Report;
  const report: Report = slug in titles ? slug : "general";
  const [sport, setSport] = useState("All Sports");
  const [sportType, setSportType] = useState("All Types");
  const [category, setCategory] = useState("All Categories");
  const [division, setDivision] = useState("All Divisions");
  const [eventId, setEventId] = useState("All Events");
  const [selectedTeam, setSelectedTeam] = useState("All Teams");
  const [district, setDistrict] = useState("All Districts");
  const [search, setSearch] = useState("");
  const [exactPlayer, setExactPlayer] = useState(false);
  const [signatories, setSignatories] = useState([
    { name: "", title: "" },
    { name: "", title: "" },
  ]);
  const [qualifiers, setQualifiers] = useState<Qualifier[]>([]);
  const [error, setError] = useState("");
  const sports = useMemo(
    () =>
      [
        ...new Set(
          data.events
            .map((item) => item.sport_name)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [data.events],
  );
  useEffect(() => {
    if (report === "qualifiers")
      void loadQualifiers()
        .then(setQualifiers)
        .catch((cause) =>
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load qualifiers.",
          ),
        );
  }, [report]);
  if (!admin && !["qualifiers", "players", "player-events"].includes(report))
    return (
      <section className="panel state-message">
        <h1>Administrator access required</h1>
      </section>
    );
  const matching = (event: MeetEvent) =>
    (sport === "All Sports" || event.sport_name === sport) &&
    (sportType === "All Types" || event.event_category === sportType) &&
    (category === "All Categories" || (category === "Unspecified"
      ? !SPORTS_CATEGORIES.includes(event.sport_category ?? "")
      : event.sport_category === category)) &&
    (division === "All Divisions" || event.division === division) &&
    (eventId === "All Events" || event.id === Number(eventId)) &&
    (report === "players" ||
      report === "player-events" ||
      `${event.title} ${event.sport_name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()));
  const filtered = data.events.filter(matching);
  let headers: string[] = [];
  let rows: (string | number)[][] = [];
  let playerCounts = { gold: 0, silver: 0, bronze: 0 };
  let playerTotals: { name: string; teamName: string; division: string; category: string;
    gold: number; silver: number; bronze: number }[] = [];
  if (report === "results") {
    headers = [
      "Sport",
      "Event",
      "Category",
      "Type",
      "Division",
      "Status",
      "Gold",
      "Silver",
      "Bronze",
    ];
    rows = filtered
      .filter(
        (event) =>
          selectedTeam === "All Teams" ||
          [event.goldteamid, event.silverteamid, event.bronzeteamid].some(
            (id) => team(data, id) === selectedTeam,
          ),
      )
      .map((event) => [
        event.sport_name ?? "",
        event.title,
        event.sport_category ?? "",
        event.event_category ?? "",
        event.division,
        event.status,
        team(data, event.goldteamid, true),
        team(data, event.silverteamid, true),
        team(data, event.bronzeteamid, true),
      ]);
  } else if (report === "pending") {
    headers = ["Sport", "Event", "Category", "Type", "Division"];
    rows = filtered
      .filter((event) => event.status === "Pending")
      .map((event) => [
        event.sport_name ?? "",
        event.title,
        event.sport_category ?? "",
        event.event_category ?? "",
        event.division,
      ]);
  } else if (report === "qualifiers") {
    headers = [
      "Sport",
      "Event",
      "Division",
      "Name",
      "Role",
      "Team",
      "District",
      "School",
      "Gender",
      "T-shirt",
    ];
    rows = qualifiers.flatMap((item) => {
      const event = data.events.find((row) => row.id === item.event_id);
      return event &&
        matching(event) &&
        (selectedTeam === "All Teams" || item.team === selectedTeam) &&
        (district === "All Districts" || item.specific_district === district)
        ? [
            [
              event.sport_name ?? "",
              event.title,
              event.division,
              item.participant_name,
              item.role ?? "",
              item.team ?? "",
              item.specific_district ?? "",
              item.school ?? "",
              item.gender ?? "",
              item.tshirt_size ?? "",
            ],
          ]
        : [];
    });
  } else if (report === "players" || report === "player-events") {
    const entries = filtered.flatMap((event) =>
      (
        [
          ["Gold", event.goldteamid, event.gold_winner_name],
          ["Silver", event.silverteamid, event.silver_winner_name],
          ["Bronze", event.bronzeteamid, event.bronze_winner_name],
        ] as const
      ).flatMap(([medal, teamId, names]) =>
        (teamId === null ? [] : winnerNames(names))
          .filter((name) =>
            (selectedTeam === "All Teams" || team(data, teamId) === selectedTeam) &&
            (exactPlayer
              ? name.toLowerCase() === search.trim().toLowerCase()
              : `${name} ${event.title} ${event.sport_name ?? ""}`
                .toLowerCase().includes(search.trim().toLowerCase())))
          .map((name) => ({ name, event, medal, teamId,
            teamName: team(data, teamId),
            category: event.sport_category || "Unspecified" })),
      ),
    );
    playerCounts = {
      gold: entries.filter((entry) => entry.medal === "Gold").length,
      silver: entries.filter((entry) => entry.medal === "Silver").length,
      bronze: entries.filter((entry) => entry.medal === "Bronze").length,
    };
    if (report === "players") {
      const grouped = new Map<string, typeof playerTotals[number]>();
      for (const entry of entries) {
        const key = [entry.name.toLowerCase(), entry.teamId, entry.event.division,
          entry.category].join("|");
        const total = grouped.get(key) ?? {
          name: entry.name, teamName: entry.teamName,
          division: entry.event.division, category: entry.category,
          gold: 0, silver: 0, bronze: 0,
        };
        total[entry.medal.toLowerCase() as "gold" | "silver" | "bronze"] += 1;
        grouped.set(key, total);
      }
      playerTotals = [...grouped.values()].sort((a, b) =>
        ["Boys", "Girls", "Mixed", "Unspecified"].indexOf(a.category) -
          ["Boys", "Girls", "Mixed", "Unspecified"].indexOf(b.category) ||
        compareMedals(a, b) || a.name.localeCompare(b.name));
      headers = ["Player", "Team", "Division", "Category", "Gold", "Silver", "Bronze", "Total"];
      rows = playerTotals.map((entry) => [entry.name, entry.teamName,
        entry.division, entry.category, entry.gold, entry.silver, entry.bronze,
        entry.gold + entry.silver + entry.bronze]);
    } else {
      headers = ["Medal", "Player", "Team", "Division", "Sport", "Type", "Category", "Event won"];
      rows = entries.sort((a, b) =>
        ["Gold", "Silver", "Bronze"].indexOf(a.medal) -
          ["Gold", "Silver", "Bronze"].indexOf(b.medal) ||
        a.name.localeCompare(b.name) || a.event.title.localeCompare(b.event.title))
        .map((entry) => [entry.medal, entry.name,
          team(data, entry.teamId, true), entry.event.division,
          entry.event.sport_name ?? "", entry.event.event_category ?? "",
          entry.category, entry.event.title]);
    }
  }
  const choose = (key: Report) => navigate(`/reports/${key}`);
  return (
    <section className="panel report-page">
      <div className="page-heading">
        <span className="eyebrow dark">Official documentation</span>
        <h1>{titles[report]}</h1>
        <p>Filter, print, or export the current view.</p>
      </div>
      <div className="report-switch no-print">
        {(Object.keys(titles) as Report[])
          .filter(
            (key) => admin || key === "qualifiers" || key === "players" || key === "player-events",
          )
          .map((key) => (
            <button
              className={report === key ? "active" : ""}
              key={key}
              onClick={() => choose(key)}
            >
              {titles[key]}
            </button>
          ))}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {report !== "general" && (
        <div className="filter-grid no-print">
          <label>
            Search
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                report.startsWith("player")
                  ? "Player name or event"
                  : "Event title or sport"
              }
            />
          </label>
          <label>
            Sport
            <select
              value={sport}
              onChange={(event) => { setSport(event.target.value); setEventId("All Events"); }}
            >
              <option>All Sports</option>
              {sports.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={sportType} onChange={(event) => setSportType(event.target.value)}>
              <option>All Types</option>
              {[...new Set(data.events.map((item) => item.event_category)
                .filter((value): value is string => Boolean(value)))].sort()
                .map((value) => <option key={value}>{value}</option>)}
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
              <option>Unspecified</option>
            </select>
          </label>
          {!report.startsWith("player") && <label>
            Event
            <select value={eventId} onChange={(event) => setEventId(event.target.value)}>
              <option>All Events</option>
              {data.events.filter((item) => sport === "All Sports" || item.sport_name === sport)
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((item) => <option key={item.id} value={item.id}>{item.title} · {item.division}</option>)}
            </select>
          </label>}
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
          {report !== "pending" && (
            <label>
              Team
              <select
                value={selectedTeam}
                onChange={(event) => setSelectedTeam(event.target.value)}
              >
                <option>All Teams</option>
                {data.teams.map((value) => (
                  <option key={value.id}>{value.name}</option>
                ))}
              </select>
            </label>
          )}
          {report === "qualifiers" && (
            <label>
              District
              <select
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
              >
                <option>All Districts</option>
                {[
                  ...new Set(
                    qualifiers
                      .map((item) => item.specific_district)
                      .filter((value): value is string => Boolean(value)),
                  ),
                ]
                  .sort()
                  .map((value) => (
                    <option key={value}>{value}</option>
                  ))}
              </select>
            </label>
          )}
          {report.startsWith("player") && <label className="checkbox">
            <input type="checkbox" checked={exactPlayer}
              onChange={(event) => setExactPlayer(event.target.checked)} />
            Exact player name
          </label>}
        </div>
      )}
      {report === "general" && (
        <div className="signatory-editor no-print">
          <h2>Signatories</h2>
          {signatories.map((item, index) => (
            <div className="form-two" key={index}>
              <label>
                Name
                <input
                  value={item.name}
                  onChange={(event) =>
                    setSignatories((previous) =>
                      previous.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, name: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Designation
                <input
                  value={item.title}
                  onChange={(event) =>
                    setSignatories((previous) =>
                      previous.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, title: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
          <button
            className="button-outline"
            onClick={() =>
              setSignatories([...signatories, { name: "", title: "" }])
            }
          >
            Add signatory
          </button>
        </div>
      )}
      <div
        className={
          report === "general" ? "report-paper report-general" : "report-paper"
        }
      >
        {report === "general" && (
          <aside className="report-poster">
            <div className="report-logos">
              <img src="/images/deped_logo.png" alt="DepEd" className="report-logo-deped" />
              <img src="/images/r7_logo.png" alt="DepEd Region VII" />
              <img src="/images/bohol_logo.png" alt="Province of Bohol" />
              <img src="/images/sdobohol_logo.png" alt="SDO Bohol" />
            </div>
            <p className="report-motto">
              One Province. One Spirit.
              <br />
              Brighter Futures.
            </p>
            <img
              className="meet-art"
              src="/images/meet-art.svg"
              alt=""
              aria-hidden="true"
            />
            <p className="report-district">Province of Bohol</p>
            <h2 className="report-event">
              ATHLETIC MEET <strong>2026</strong>
            </h2>
            <p className="report-areas">ELEMENTARY · SECONDARY · PARAGAMES</p>
            <p className="report-theme">“Strong Together. Greater Tomorrow”</p>
            <p className="report-date">{MEET_DATE}</p>
            <p className="report-values">
              DISCIPLINE · SPORTSMANSHIP · EXCELLENCE · UNITY
            </p>
          </aside>
        )}
        <div className="report-main">
          <div className="report-letterhead">
            <img src="/images/deped_logo.png" alt="DepEd" className="report-logo-deped" />
            <div>
              Republic of the Philippines
              <br />
              <strong>Department of Education</strong>
              <br />
              Schools Division of Bohol
            </div>
            <img src="/images/sdobohol_logo.png" alt="SDO Bohol" />
          </div>
          <h2>Bohol Provincial Athletic Meet 2026</h2>
          <h3 className="report-title-banner">{titles[report]}</h3>
          {report === "general" ? (
            <GeneralTables data={data} />
          ) : (
            <>
              {report.startsWith("player") && <div className="report-medal-summary" aria-label="Player medal totals">
                <span><strong>Gold</strong>{playerCounts.gold}</span>
                <span><strong>Silver</strong>{playerCounts.silver}</span>
                <span><strong>Bronze</strong>{playerCounts.bronze}</span>
                <span><strong>Total</strong>{playerCounts.gold + playerCounts.silver + playerCounts.bronze}</span>
              </div>}
              <p className="report-count">
                {rows.length} record{rows.length === 1 ? "" : "s"}
              </p>
              {report === "pending"
                ? <PendingGroupedReport events={filtered.filter((event) => event.status === "Pending")} />
                : report === "qualifiers"
                  ? <QualifiersGroupedReport headers={headers} rows={rows} />
                : report.startsWith("player")
                  ? <div className="player-report-groups">
                    {[...SPORTS_CATEGORIES, "Unspecified"].map((group) => {
                      const groupRows = rows.filter((row) => row[report === "players" ? 3 : 6] === group);
                      if (!groupRows.length) return null;
                      return <section className="report-section" key={group}>
                        <h4>{group}</h4>
                        <ReportTable headers={headers} rows={groupRows}
                          onRowClick={report === "players" ? (index) => {
                            const entry = playerTotals.filter((row) => row.category === group)[index];
                            setSearch(entry.name);
                            setExactPlayer(true);
                            setSelectedTeam(entry.teamName);
                            setDivision(entry.division);
                            setCategory(entry.category);
                            navigate("/reports/player-events");
                          } : undefined} />
                      </section>;
                    })}
                    {!rows.length && <p className="empty">No player medals match these filters.</p>}
                  </div>
                  : <ReportTable headers={headers} rows={rows} />}
            </>
          )}
          <div className="signatures">
            {report === "general" ? (
              signatories
                .filter((item) => item.name || item.title)
                .map((item, index) => (
                  <div key={index}>
                    <hr />
                    <strong>{item.name}</strong>
                    <br />
                    {item.title}
                  </div>
                ))
            ) : (
              <>
                <div>
                  Prepared by:
                  <hr />
                  Meet Secretariat
                </div>
                <div>
                  Noted by:
                  <hr />
                  Provincial Meet Officials
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="button-row no-print">
        <button onClick={() => window.print()}>Print / Save PDF</button>
        {report !== "general" && (
          <button
            className="button-outline"
            onClick={() => csvDownload(`provmeet-${report}.csv`, headers, rows)}
          >
            Export CSV for Excel
          </button>
        )}
      </div>
    </section>
  );
}

function QualifiersGroupedReport({ headers, rows }: {
  headers: string[]; rows: (string | number)[][];
}) {
  if (!rows.length) return <p className="empty">No qualifiers match these filters.</p>;
  const roles = [{ term: "Athlete", label: "Athletes" },
    { term: "Coach", label: "Coaches" },
    { term: "Chaperon", label: "Chaperones" }];
  const roleOrder = (value: string | number) => {
    const role = String(value).toLowerCase();
    if (role.includes("athlete")) return 0;
    if (role.includes("coach")) return 1;
    if (role.includes("chaperon")) return 2;
    return 3;
  };
  const sports = [...new Set(rows.map((row) => String(row[0] || "Unassigned Sport")))].sort();
  return <div className="qualifier-report-groups">
    <div className="report-medal-summary" aria-label="Qualifier role totals">
      {roles.map((role) => <span key={role.term}><strong>{role.label}</strong>
        {rows.filter((row) => String(row[4]).toLowerCase().includes(role.term.toLowerCase())).length}</span>)}
      <span><strong>Total</strong>{rows.length}</span>
    </div>
    {sports.map((sport) => {
      const sportRows = rows.filter((row) => String(row[0] || "Unassigned Sport") === sport);
      const events = [...new Set(sportRows.map((row) => String(row[1])))].sort();
      return <section className="report-section" key={sport}>
        <h4>{sport} <small>{sportRows.length} participants/staff</small></h4>
        {events.map((event) => {
          const eventRows = sportRows.filter((row) => row[1] === event)
            .sort((a, b) => roleOrder(a[4]) - roleOrder(b[4]) || String(a[3]).localeCompare(String(b[3])));
          return <div key={event} className="qualifier-event-group">
            <h5>{event} <small>{eventRows.length}</small></h5>
            <ReportTable headers={headers.slice(2)} rows={eventRows.map((row) => row.slice(2))} />
          </div>;
        })}
      </section>;
    })}
  </div>;
}

function PendingGroupedReport({ events }: { events: MeetEvent[] }) {
  if (!events.length) return <p className="empty">No pending events match these filters.</p>;
  return <div className="pending-report-groups">
    {DIVISIONS.map((division) => {
      const divisionEvents = events.filter((event) => event.division === division);
      if (!divisionEvents.length) return null;
      const sports = [...new Set(divisionEvents.map((event) => event.sport_name || "Unassigned Sport"))].sort();
      return <section className="report-section" key={division}>
        <h4>{division} Division <small>Total Pending: {divisionEvents.length}</small></h4>
        {sports.map((sport) => {
          const sportEvents = divisionEvents.filter((event) => (event.sport_name || "Unassigned Sport") === sport);
          return <div className="pending-sport" key={sport}>
            <h5>{sport} <small>{sportEvents.length} pending</small></h5>
            {[...SPORTS_CATEGORIES, "Unspecified"].map((category) => {
              const categoryEvents = sportEvents.filter((event) =>
                (SPORTS_CATEGORIES.includes(event.sport_category ?? "")
                  ? event.sport_category : "Unspecified") === category)
                .sort((a, b) => a.title.localeCompare(b.title));
              if (!categoryEvents.length) return null;
              return <div key={category} className="pending-category">
                <h6>{category}</h6>
                <ol>{categoryEvents.map((event) => <li key={event.id}>{event.title}</li>)}</ol>
              </div>;
            })}
          </div>;
        })}
      </section>;
    })}
  </div>;
}

function GeneralTables({ data }: { data: AppData }) {
  return (
    <div className="general-tables">
      {(["Overall", ...DIVISIONS] as DivisionFilter[]).map((division) => {
        const rows = data.teams
          .map((item) => {
            const matches = data.tallies.filter(
              (row) =>
                row.teamid === item.id &&
                (division === "Overall"
                  ? row.division !== "Paragames"
                  : row.division === division),
            );
            return {
              team: item,
              gold: matches.reduce((sum, row) => sum + row.gold, 0),
              silver: matches.reduce((sum, row) => sum + row.silver, 0),
              bronze: matches.reduce((sum, row) => sum + row.bronze, 0),
            };
          })
          .sort(compareMedals);
        return (
          <section className="report-section" key={division}>
            <h4>{division} standings</h4>
            <ReportTable
              headers={["Rank", "Team", "Gold", "Silver", "Bronze", "Total"]}
              rows={rows.map((row, index) => {
                const rank =
                  rows.findIndex(
                    (candidate) => compareMedals(candidate, row) === 0,
                  ) + 1;
                return [
                  rank || index + 1,
                  row.team.acronym,
                  row.gold,
                  row.silver,
                  row.bronze,
                  row.gold + row.silver + row.bronze,
                ];
              })}
            />
          </section>
        );
      })}
    </div>
  );
}
