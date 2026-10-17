# Provincial Meet React application

This is a separate, static React/Vite application under the existing repository.
The ASP.NET MVC files and their current Supabase database remain untouched.
The new app uses the **same `prov_*` table and view names** as the MVC app.
`prov_coordinators` adds `auth_user_id` for Supabase Auth; its old
`passwordhash` column is retained but never exposed or used by the React
application. Password changes are performed only by an administrator.

## When the new Supabase project is available

1. In the **new** project's SQL Editor, run `supabase/schema.sql`. Do not run
   the repository-root `supabase-provincial-meet.sql`: that script references
   `cong_events` in the old shared database.
   The schema was applied on 2026-10-14. A read-only check returned six teams,
   zero events, and 18 standings rows. Anonymous reads of the coordinator,
   qualifier, and cron tables returned HTTP 401.
2. Disable public sign-up in Supabase Auth settings. Create the first Auth user
   in the dashboard using email `admin@accounts.provmeet.example.com`, a unique
   temporary password of at least 6 characters, and mark the email confirmed.
   The email is an internal username alias; it does not need to receive mail.
3. Run this in the **new** project's SQL Editor to associate that Auth user
   with the admin profile:

   ```sql
   insert into public.prov_coordinators
     (username, fullname, is_admin, auth_user_id, must_change_password)
   select 'admin', 'Provincial Meet Administrator', true, id, false
   from auth.users
   where email = 'admin@accounts.provmeet.example.com';
   ```

   Check that exactly one row was inserted. Password changes are performed by
   an administrator from the Coordinators screen.
4. Deploy the `supabase/functions/coordinator-admin` Edge Function **only to
   the new project**. It uses the project's server-side service-role credential
   from the Supabase Function environment; do not put that key in this app.
   Its `deno.json` maps the Supabase package for the Edge runtime. For editor
   diagnostics, install the recommended Deno VS Code extension; Deno is scoped
   to the Edge Function folder. `npm run check:function` also checks this file
   without affecting the React TypeScript configuration.
   If `schema.sql` was run before the atomic-assignment function was added,
   also run `supabase/upgrade-atomic-assignments.sql` in this **new** project.
   It creates one admin-only batch function; it does not alter event data.
   The React Assignments button requires this upgrade.
   Run `supabase/upgrade-result-workflows.sql` as well on an existing project.
   It repairs the authenticated publish/clear-result RPCs without changing any
   saved event, result, team, coordinator, or qualifier rows.
   Run `supabase/upgrade-admin-only-passwords.sql` to remove the first-login
   password-change requirement from existing accounts. Password resets are
   then performed only by an administrator from the Coordinators screen.
   Run `supabase/upgrade-report-parity.sql` so signed-in coordinators can read
   the consolidated Regional Qualifier and Participant reports. It changes
   read access only; result and delegation writes remain event-scoped.
5. The congressional catalog was exported with a read-only transaction and
   packaged in `supabase/import-congressional-catalog.sql`. Review
   `supabase/catalog-category-audit.md`, then run the import SQL in the
   **new** provincial project's SQL Editor only. Copy the SQL itself, without
   Markdown code fences. It refuses to run if congressional tables are present
   or provincial events already exist. Its final query should report 412
   events, 25 sports, 412 Pending, and zero rows with old results.

   `supabase/export-congressional-catalog.sql` is an optional read-only
   source audit. Do not upload its CSV directly to `prov_events`:
   `source_event_id` is for verification, not a column in the new table.
   Congressional results and accounts stay behind.

   **Do not export or import** results, coordinators, qualifiers, or passwords.
6. Copy `.env.example` to `.env.local` and fill in only the **new** project's URL
   and publishable key. Both are intended for browser use. Never put the
   database password or a secret/service-role key in a `VITE_` variable.
7. Run `npm install`, `npm run dev`, and `npm run build` from this folder.

Static hosting must rewrite unknown paths such as `/events` and `/reports/general`
to `index.html`. Keep the MVC site available until the new app has been tested
against the new database.

## Render deployment

The repository-root `render.yaml` configures this app as a Render Static Site.
It runs `npm ci && npm run build`, publishes `dist`, and rewrites `/*` to
`/index.html` for direct navigation to
React routes. During Blueprint creation, enter `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` using the same browser-safe values from the
local `.env.local` file. Do not add the service-role key to Render.

The first dashboard-created admin accounts used real email addresses rather
than the app's synthetic username addresses. The sign-in field accepts either
the assigned username (for accounts created by the coordinator function) or
the actual email address (for those dashboard-created accounts). No real
email-to-username map is published in the browser bundle.

The React visual layer now reuses the MVC poster illustration and green/gold
scoreboard styling across home, rankings, events, teams, staff screens, and
reports. Rankings rotates divisions every 10 seconds (manual selection pauses
rotation for 15 seconds); visible pages refresh public data every minute. The
player report aggregates medals by player/team/division with event drill-down,
and the pending report groups division, sport, and category. Match-specific
wording remains provincial. Exact responsive and print comparisons still
require a browser-side review before cutover.

## Current verification limits

The React application compiles to a static site without a configured Supabase
project. Database policies, Auth, Edge Functions, event import, and end-to-end
report behavior still require a new test project before cutover. CSV export can
be opened in Excel, but the old app's spreadsheet formatting is not yet
reproduced exactly. The migration checklist in `./REACT_MIGRATION_PLAN.md`
tracks remaining parity work.
