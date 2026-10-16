# Provincial Meet React migration checklist

This is a parity checklist for a **separate React application and a separate
Supabase project**. The ASP.NET MVC application and its shared database remain
the reference implementation and must not be changed or deleted during the
migration. Do not cut over until every item below is verified in the new app.

## Implementation snapshot (2026-10-15)

The first React implementation is in `react-app/`. It compiles as a static site
and includes the public screens, event/result forms, qualifier editing,
coordinator account controls, and first-pass reports. The new SQL keeps the
existing `prov_*` names and adds only the Auth-link fields needed for a browser
client. The new schema has now passed initial read-only checks: six public
teams, zero events, and 18 standings rows were returned, while anonymous
requests to coordinators, qualifiers, and cron logs returned HTTP 401. **The
remaining boxes below are not considered verified yet**: Auth, result
workflows, import accuracy, responsive/print comparison, and load behavior
still need end-to-end tests. Known parity gaps include the original General Official
Report's exact print composition, Excel `.xlsx` formatting, per-row qualifier
bulk editing, and some report-specific filters. Basic bulk add/delete is present.
The deployed `coordinator-admin` function also returned the expected HTTP 401
for an unauthenticated test request. The owner has since signed in to the new
project using the email fallback; full coordinator workflows remain untested.
The React home, rankings, events, teams, and report surfaces now reuse the
MVC poster artwork, green-and-gold score cards, medal-board treatment, and
formal report presentation. Rankings now rotates Overall → Secondary →
Elementary → Paragames every 10 seconds, pauses for 15 seconds after manual
selection, and refreshes data at the cycle boundary. The pending report has
division/sport/category grouping; player medal totals and event drill-down
are implemented; the qualifier report groups sport/event/role and is accessible
to coordinators for their assigned events. TypeScript and production build pass, but a pixel-by-pixel
desktop/mobile and print comparison is still outstanding.

The read-only congressional catalog export has been packaged as a guarded SQL
import (`react-app/supabase/import-congressional-catalog.sql`): 412 events,
25 sports, all Pending. It has **not** been executed in the new project yet.
The audit of source-category ambiguities is alongside it.

**Do not claim full parity yet.** Live role/RLS checks, applying and testing the
new atomic bulk-assignment SQL upgrade,
exact Excel `.xlsx` export, qualifier bulk-row editing, exact printed report
layout, responsive comparison, and concurrent-load tests remain open. The
source MVC database and its data are untouched.

## Decisions

- New Supabase project/database, created by the project owner.
- Copy the event catalog only; every imported event starts `Pending`. Do not
  copy results, medal winners, qualifiers, coordinator assignments, or cron logs.
- Keep the visible username/password sign-in flow. Implement authentication
  through Supabase Auth and a secure username-to-account mapping; never expose
  password hashes, database credentials, or a secret/service-role key to React.
- Reuse the current green-and-gold identity, logos, responsive navigation,
  printable report layouts, and PWA behavior unless explicitly changed.
- Keep the six teams once each. Elementary, Secondary, and Paragames standings
  are derived from the division of each completed event.
- `sport_category` means Boys/Girls/Mixed; `event_category` means event type
  (Individual/Team/Demonstration or an imported type).

## Public feature parity

- [ ] Home: hero, meet details, live medal summary, recent results, responsive
  layout, and empty/loading/error states.
- [ ] Rankings: overall, Secondary, Elementary, and Paragames standings with
  existing tie ordering and filters. Auto-rotation is implemented; verify with
  real results and browser timing.
- [ ] Events: title search, sport/category/division/status filters, result
  display, assigned-event view for logged-in coordinators.
- [ ] Teams: dashboard, division filters, team detail, medal and event lists.
- [ ] Mobile navigation, logos/images, app manifest/install prompt, and
  existing accessibility/keyboard behavior.

## Sign-in and administration

- [ ] Username sign-in, sign-out, admin-only password reset, denied-access
  handling, and session persistence.
- [ ] Admin creates, edits, resets credentials for, and deletes coordinators;
  admin/coordinator role boundaries are enforced in database policies/functions,
  not only hidden buttons.
- [ ] Admin creates, edits, deletes events and assigns/reassigns coordinators
  individually or in bulk.
- [ ] Coordinators may only modify assigned events, while admins may modify all
  events. Prevent cross-event ID substitution and partial unauthorized bulk edits.
- [ ] Submit, update, and clear results, including medal teams and winner names;
  preserve pending/completed transitions and distinct-medal-team rules.
- [ ] Qualifier and delegation management: add/edit/delete, bulk operations,
  winner import, team/district/school/gender/size/role fields, autocomplete,
  and authorization checks.

## Reports and exports

- [ ] General Official Report: four standings tables, acronym labels,
  signatories, print/PDF layout.
- [ ] All Events Results Report: sport/event/division/team filters, signatories,
  print/PDF and Excel export.
- [ ] Pending Events Report: division/sport/Boys-Girls-Mixed grouping and print.
  Grouping is implemented; print comparison remains.
- [ ] District/Regional Qualifier Report: participant and staff grouping,
  counts, print and spreadsheet export where currently available.
- [ ] Player Medal Report and Player Event Report: all existing filters, totals,
  drill-down links, and print/PDF.
- [ ] Any qualifier edit/report entry points and filter-state persistence used
  by the existing report pages.

## New database and security

- [ ] Create a fresh schema for teams, events, qualifiers, coordinator profiles,
  standings, and necessary database functions. Omit cron-only tables if no
  scheduled task remains.
- [ ] Export title, sport name, `sport_category`, `event_category`, and division
  from the old database, then import to the new project with status `Pending`.
  The existing setup SQL references `cong_events` and is **not** directly usable
  in the new database.
- [ ] Seed six official teams exactly once. Do not seed a reusable default
  password into a browser-accessible table.
- [ ] Use Supabase Auth for accounts and per-table Row Level Security for public
  reads, admin writes, and assignment-scoped coordinator writes. Use trusted
  server-side functions for privileged account administration and atomic
  multi-row changes.
- [ ] Test anonymous, coordinator, and admin permissions, including hostile
  direct API requests. Check view/function access separately from table access.
- [ ] Keep the old project's credentials and data separate; never run schema
  changes against the old shared competition database.

## Verification and cutover

- [ ] Compare every route and key screen at desktop and mobile widths against
  the MVC original. Verify print pages and exported spreadsheets visually.
- [ ] Run feature and authorization regression tests against the new project.
- [ ] Load-test public standings/events traffic and coordinator result entry.
- [ ] Keep MVC deployed as a fallback until all parity checks pass and the new
  static site works with the new Supabase project.

## Inputs still needed

- The new Supabase project URL and **publishable** key after the owner creates
  it. Never send the database password or secret/service-role key in chat.
- A one-time event-catalog export from the old database, or access to a safe
  export mechanism. No result data is needed.
