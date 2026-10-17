import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppData } from "./App";
import { bulkDeleteQualifiers, loadQualifiers, saveQualifier, saveQualifiers } from "./data";
import { MEET_DATE } from "./meet-config";
import { compareMedals, DIVISIONS, SPORTS_CATEGORIES, winnerNames, type DivisionFilter, type MeetEvent, type Qualifier } from "./types";

type Nav = (path: string) => void;
type Report = "general" | "results" | "pending" | "qualifiers" | "edit-qualifiers" | "players" | "player-events";
type Signatory = { name: string; designation: string };
type Filters = { sports: string[]; events: string[]; divisions: string[]; teams: string[] };

const defaultSignatory: Signatory[] = [{ name: "MARIO L. GARCIA, PhD", designation: "Chief Recorder" }];
const REPORT_DIVISIONS = ["Elementary", "Secondary", "Paragames"] as const;
const emptyFilters = (): Filters => ({ sports: [], events: [], divisions: [], teams: [] });
const reportNames: Record<Report, string> = {
  general: "General Official Report", results: "All Events Results Report", pending: "Pending Events Report",
  qualifiers: "Regional Qualifier Report", players: "Player Medal Report", "player-events": "Player Event Report",
  "edit-qualifiers": "Edit Qualifiers",
};

function timestamp() {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date());
}

