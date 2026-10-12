# Provincial Meet

Management system for the Bohol Provincial Athletic Meet 2026.

## Database safety

The provincial database uses only `prov_` tables and the `prov_medal_tallies`
view. The setup reads `cong_events` to copy the event catalog, but does not
overwrite or delete any congressional `cong_` or `subcong_` data.

Run `supabase-provincial-meet.sql` in the Supabase SQL editor for the database
that contains `cong_events`. It seeds the six official delegations once each; event
divisions automatically determine whether medals belong to Elementary,
Secondary, or Paragames standings.

The script also copies the event catalog from `cong_events` into `prov_events`.
It copies only the title, sport name, sport category, division, and event
category. `sport_category` contains `Boys`, `Girls`, or `Mixed`, while
`event_category` contains the event type (`Individual`, `Team`, or
`Demonstration`).
Every copied event starts as `Pending`; congressional results,
coordinator assignments, medal teams, and winner names are not copied. Rerunning
the script skips events whose title, sport, categories, and division already match.

If you already ran an earlier setup script that reversed those two provincial
columns, run `fix-prov-event-categories.sql` once in the Supabase SQL editor.
It corrects only affected `prov_events` rows and does not touch `cong_events`.

The provincial event table omits the unused elimination bracket/team columns and
the unused per-medal school columns. No congressional columns or rows are altered.

The script creates the initial administrator:

- Username: `admin`
- Temporary password: `coordinator`

The application requires that temporary password to be changed after login.

## Configuration

The repository intentionally contains no database connection string or cron
secret. Configure these environment variables on the hosting service:

- `ConnectionStrings__DefaultConnection`: a PostgreSQL connection string for the
  shared Supabase database containing both `cong_` and `prov_` tables.
- `CronJobOrg__CronSecret`: a new, unique secret for the provincial cron endpoint.
- `Meet__DisplayDate`: optional public schedule text shown on the poster and report.
- `Meet__OpeningDate`: optional countdown start in `YYYY-MM-DDTHH:mm:ss+08:00` format.

The provincial app can reuse the congressional app's database connection details
when both use the same Supabase database. Give the provincial cron endpoint its
own secret. For the SQL copy step, `cong_events` must be accessible in the
database where you run the script.

For local PowerShell development, set the connection string in the same terminal
before starting the app. If the direct `db.<project-ref>.supabase.co` host is
unreachable on your network, use the **Session pooler** host, port, and username
shown under **Connect** in the Supabase dashboard. The pooler username is
usually `postgres.<project-ref>`, not just `postgres`:

```powershell
$env:ConnectionStrings__DefaultConnection = 'Host=YOUR_SESSION_POOLER_HOST;Port=5432;Database=postgres;Username=postgres.YOUR_PROJECT_REF;Password=YOUR_PASSWORD;SSL Mode=Require'
dotnet run --project ProvMeet.csproj
```

The setting is session-only. For a hosted deployment, add
`ConnectionStrings__DefaultConnection` in the host's environment settings.
Never commit the actual password to `appsettings.json`.

## Run

Requires the .NET 9 SDK:

```sh
dotnet run --project ProvMeet.csproj
```