function reportWinnerNames(value: string | null) {
  const seen = new Set<string>();
  return (value ?? "").split(/(?:\r?\n|;)+/).map((name) => name.trim().replace(/\s+/g, " ")).filter((name) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function team(data: AppData, id: number | null, acronym = false) {
  const value = data.teams.find((item) => item.id === id);
  return value ? (acronym ? value.acronym : value.name) : "N/A";
}

function personKey(item: Qualifier) {
  return `${item.participant_name.trim().toUpperCase()}|${(item.team ?? "").trim().toUpperCase()}`;
}

function properCase(value: string) {
  return value.toLowerCase().replace(/(^|[\s.'’-])\p{L}/gu, (letter) => letter.toUpperCase());
}

function roleOrder(role: string | null) {
  const value = (role ?? "").toLowerCase();
  if (value.includes("athlete")) return 0;
  if (value.includes("assistant") && value.includes("coach")) return 2;
  if (value.includes("coach")) return 1;
  if (value.includes("chaperon")) return 3;
  return 4;
}

function roleGroup(role: string | null) {
  const value = (role ?? "").toLowerCase();
  if (value.includes("athlete")) return "Athletes";
  if (value.includes("assistant") && value.includes("coach")) return "Assistant Coaches";
  if (value.includes("coach")) return "Coaches";
  if (value.includes("chaperon")) return "Chaperones";
  return "Other / Unspecified";
}

function categoryOf(event: MeetEvent | undefined) {
  const category = event?.sport_category?.trim() ?? "";
  if (SPORTS_CATEGORIES.includes(category)) return category;
  const title = event?.title ?? "";
  const boys = /\bboys?\b/i.test(title);
  const girls = /\bgirls?\b/i.test(title);
  return boys && !girls ? "Boys" : girls && !boys ? "Girls" : "Mixed";
}

function eventSort(a: MeetEvent, b: MeetEvent) {
  return REPORT_DIVISIONS.indexOf(a.division) - REPORT_DIVISIONS.indexOf(b.division) ||
    (a.sport_name ?? "").localeCompare(b.sport_name ?? "") || a.title.localeCompare(b.title);
}

function qualifierEventSort(a: MeetEvent, b: MeetEvent) {
  const division = REPORT_DIVISIONS.indexOf(a.division) - REPORT_DIVISIONS.indexOf(b.division);
  if (division) return division;
  const sport = (a.sport_name ?? "").localeCompare(b.sport_name ?? "");
  if (sport) return sport;
  const specialOrder = (event: MeetEvent) => {
    const title = event.title.toLowerCase();
    const gender = /\b(girls?|women'?s?)\b/i.test(title) ? 1 : /\b(boys?|men'?s?)\b/i.test(title) ? 2 : 3;
    const sportName = event.sport_name?.toLowerCase();
    if (sportName === "arnis") return (title.includes("anyo") ? 1 : 2) * 10 + gender;
    if (sportName === "gymnastics") return (title.includes("aerobic") ? 1 : 2) * 10 + gender;
    return gender;
  };
  return specialOrder(a) - specialOrder(b) || a.title.localeCompare(b.title);
}

async function exportRenderedReport(fileName: string, sheetName: string, reportTitle: string, tableId: string, totalLabel: string, total: string, signatories: Signatory[]) {
  const tableElement = document.getElementById(tableId);
  if (!(tableElement instanceof HTMLTableElement)) throw new Error("The report table is not ready yet.");
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bohol Provincial Athletic Meet";
  workbook.created = new Date();
  const columnCount = Math.max(...[...tableElement.rows].map((row) => [...row.cells].reduce((sum, cell) => sum + cell.colSpan, 0)));
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const centered = (rowNumber: number, value: string, size: number, bold = false) => {
    sheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
    const cell = sheet.getCell(rowNumber, 1); cell.value = value; cell.font = { size, bold }; cell.alignment = { horizontal: "center" };
  };
  centered(1, "Republic of the Philippines", 10);
  centered(2, "Department of Education", 10);
  centered(3, "Division of Bohol", 10);
  centered(4, "Bohol Provincial Athletic Meet 2026", 12, true);
  centered(6, reportTitle, 14, true);
  const meta = sheet.addRow(["REPORT DATE", "", "", totalLabel, "", ""]);
  const metaValues = sheet.addRow([timestamp(), "", "", total, "", ""]);
  [meta, metaValues].forEach((row, index) => { row.font = { bold: index === 0 }; row.alignment = { horizontal: "center" }; });
  sheet.addRow([]);
  [...tableElement.rows].forEach((sourceRow) => {
    const values: string[] = [];
    const spans: { start: number; end: number }[] = [];
    let column = 1;
    [...sourceRow.cells].forEach((cell) => {
      values[column - 1] = cell.innerText.trim();
      for (let extra = 1; extra < cell.colSpan; extra++) values[column - 1 + extra] = "";
      if (cell.colSpan > 1) spans.push({ start: column, end: column + cell.colSpan - 1 });
      column += cell.colSpan;
    });
    while (values.length < columnCount) values.push("");
    const row = sheet.addRow(values);
    spans.forEach(({ start, end }) => sheet.mergeCells(row.number, start, row.number, end));
    row.alignment = { vertical: "top", wrapText: true };
    const isHeader = sourceRow.parentElement?.tagName === "THEAD";
    const isDivision = sourceRow.classList.contains("division-row");
    const isSport = sourceRow.classList.contains("sport-row") || sourceRow.classList.contains("sport-total");
    const isGroup = sourceRow.classList.contains("participant-group") || sourceRow.classList.contains("pending-sport-row") || sourceRow.classList.contains("category-row");
    if (isHeader || isDivision || isSport || isGroup) row.font = { bold: true, color: isHeader ? { argb: "FFFFFFFF" } : undefined };
    if (isHeader) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123F2D" } };
    else if (isDivision) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE4E0" } };
    else if (isSport) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4F0E6" } };
    else if (isGroup) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F5F4" } };
  });
  sheet.addRow([]);
  const cert = sheet.addRow(["CERTIFICATION"]); cert.font = { bold: true };
  signatories.filter((item) => item.name || item.designation).forEach((item) => {
    const row = sheet.addRow([item.name || "_________________________", item.designation || "_________________________"]); row.font = { bold: true };
  });
  sheet.columns.forEach((column, index) => { column.width = index === 0 ? 20 : index === 1 ? 34 : 22; });
  sheet.eachRow((row, number) => { if (number < 9) return; row.eachCell((cell) => { cell.border = { top: { style: "thin", color: { argb: "FF999999" } }, left: { style: "thin", color: { argb: "FF999999" } }, bottom: { style: "thin", color: { argb: "FF999999" } }, right: { style: "thin", color: { argb: "FF999999" } } }; }); });
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MultiFilter({ label, options, selected, onChange }: { label: string; options: { value: string; label: string }[]; selected: string[]; onChange: (values: string[]) => void }) {
  return <details className="report-multi-filter">
    <summary><span>{label}</span><strong>{selected.length ? `${selected.length} selected` : `All ${label.toLowerCase()}`}</strong></summary>
    <div>{options.map((option) => <label key={option.value}>
      <input type="checkbox" checked={selected.includes(option.value)} onChange={(change) => onChange(change.target.checked ? [...selected, option.value] : selected.filter((value) => value !== option.value))} />
      <span>{option.label}</span>
    </label>)}</div>
  </details>;
}

function SignatoryEditor({ value, onChange }: { value: Signatory[]; onChange: (value: Signatory[]) => void }) {
  return <div className="cong-signatories">
    <div className="cong-config-label"><strong>Signatories</strong><button type="button" className="button-outline" onClick={() => onChange([...value, { name: "", designation: "" }])}><i className="bi bi-plus-lg" /> Add Signatory</button></div>
    {value.map((item, index) => <div className="cong-signatory-row" key={index}>
      <input aria-label={`Signatory ${index + 1} name`} placeholder="Name" value={item.name} onChange={(change) => onChange(value.map((row, rowIndex) => rowIndex === index ? { ...row, name: change.target.value } : row))} />
      <input aria-label={`Signatory ${index + 1} designation`} placeholder="Designation" value={item.designation} onChange={(change) => onChange(value.map((row, rowIndex) => rowIndex === index ? { ...row, designation: change.target.value } : row))} />
      <button type="button" className="danger-outline" aria-label={`Remove signatory ${index + 1}`} onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}><i className="bi bi-trash" /></button>
    </div>)}
  </div>;
}

function ReportHeader({ title, subtitle, totalLabel, total }: { title: string; subtitle?: string; totalLabel: string; total: string }) {
  return <>
    <div className="cong-report-header">Republic of the Philippines<br />Department of Education<br />Division of Bohol<strong>Bohol Provincial Athletic Meet 2026</strong></div>
    <div className="cong-report-divider" />
    <div className="cong-report-title">{title}{subtitle && <small>{subtitle}</small>}</div>
    <div className="cong-report-divider" />
    <div className="cong-report-meta"><div><span>REPORT DATE</span><strong>{timestamp()}</strong></div><div><span>{totalLabel}</span><strong>{total}</strong></div></div>
    <div className="cong-report-divider" />
  </>;
}

function Signatures({ values }: { values: Signatory[] }) {
  return <div className="cong-report-signatures">{values.filter((item) => item.name || item.designation).map((item, index) => <div key={index}><strong>{item.name || "_________________________"}</strong><span>{item.designation || "_________________________"}</span></div>)}</div>;
}

function printReport(landscape = false) {
  const style = document.createElement("style");
  style.textContent = `@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: .45in; }`;
  document.head.appendChild(style);
  const cleanup = () => style.remove();
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 3000);
}

function PreviewToolbar({ onBack, onExcel, landscape = false }: { onBack: () => void; onExcel?: () => Promise<void>; landscape?: boolean }) {
  const [exporting, setExporting] = useState(false);
  return <div className="cong-preview-toolbar no-print">
    <button type="button" className="button-outline" onClick={onBack}><i className="bi bi-arrow-left" /> Back to Configuration</button>
    <div><button type="button" onClick={() => printReport(landscape)}><i className="bi bi-printer" /> Print / Save PDF</button>
      {onExcel && <button type="button" className="excel-button" disabled={exporting} onClick={() => { setExporting(true); void onExcel().finally(() => setExporting(false)); }}><i className="bi bi-file-earmark-excel" /> {exporting ? "Preparing…" : "Export Excel"}</button>}</div>
  </div>;
}

function ConfigCard({ title, accent = "green", children, signatories, setSignatories, error, onGenerate, extraActions, headerAction, generateLabel = "Generate Report Preview", onCancel }: { title: string; accent?: "green" | "gold"; children?: ReactNode; signatories: Signatory[]; setSignatories: (value: Signatory[]) => void; error: string; onGenerate: () => void; extraActions?: ReactNode; headerAction?: ReactNode; generateLabel?: string; onCancel?: () => void }) {
  return <section className={`cong-report-config ${accent}`}>
    <div className="cong-config-heading"><h1><i className="bi bi-gear-fill" /> Configure {title}</h1>{headerAction}</div>
    {children}
    <SignatoryEditor value={signatories} onChange={setSignatories} />
    {error && <div className="alert error" role="alert">{error}</div>}
    <div className="cong-config-actions">{onCancel && <button type="button" className="button-outline" onClick={onCancel}>Cancel</button>}{extraActions}<button type="button" onClick={onGenerate}><i className="bi bi-file-earmark-check" /> {generateLabel}</button></div>
  </section>;
}

function useSignatories(report: Report) {
  const key = `prov_${report}_signatories`;
  const [values, setValues] = useState<Signatory[]>(() => {
    try { const stored = sessionStorage.getItem(key); return stored ? JSON.parse(stored) : defaultSignatory; } catch { return defaultSignatory; }
  });
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(values)); }, [key, values]);
  return [values, setValues] as const;
}

function useReportFilters(report: "results" | "pending" | "qualifiers") {
  const key = `prov_${report}_report_filters`;
  const read = () => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as Filters | null ?? emptyFilters(); }
    catch { return emptyFilters(); }
  };
  const [draft, setDraft] = useState<Filters>(read);
  const [applied, setApplied] = useState<Filters>(read);
  const apply = () => { setApplied(draft); sessionStorage.setItem(key, JSON.stringify(draft)); };
  const reset = () => { const cleared = emptyFilters(); setDraft(cleared); setApplied(cleared); sessionStorage.removeItem(key); };
  return { draft, setDraft, applied, apply, reset };
}

function validSignatories(values: Signatory[]) { return values.some((item) => item.name.trim() || item.designation.trim()); }

function ReportSwitcher({ report, admin, navigate }: { report: Report; admin: boolean; navigate: Nav }) {
  const items: { path: string; report: Report; label: string; icon: string; adminOnly?: boolean }[] = [
    { path: "/reports/general", report: "general", label: "General", icon: "bi-bar-chart-fill", adminOnly: true },
    { path: "/reports/results", report: "results", label: "Event Results", icon: "bi-trophy-fill", adminOnly: true },
    { path: "/reports/pending", report: "pending", label: "Pending Events", icon: "bi-clock-history", adminOnly: true },
    { path: "/reports/qualifiers", report: "qualifiers", label: "Qualifiers", icon: "bi-people-fill" },
    { path: "/reports/players", report: "players", label: "Player Medals", icon: "bi-award-fill" },
    { path: "/reports/player-events", report: "player-events", label: "Player Events", icon: "bi-list-check" },
  ];
  const activeReport = report === "edit-qualifiers" ? "qualifiers" : report;
  return <nav className="cong-report-switcher no-print" aria-label="Official report pages">
    <div><i className="bi bi-file-earmark-bar-graph-fill" aria-hidden="true" /><strong>Official Reports</strong></div>
    <div className="cong-report-switcher-links">{items.filter((item) => !item.adminOnly || admin).map((item) => <a key={item.report} href={item.path} aria-current={activeReport === item.report ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigate(item.path); }}><i className={`bi ${item.icon}`} aria-hidden="true" /><span>{item.label}</span></a>)}</div>
  </nav>;
}

function GeneralReport({ data, navigate }: { data: AppData; navigate: Nav }) {
  const [preview, setPreview] = useState(false); const [error, setError] = useState("");
  const [signatories, setSignatories] = useSignatories("general");
  if (!preview) return <ConfigCard title="General Report" generateLabel="Generate Report" onCancel={() => navigate("/")} signatories={signatories} setSignatories={setSignatories} error={error} onGenerate={() => { if (!validSignatories(signatories)) setError("Please enter at least one signatory before generating the report."); else { setError(""); setPreview(true); } }} />;
  return <><PreviewToolbar onBack={() => setPreview(false)} landscape /><div className="cong-general-sheet">
    <aside className="cong-report-poster"><div className="cong-poster-logos"><img src="/images/deped_logo.png" alt="DepEd" /><img src="/images/r7_logo.png" alt="DepEd Region VII" /><img src="/images/sdobohol_logo.png" alt="Schools Division of Bohol" /><img src="/images/bohol_logo.png" alt="Province of Bohol" /></div><p>One Province · One Spirit<br />Brighter Futures</p><img src="/images/meet-art.svg" alt="" /><strong>PROVINCE OF BOHOL</strong><h2>PROVINCIAL ATHLETIC MEET <b>2026</b></h2><span>ELEMENTARY · SECONDARY · PARAGAMES</span><em>“Strong Together.<br />Greater Tomorrow”</em><small>{MEET_DATE}</small></aside>
    <main><div className="cong-report-header">Republic of the Philippines<br />Department of Education<br />Division of Bohol</div><div className="cong-tally-title">Official Medal Tally</div><p className="cong-as-of">As of <strong>{timestamp()}</strong></p><div className="cong-tally-grid">{(["Overall", "Secondary", "Elementary", "Paragames"] as DivisionFilter[]).map((division) => <TallyTable key={division} data={data} division={division} />)}</div><h3 className="cong-cert-title">Certified Correct:</h3><Signatures values={signatories} /></main>
  </div></>;
}

function TallyTable({ data, division }: { data: AppData; division: DivisionFilter }) {
  const rows = data.teams.map((value) => { const tallies = data.tallies.filter((row) => row.teamid === value.id && (division === "Overall" ? row.division !== "Paragames" : row.division === division)); return { team: value.acronym || value.name, gold: tallies.reduce((sum, row) => sum + row.gold, 0), silver: tallies.reduce((sum, row) => sum + row.silver, 0), bronze: tallies.reduce((sum, row) => sum + row.bronze, 0) }; }).sort(compareMedals);
  return <section><h3>{division === "Overall" ? "OVERALL (ELEM+SEC)" : division.toUpperCase()}</h3><table><thead><tr><th>Rank</th><th>Team</th><th>Gold</th><th>Silver</th><th>Bronze</th><th>Total</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.team}><td>{rows.findIndex((item) => compareMedals(item, row) === 0) + 1 || index + 1}</td><td>{row.team}</td><td>{row.gold}</td><td>{row.silver}</td><td>{row.bronze}</td><td>{row.gold + row.silver + row.bronze}</td></tr>)}</tbody></table></section>;
}

function StandardReport({ data, report, navigate }: { data: AppData; report: "results" | "pending"; navigate: Nav }) {
  const { draft, setDraft, applied: filters, apply, reset } = useReportFilters(report);
  const [preview, setPreview] = useState(false); const [error, setError] = useState("");
  const [signatories, setSignatories] = useSignatories(report);
  const sports = [...new Set(data.events.map((event) => event.sport_name).filter((value): value is string => Boolean(value)))].sort();
  const matches = (event: MeetEvent) => (!filters.sports.length || filters.sports.includes(event.sport_name ?? "")) && (!filters.events.length || filters.events.includes(String(event.id))) && (!filters.divisions.length || filters.divisions.includes(event.division));
  const events = data.events.filter(matches).filter((event) => report === "pending" ? event.status !== "Completed" : Boolean(event.goldteamid || event.silverteamid || event.bronzeteamid)).filter((event) => report === "pending" || !filters.teams.length || [event.goldteamid, event.silverteamid, event.bronzeteamid].some((id) => filters.teams.includes(String(id)))).sort(eventSort);
  const filterPanel = <div className="cong-filter-panel"><strong>Database Record Filtering</strong><div className="cong-filter-grid">
    <MultiFilter label="Sports" selected={draft.sports} onChange={(values) => setDraft({ ...draft, sports: values, events: [] })} options={sports.map((value) => ({ value, label: value }))} />
    <MultiFilter label="Events" selected={draft.events} onChange={(values) => setDraft({ ...draft, events: values })} options={data.events.filter((event) => !draft.sports.length || draft.sports.includes(event.sport_name ?? "")).sort((a,b) => a.title.localeCompare(b.title)).map((event) => ({ value: String(event.id), label: event.title }))} />
    <MultiFilter label="Divisions" selected={draft.divisions} onChange={(values) => setDraft({ ...draft, divisions: values })} options={REPORT_DIVISIONS.map((value) => ({ value, label: value }))} />
    {report === "results" && <MultiFilter label="Teams" selected={draft.teams} onChange={(values) => setDraft({ ...draft, teams: values })} options={data.teams.map((value) => ({ value: String(value.id), label: value.name }))} />}
  </div><div className="cong-filter-actions"><div><button type="button" className="button-outline" onClick={reset}>Reset Filters</button><button type="button" className={report === "pending" ? "gold-button" : ""} onClick={apply}>Apply Filters</button></div><span>{events.length} matching record{events.length === 1 ? "" : "s"}</span></div></div>;
  if (!preview) return <ConfigCard title={reportNames[report]} accent={report === "pending" ? "gold" : "green"} onCancel={() => navigate("/")} headerAction={<button type="button" className="report-cross-link" onClick={() => navigate(report === "results" ? "/reports/pending" : "/reports/results")}>{report === "results" ? "Pending Events Report →" : "← Finalized Results Report"}</button>} signatories={signatories} setSignatories={setSignatories} error={error} onGenerate={() => { apply(); if (!validSignatories(signatories)) setError("Please enter at least one signatory."); else { setError(""); setPreview(true); } }}>{filterPanel}</ConfigCard>;
  return <><PreviewToolbar onBack={() => setPreview(false)} onExcel={() => exportRenderedReport(report === "results" ? "Bohol_Provincial_Meet_Results.xlsx" : "Bohol_Provincial_Meet_Pending_Events.xlsx", report === "results" ? "Event Results" : "Pending Events", report === "results" ? "EVENTS RESULTS REPORT" : "PENDING EVENTS REPORT", report === "results" ? "results-report-table" : "pending-report-table", report === "results" ? "TOTAL RECORDS" : "TOTAL PENDING EVENTS", `${events.length} Events`, signatories)} />
    <div className="cong-report-sheet"><ReportHeader title={report === "results" ? "EVENTS RESULTS REPORT" : "PENDING EVENTS REPORT"} subtitle={report === "pending" ? "Events Awaiting Results Finalization" : undefined} totalLabel={report === "results" ? "TOTAL RECORDS" : "TOTAL PENDING EVENTS"} total={`${events.length} Events`} />
      {report === "results" ? <ResultsTable data={data} events={events} groupDivisions={filters.divisions.length !== 1} /> : <PendingTable events={events} />}
      <h3 className="cong-cert-title">CERTIFICATION</h3><p className="cong-cert-text">{report === "results" ? "This report is generated from the official Bohol Provincial Athletic Meet 2026 Management System and reflects the finalized event standings and results recorded at the time of generation." : "This report is generated from the official Bohol Provincial Athletic Meet 2026 Management System and reflects the uncompleted and pending event records awaiting score input and finalization as of the time of generation."}</p><div className="cong-report-divider" /><Signatures values={signatories} />
    </div></>;
}

function MedalCell({ data, teamId, names }: { data: AppData; teamId: number | null; names: string | null }) { const players = reportWinnerNames(names); return <td className="cong-medal-cell"><strong>{team(data, teamId)}</strong>{players.length ? players.map((name) => <span key={name}>{name}</span>) : <span>N/A</span>}</td>; }

function ResultsTable({ data, events, groupDivisions }: { data: AppData; events: MeetEvent[]; groupDivisions: boolean }) {
  const divisions = groupDivisions ? [...new Set(events.map((event) => event.division))] : [""];
  const body: ReactNode[] = [];
  divisions.forEach((division) => {
    const divisionEvents = division ? events.filter((event) => event.division === division) : events;
    if (division) body.push(<tr className="division-row" key={`${division}-heading`}><td colSpan={4}>{division.toUpperCase()}</td></tr>);
    [...new Set(divisionEvents.map((event) => event.sport_name || "OTHER SPORTS"))].forEach((sport) => {
      body.push(<tr className="sport-row" key={`${division}-${sport}`}><td colSpan={4}>{sport}</td></tr>);
      divisionEvents.filter((event) => (event.sport_name || "OTHER SPORTS") === sport).forEach((event) => body.push(<tr key={event.id}><td><strong>{event.title}</strong></td><MedalCell data={data} teamId={event.goldteamid} names={event.gold_winner_name} /><MedalCell data={data} teamId={event.silverteamid} names={event.silver_winner_name} /><MedalCell data={data} teamId={event.bronzeteamid} names={event.bronze_winner_name} /></tr>));
    });
  });
  return <><h3 className="cong-section-title">EVENT RESULTS</h3><table id="results-report-table" className="cong-official-table result-table"><thead><tr><th>Event Title</th><th>Gold 🥇</th><th>Silver 🥈</th><th>Bronze 🥉</th></tr></thead><tbody>{events.length ? body : <tr><td colSpan={4}>No finalized event results available for the current filters.</td></tr>}</tbody></table></>;
}

function PendingTable({ events }: { events: MeetEvent[] }) {
  const body: ReactNode[] = [];
  REPORT_DIVISIONS.forEach((division) => {
    const rows = events.filter((event) => event.division === division); if (!rows.length) return;
    body.push(<tr className="division-row" key={`${division}-division`}><td colSpan={2}><span>{division.toUpperCase()} DIVISION</span><small>Total Pending: {rows.length}</small></td></tr>);
    [...new Set(rows.map((event) => event.sport_name || "Unassigned Sport"))].forEach((sport) => {
      const sportRows = rows.filter((event) => (event.sport_name || "Unassigned Sport") === sport);
      body.push(<tr className="pending-sport-row" key={`${division}-${sport}`}><td colSpan={2}><span>{sport}</span><small>Total Pending: {sportRows.length}</small></td></tr>);
      [...SPORTS_CATEGORIES,"Uncategorized"].forEach((category) => {
        const categoryRows = sportRows.filter((event) => (SPORTS_CATEGORIES.includes(event.sport_category ?? "") ? event.sport_category : "Uncategorized") === category).sort((a,b) => a.title.localeCompare(b.title)); if (!categoryRows.length) return;
        body.push(<tr className="category-row" key={`${division}-${sport}-${category}`}><td></td><td>{category}</td></tr>);
        categoryRows.forEach((event,index) => body.push(<tr key={event.id}><td>{index+1}</td><td><strong>{event.title}</strong></td></tr>));
      });
    });
  });
  return <><h3 className="cong-section-title">SCHEDULED PENDING EVENTS</h3><table id="pending-report-table" className="cong-official-table pending-table"><thead><tr><th>#</th><th>Event Title</th></tr></thead><tbody>{events.length ? body : <tr><td colSpan={2}>No pending events found for the current filters.</td></tr>}</tbody></table></>;
}

function QualifierReport({ data, navigate }: { data: AppData; navigate: Nav }) {
  const [qualifiers, setQualifiers] = useState<Qualifier[]>([]); const [loadError, setLoadError] = useState("");
  const { draft, setDraft, applied: filters, apply, reset } = useReportFilters("qualifiers");
  const [mode, setMode] = useState<"qualifier"|"participant">("qualifier"); const [preview, setPreview] = useState(false); const [error,setError] = useState("");
  const [signatories,setSignatories] = useSignatories("qualifiers");
  useEffect(() => { void loadQualifiers().then(setQualifiers).catch((cause) => setLoadError(cause instanceof Error ? cause.message : "Could not load qualifiers.")); }, []);
  const eventById = useMemo(() => new Map(data.events.map((event) => [event.id,event])), [data.events]);
  const rows = qualifiers.filter((item) => { const event = eventById.get(item.event_id); return Boolean(event) && (!filters.sports.length || filters.sports.includes(event?.sport_name ?? "")) && (!filters.events.length || filters.events.includes(String(item.event_id))) && (!filters.divisions.length || filters.divisions.includes(event!.division)) && (!filters.teams.length || filters.teams.includes(item.team ?? "")); }).sort((a,b) => { const ea=eventById.get(a.event_id)!; const eb=eventById.get(b.event_id)!; return qualifierEventSort(ea,eb)||roleOrder(a.role)-roleOrder(b.role)||a.participant_name.localeCompare(b.participant_name); });
  const unique = [...new Map(rows.filter((row) => row.participant_name.trim()).map((row) => [personKey(row),row])).values()];
  const sports=[...new Set(data.events.map((event)=>event.sport_name).filter((value):value is string=>Boolean(value)))].sort();
  const filterPanel=<div className="cong-filter-panel"><div className="cong-filter-grid"><MultiFilter label="Sports" selected={draft.sports} onChange={(values)=>setDraft({...draft,sports:values,events:[]})} options={sports.map((value)=>({value,label:value}))}/><MultiFilter label="Events" selected={draft.events} onChange={(values)=>setDraft({...draft,events:values})} options={data.events.filter((event)=>!draft.sports.length||draft.sports.includes(event.sport_name??"")).map((event)=>({value:String(event.id),label:event.title}))}/><MultiFilter label="Divisions" selected={draft.divisions} onChange={(values)=>setDraft({...draft,divisions:values})} options={REPORT_DIVISIONS.map((value)=>({value,label:value}))}/><MultiFilter label="Teams" selected={draft.teams} onChange={(values)=>setDraft({...draft,teams:values})} options={[...new Set(qualifiers.map((item)=>item.team).filter((value):value is string=>Boolean(value)))].sort().map((value)=>({value,label:value}))}/></div><div className="cong-filter-actions"><div><button type="button" className="button-outline" onClick={reset}>Reset Filters</button><button type="button" onClick={apply}>Apply Filters</button></div><span>{unique.length} unique people</span></div></div>;
  const validateAndPreview=(nextMode:"qualifier"|"participant")=>{apply();if(!validSignatories(signatories))setError("Please enter at least one signatory.");else{setError("");setMode(nextMode);setPreview(true);}};
  if(!preview) return <ConfigCard title="Qualifier Filters" onCancel={()=>navigate("/")} signatories={signatories} setSignatories={setSignatories} error={error||loadError} onGenerate={()=>validateAndPreview("qualifier")} extraActions={<><button type="button" className="button-outline" onClick={()=>navigate("/reports/edit-qualifiers")}>Edit Qualifiers</button><button type="button" className="participant-list-button" onClick={()=>validateAndPreview("participant")}>List of Participants</button></>}>{filterPanel}</ConfigCard>;
  const selectedText=[...filters.sports,...filters.teams,...filters.divisions,...filters.events.map((id)=>eventById.get(Number(id))?.title??"")].filter(Boolean).join(" - ").toUpperCase()||"OVERALL";
  return <><PreviewToolbar onBack={()=>setPreview(false)} onExcel={()=>exportRenderedReport(mode==="qualifier"?"Provincial_Qualifier_Report.xlsx":"Provincial_Participant_List.xlsx",mode==="qualifier"?"Regional Qualifiers":"Participant List",mode==="qualifier"?"HIGHER MEET QUALIFIER 2026":"LIST OF QUALIFIERS 2026","qualifier-report-table","TOTAL QUALIFIERS",`${unique.length} ${mode==="qualifier"?"Participants":"Qualifiers"}`,signatories)}/><div className="cong-report-sheet"><ReportHeader title={mode==="qualifier"?"HIGHER MEET QUALIFIER 2026":"LIST OF QUALIFIERS 2026"} totalLabel="TOTAL QUALIFIERS" total={`${unique.length} ${mode==="qualifier"?"Participants":"Qualifiers"}`}/><h3 className="cong-section-title">{mode==="qualifier"?"QUALIFIED PARTICIPANTS LIST":"PARTICIPANT LIST"} - {selectedText}</h3><QualifierTable rows={rows} eventById={eventById} mode={mode}/><QualifierSummary rows={unique}/><h3 className="cong-cert-title">CERTIFICATION</h3><p className="cong-cert-text">{mode==="qualifier"?"This official report lists all confirmed athletes, coaches, and chaperones qualified for the higher meet, verified and recorded through the Provincial Meet Management System.":"This official report lists all confirmed qualifiers, coaches, and chaperones verified and recorded through the Provincial Meet Management System."}</p><div className="cong-report-divider"/><Signatures values={signatories}/></div></>;
}

function QualifierTable({rows,eventById,mode}:{rows:Qualifier[];eventById:Map<number,MeetEvent>;mode:"qualifier"|"participant"}) {
  const seen = new Set<string>();
  const shirtSeen = new Set<string>();
  const bestSizes = new Map<string,string>();
  const body: ReactNode[] = [];
  rows.forEach((item) => { if (item.tshirt_size && !bestSizes.has(personKey(item))) bestSizes.set(personKey(item), item.tshirt_size); });
  REPORT_DIVISIONS.forEach((division) => {
    const divRows = rows.filter((item) => eventById.get(item.event_id)?.division === division);
    if (!divRows.length) return;
    body.push(<tr className="division-row" key={`${division}-division`}><td colSpan={mode === "qualifier" ? 6 : 5}>{division.toUpperCase()} DIVISION</td><td>{new Set(divRows.map(personKey)).size}</td></tr>);
    [...new Set(divRows.map((item) => eventById.get(item.event_id)?.sport_name ?? "N/A"))].forEach((sport) => {
      const sportRows = divRows.filter((item) => (eventById.get(item.event_id)?.sport_name ?? "N/A") === sport);
      body.push(<tr className="sport-total" key={`${division}-${sport}`}><td colSpan={mode === "qualifier" ? 6 : 5}>{sport}</td><td>{new Set(sportRows.map(personKey)).size}</td></tr>);
      SPORTS_CATEGORIES.forEach((category) => {
        const athletes = sportRows.filter((item) => roleOrder(item.role) === 0 && categoryOf(eventById.get(item.event_id)) === category);
        if (!athletes.length) return;
        const eventTracker = { last: "" };
        body.push(<tr className={`participant-group ${category.toLowerCase()}`} key={`${division}-${sport}-${category}-athletes`}><td></td><td colSpan={mode === "qualifier" ? 5 : 4}><strong>{category}</strong></td><td>{new Set(athletes.map(personKey)).size}</td></tr>);
        athletes.forEach((item) => body.push(<QualifierRow key={`${item.id}-${mode}`} item={item} event={eventById.get(item.event_id)!} mode={mode} seen={seen} shirtSeen={shirtSeen} bestSizes={bestSizes} eventTracker={eventTracker}/>));
      });
      const staff = sportRows.filter((item) => roleOrder(item.role) > 0).sort((a,b) => roleOrder(a.role) - roleOrder(b.role) || a.participant_name.localeCompare(b.participant_name));
      if (staff.length) {
        body.push(<tr className="participant-group staff-heading" key={`${division}-${sport}-staff`}><td colSpan={mode === "qualifier" ? 6 : 5}><strong>Coaches and support staff</strong></td><td>{new Set(staff.map(personKey)).size}</td></tr>);
        SPORTS_CATEGORIES.forEach((category) => {
          const categoryStaff = staff.filter((item) => categoryOf(eventById.get(item.event_id)) === category);
          if (!categoryStaff.length) return;
          const eventTracker = { last: "" };
          body.push(<tr className={`participant-group staff-category ${category.toLowerCase()}`} key={`${division}-${sport}-${category}-staff-category`}><td></td><td colSpan={mode === "qualifier" ? 5 : 4}><strong>{category}</strong></td><td>{new Set(categoryStaff.map(personKey)).size}</td></tr>);
          categoryStaff.forEach((item) => body.push(<QualifierRow key={`${item.id}-${mode}`} item={item} event={eventById.get(item.event_id)!} mode={mode} seen={seen} shirtSeen={shirtSeen} bestSizes={bestSizes} eventTracker={eventTracker}/>));
        });
      }
    });
  });
  return <table id="qualifier-report-table" className="cong-official-table qualifier-table"><thead><tr><th>Sports</th>{mode === "qualifier" && <th>Event Title</th>}<th>Participant Name</th><th>Team</th><th>Role</th><th>T-Shirt Sizes</th><th>Total</th></tr></thead><tbody>{rows.length ? body : <tr><td colSpan={mode === "qualifier" ? 7 : 6}>No qualifier records available for the current filters.</td></tr>}</tbody></table>;
}

function QualifierRow({item,event,mode,seen,shirtSeen,bestSizes,eventTracker}:{item:Qualifier;event:MeetEvent;mode:"qualifier"|"participant";seen:Set<string>;shirtSeen:Set<string>;bestSizes:Map<string,string>;eventTracker:{last:string}}) {
  const participantCategory = roleOrder(item.role) === 0 ? categoryOf(event) : "Staff";
  const key = `${event.division}|${event.sport_name}|${participantCategory}|${personKey(item)}|${(item.role ?? "").trim().toLowerCase()}`;
  if (mode === "participant" && !seen.add(key)) return null;
  const person = personKey(item);
  const shirt = shirtSeen.has(person) ? "-" : bestSizes.get(person) || "N/A";
  shirtSeen.add(person);
  const displayEvent = event.title === eventTracker.last ? "" : event.title;
  eventTracker.last = event.title;
  return <tr><td></td>{mode === "qualifier" && <td>{displayEvent}</td>}<td><strong>{properCase(item.participant_name)}</strong></td><td>{item.team || "N/A"}</td><td>{item.role ? properCase(item.role) : "N/A"}</td><td>{shirt}</td><td></td></tr>;
}

function QualifierSummary({rows}:{rows:Qualifier[]}){const groups=["Athletes","Coaches","Assistant Coaches","Chaperones","Other / Unspecified"].map((role)=>({role,count:rows.filter((item)=>roleGroup(item.role)===role).length})).filter((item)=>item.role!=="Other / Unspecified"||item.count);return <section className="cong-summary"><h3>SUMMARY</h3><table className="cong-official-table"><thead><tr><th>Participant Category</th><th>Count</th></tr></thead><tbody>{groups.map((item)=><tr key={item.role}><td>{item.role}</td><td>{item.count}</td></tr>)}<tr><td><strong>Total</strong></td><td><strong>{rows.length}</strong></td></tr></tbody></table></section>;}

function EditQualifiersReport({ data, navigate }: { data: AppData; navigate: Nav }) {
  const { draft, setDraft, applied: filters, apply, reset } = useReportFilters("qualifiers");
  const [rows, setRows] = useState<Qualifier[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ event_id: data.events[0]?.id ?? 0, participant_name: "", team: "", role: "Athlete", tshirt_size: "" });
  useEffect(() => { void loadQualifiers().then(setRows).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load qualifiers.")); }, []);
  const eventById = useMemo(() => new Map(data.events.map((event) => [event.id, event])), [data.events]);
  const visible = rows.filter((item) => { const event = eventById.get(item.event_id); return Boolean(event) && (!filters.sports.length || filters.sports.includes(event?.sport_name ?? "")) && (!filters.events.length || filters.events.includes(String(item.event_id))) && (!filters.divisions.length || filters.divisions.includes(event!.division)) && (!filters.teams.length || filters.teams.includes(item.team ?? "")); });
  const sports = [...new Set(data.events.map((event) => event.sport_name).filter((value): value is string => Boolean(value)))].sort();
  const teamNames = data.teams.map((item) => item.name).sort();
  const update = (id: string, values: Partial<Qualifier>) => setRows((current) => current.map((item) => item.id === id ? { ...item, ...values } : item));
  const reload = async () => { const loaded = await loadQualifiers(); setRows(loaded); setSelected([]); };
  const doWork = async (work: () => Promise<void>, success: string) => { setBusy(true); setError(""); setNotice(""); try { await work(); await reload(); setNotice(success); } catch (cause) { setError(cause instanceof Error ? cause.message : "The qualifier changes could not be saved."); } finally { setBusy(false); } };
  return <section className="cong-qualifier-editor">
    <div className="cong-editor-heading"><div><button type="button" className="text-link" onClick={() => navigate("/reports/qualifiers")}>← Back to Qualifier Report</button><h1>Edit Qualifiers</h1><p>Modify participants inline, then click <strong>Save All Changes</strong>.</p></div><button type="button" onClick={() => setShowAdd((value) => !value)}><i className="bi bi-plus-lg" /> Add New Participant</button></div>
    {showAdd && <div className="cong-add-participant"><h2>Add New Participant</h2><div className="cong-add-grid"><label>Select Event<select value={newItem.event_id} onChange={(event) => setNewItem({ ...newItem, event_id: Number(event.target.value) })}>{data.events.slice().sort(eventSort).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.sport_name} · {item.division}</option>)}</select></label><label>Participant Name<input value={newItem.participant_name} onChange={(event) => setNewItem({ ...newItem, participant_name: event.target.value })} placeholder="Full Name" /></label><label>Team<select value={newItem.team} onChange={(event) => setNewItem({ ...newItem, team: event.target.value })}><option value="">-- Select Team --</option>{teamNames.map((value) => <option key={value}>{value}</option>)}</select></label><label>Role<select value={newItem.role} onChange={(event) => setNewItem({ ...newItem, role: event.target.value })}>{["Athlete","Coach","Assistant Coach","Chaperon"].map((value) => <option key={value}>{value}</option>)}</select></label><label>T-Shirt Size<select value={newItem.tshirt_size} onChange={(event) => setNewItem({ ...newItem, tshirt_size: event.target.value })}><option value="">-- Optional --</option>{["XS","S","M","L","XL","2XL","3XL","4XL","5XL"].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="cong-add-actions"><button type="button" className="button-outline" onClick={() => setShowAdd(false)}>Cancel</button><button type="button" disabled={busy || !newItem.event_id || !newItem.participant_name.trim()} onClick={() => void doWork(async () => { await saveQualifier({ event_id: newItem.event_id, participant_name: newItem.participant_name, team: newItem.team || null, role: newItem.role, tshirt_size: newItem.tshirt_size || null }); setNewItem({ ...newItem, participant_name: "", tshirt_size: "" }); setShowAdd(false); }, "Participant added.")}>Add Participant</button></div></div>}
    <div className="cong-filter-panel"><strong><i className="bi bi-filter-circle" /> Filter List</strong><div className="cong-filter-grid"><MultiFilter label="Sports" selected={draft.sports} onChange={(values) => setDraft({ ...draft, sports: values, events: [] })} options={sports.map((value) => ({ value, label: value }))}/><MultiFilter label="Events" selected={draft.events} onChange={(values) => setDraft({ ...draft, events: values })} options={data.events.filter((event) => !draft.sports.length || draft.sports.includes(event.sport_name ?? "")).map((event) => ({ value: String(event.id), label: event.title }))}/><MultiFilter label="Divisions" selected={draft.divisions} onChange={(values) => setDraft({ ...draft, divisions: values })} options={REPORT_DIVISIONS.map((value) => ({ value, label: value }))}/><MultiFilter label="Teams" selected={draft.teams} onChange={(values) => setDraft({ ...draft, teams: values })} options={teamNames.map((value) => ({ value, label: value }))}/></div><div className="cong-filter-actions"><div><button type="button" className="button-outline" onClick={reset}>Reset Filters</button><button type="button" onClick={apply}>Apply Filters</button></div><span>{visible.length} participant record{visible.length === 1 ? "" : "s"}</span></div></div>
    {notice && <div className="alert success" role="status">{notice}</div>}{error && <div className="alert error" role="alert">{error}</div>}
    <div className="cong-editor-toolbar"><span><i className="bi bi-info-circle" /> Modify rows inline below, then click <strong>Save All Changes</strong>.</span><div><button type="button" className="danger-outline" disabled={busy || !selected.length} onClick={() => { if (window.confirm("Are you sure you want to delete all selected participants?")) void doWork(() => bulkDeleteQualifiers(selected), "Selected participants deleted."); }}><i className="bi bi-trash" /> Delete Selected</button><button type="button" disabled={busy || !visible.length} onClick={() => void doWork(() => saveQualifiers(visible), "All qualifier changes saved.")}><i className="bi bi-save" /> {busy ? "Saving…" : "Save All Changes"}</button></div></div>
    <div className="table-scroll"><table className="cong-edit-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible participants" checked={Boolean(visible.length) && visible.every((item) => selected.includes(item.id))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...visible.map((item) => item.id)])] : selected.filter((id) => !visible.some((item) => item.id === id)))}/></th><th>Participant Name &amp; Team</th><th>Event &amp; Sport</th><th>Role</th><th>T-Shirt Size</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td data-label="Select"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))}/></td><td data-label="Participant Name & Team"><input required value={item.participant_name} onChange={(event) => update(item.id, { participant_name: event.target.value })}/><select value={item.team ?? ""} onChange={(event) => update(item.id, { team: event.target.value || null })}><option value="">-- Select Team --</option>{teamNames.map((value) => <option key={value}>{value}</option>)}</select></td><td data-label="Event & Sport"><select value={item.event_id} onChange={(event) => update(item.id, { event_id: Number(event.target.value) })}>{data.events.slice().sort(eventSort).map((value) => <option key={value.id} value={value.id}>{value.title} · {value.sport_name} · {value.division}</option>)}</select></td><td data-label="Role"><select value={item.role ?? "Athlete"} onChange={(event) => update(item.id, { role: event.target.value })}>{["Athlete","Coach","Assistant Coach","Chaperon"].map((value) => <option key={value}>{value}</option>)}</select></td><td data-label="T-Shirt Size"><select value={item.tshirt_size ?? ""} onChange={(event) => update(item.id, { tshirt_size: event.target.value || null })}><option value="">--</option>{["XS","S","M","L","XL","2XL","3XL","4XL","5XL"].map((value) => <option key={value}>{value}</option>)}</select></td></tr>)}{!visible.length && <tr><td colSpan={5}>No qualifier records match the current filters.</td></tr>}</tbody></table></div>
  </section>;
}

type MedalEntry={event:MeetEvent;medal:"Gold"|"Silver"|"Bronze";player:string;teamName:string;category:string};
function PlayerReport({data,showEvents,navigate}:{data:AppData;showEvents:boolean;navigate:Nav}){const detail=useMemo(()=>{if(!showEvents)return null;try{return JSON.parse(sessionStorage.getItem("prov_player_detail")??"null") as {player?:string;team?:string;division?:string;category?:string;sport?:string;type?:string}|null;}catch{return null;}},[showEvents]);const [player,setPlayer]=useState(detail?.player??"");const[exact,setExact]=useState(Boolean(detail?.player));const[sport,setSport]=useState(detail?.sport??"");const[type,setType]=useState(detail?.type??"");const[category,setCategory]=useState(detail?.category??"");const[division,setDivision]=useState(detail?.division??"");const[selectedTeam,setSelectedTeam]=useState(detail?.team??"");const all=useMemo(()=>data.events.flatMap((event)=>([["Gold",event.goldteamid,event.gold_winner_name],["Silver",event.silverteamid,event.silver_winner_name],["Bronze",event.bronzeteamid,event.bronze_winner_name]] as const).flatMap(([medal,id,names])=>id===null?[]:winnerNames(names).map((name)=>({event,medal,player:name,teamName:team(data,id),category:event.sport_category&&SPORTS_CATEGORIES.includes(event.sport_category)?event.sport_category:"Unspecified"})))),[data]);const entries=all.filter((entry)=>(!sport||entry.event.sport_name===sport)&&(!type||entry.event.event_category===type)&&(!category||entry.category===category)&&(!division||entry.event.division===division)&&(!selectedTeam||entry.teamName.toLowerCase()===selectedTeam.trim().toLowerCase())&&(!player||(exact?entry.player.toLowerCase()===player.trim().toLowerCase():entry.player.toLowerCase().includes(player.trim().toLowerCase())))).sort((a,b)=>["Gold","Silver","Bronze"].indexOf(a.medal)-["Gold","Silver","Bronze"].indexOf(b.medal)||a.player.localeCompare(b.player)||a.event.title.localeCompare(b.event.title));const counts={gold:entries.filter((e)=>e.medal==="Gold").length,silver:entries.filter((e)=>e.medal==="Silver").length,bronze:entries.filter((e)=>e.medal==="Bronze").length};const reset=()=>{setPlayer("");setExact(false);setSport("");setType("");setCategory("");setDivision("");setSelectedTeam("");sessionStorage.removeItem("prov_player_detail");};return <section className="cong-player-report"><div className="cong-player-sheet"><h1>{showEvents?"Player Event Report":"Player Medal Report"}</h1><p>Bohol Provincial Athletic Meet 2026</p><div className="cong-player-actions no-print"><button className={!showEvents?"active":"button-outline"} onClick={()=>navigate("/reports/players")}>Medal totals</button><button className={showEvents?"active":"button-outline"} onClick={()=>navigate("/reports/player-events")}>Events won</button><button className="button-outline" onClick={()=>printReport()}>Print / Save PDF</button></div><div className="cong-player-filters no-print"><label>Search player<input list="playerNames" placeholder="Type a player name" value={player} onChange={(e)=>setPlayer(e.target.value)}/><datalist id="playerNames">{[...new Set(all.map((e)=>e.player))].sort().map((name)=><option key={name}>{name}</option>)}</datalist></label><label>Sport<select value={sport} onChange={(e)=>setSport(e.target.value)}><option value="">All sports</option>{[...new Set(all.map((e)=>e.event.sport_name).filter(Boolean))].sort().map((value)=><option key={value!}>{value}</option>)}</select></label><label>Type<select value={type} onChange={(e)=>setType(e.target.value)}><option value="">All types</option>{[...new Set(all.map((e)=>e.event.event_category).filter(Boolean))].sort().map((value)=><option key={value!}>{value}</option>)}</select></label><label>Category<select value={category} onChange={(e)=>setCategory(e.target.value)}><option value="">All categories</option>{[...SPORTS_CATEGORIES,"Unspecified"].map((value)=><option key={value}>{value}</option>)}</select></label><label>Division<select value={division} onChange={(e)=>setDivision(e.target.value)}><option value="">All divisions</option>{DIVISIONS.map((value)=><option key={value}>{value}</option>)}</select></label><label>Team<input placeholder="All teams" value={selectedTeam} onChange={(e)=>setSelectedTeam(e.target.value)}/></label><label className="checkbox"><input type="checkbox" checked={exact} onChange={(e)=>setExact(e.target.checked)}/> Exact player name</label><button onClick={reset} className="button-outline">Reset</button></div><p className="cong-active-filters">Filters: {sport||"All sports"} · {type||"All types"} · {category||"All categories"} · {division||"All divisions"} · {player||"All players"} · {selectedTeam||"All teams"}</p><div className="cong-player-counts"><span><strong>Gold</strong>{counts.gold}</span><span><strong>Silver</strong>{counts.silver}</span><span><strong>Bronze</strong>{counts.bronze}</span><span><strong>Total</strong>{entries.length}</span></div><p>Each named player receives one medal per recorded podium result, including team events. Repeated names on the same result are counted once. Players are identified by name, team, and division.</p>{!entries.length&&<div className="alert">No player medals match these filters.</div>}{[...SPORTS_CATEGORIES,"Unspecified"].map((group)=>{const groupEntries=entries.filter((entry)=>entry.category===group);if(!groupEntries.length)return null;return <section className="cong-player-group" key={group}><h2>{group}</h2><p>Gold: {groupEntries.filter((e)=>e.medal==="Gold").length} · Silver: {groupEntries.filter((e)=>e.medal==="Silver").length} · Bronze: {groupEntries.filter((e)=>e.medal==="Bronze").length}</p>{showEvents?<PlayerEventsTable entries={groupEntries}/>:<PlayerTotalsTable entries={groupEntries} onDetails={(entry)=>{sessionStorage.setItem("prov_player_detail",JSON.stringify({player:entry.player,team:entry.teamName,division:entry.event.division,category:group,sport,type}));navigate("/reports/player-events");}}/>}</section>;})}</div></section>;}

function PlayerEventsTable({entries}:{entries:MedalEntry[]}){return <div className="table-scroll"><table className="cong-official-table"><thead><tr><th>Medal</th><th>Player</th><th>Team</th><th>Division</th><th>Sport</th><th>Type</th><th>Event won</th></tr></thead><tbody>{entries.map((entry,index)=><tr key={`${entry.event.id}-${entry.medal}-${entry.player}-${index}`}><td>{entry.medal}</td><td>{entry.player}</td><td>{entry.teamName}</td><td>{entry.event.division}</td><td>{entry.event.sport_name}</td><td>{entry.event.event_category}</td><td>{entry.event.title}</td></tr>)}</tbody></table></div>;}
function PlayerTotalsTable({entries,onDetails}:{entries:MedalEntry[];onDetails:(entry:MedalEntry)=>void}){const groups=new Map<string,{entry:MedalEntry;gold:number;silver:number;bronze:number}>();entries.forEach((entry)=>{const key=`${entry.player.toUpperCase()}|${entry.teamName.toUpperCase()}|${entry.event.division.toUpperCase()}`;const row=groups.get(key)??{entry,gold:0,silver:0,bronze:0};row[entry.medal.toLowerCase() as "gold"|"silver"|"bronze"]++;groups.set(key,row);});const rows=[...groups.values()].sort((a,b)=>compareMedals(a,b)||a.entry.player.localeCompare(b.entry.player));return <div className="table-scroll"><table className="cong-official-table"><thead><tr><th>Player</th><th>Team</th><th>Division</th><th>Gold</th><th>Silver</th><th>Bronze</th><th>Total</th><th className="no-print">Details</th></tr></thead><tbody>{rows.map((row)=><tr key={`${row.entry.player}-${row.entry.teamName}-${row.entry.event.division}`}><td>{row.entry.player}</td><td>{row.entry.teamName}</td><td>{row.entry.event.division}</td><td>{row.gold}</td><td>{row.silver}</td><td>{row.bronze}</td><td>{row.gold+row.silver+row.bronze}</td><td className="no-print"><button className="text-link" onClick={()=>onDetails(row.entry)}>Events won</button></td></tr>)}</tbody></table></div>;}

export function CongMeetReportsPage({data,path,admin,navigate}:{data:AppData;path:string;admin:boolean;navigate:Nav}){const slug=path.split("/")[2] as Report;const report:Report=slug in reportNames?slug:"general";if(!admin&&!["qualifiers","edit-qualifiers","players","player-events"].includes(report))return <section className="panel state-message"><h1>Administrator access required</h1></section>;return <section className="cong-report-page"><ReportSwitcher report={report} admin={admin} navigate={navigate}/>{report==="general"?<GeneralReport data={data} navigate={navigate}/>:report==="results"||report==="pending"?<StandardReport data={data} report={report} navigate={navigate}/>:report==="qualifiers"?<QualifierReport data={data} navigate={navigate}/>:report==="edit-qualifiers"?<EditQualifiersReport data={data} navigate={navigate}/>:<PlayerReport data={data} showEvents={report==="player-events"} navigate={navigate}/>}</section>;}
