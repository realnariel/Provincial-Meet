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
category. The congressional table's legacy category columns are normalized so
`sport_category` contains the event type (`Individual`, `Team`, or
`Demonstration`) and `event_category` contains `Boys`, `Girls`, or `Mixed`.
Every copied event starts as `Pending`; congressional results,
coordinator assignments, medal teams, and winner names are not copied. Rerunning
the script skips events whose title, sport, categories, and division already match.

The provincial event table omits the unused elimination bracket/team columns and
the unused per-medal school columns. No congressional columns or rows are altered.

The script creates the initial administrator:

- Username: `admin`
- Temporary password: `coordinator`

The application requires that temporary password to be changed after login.

## Configuration

The repository intentionally contains no database connection string or cron
secret. Configure these environment variables on the hosting service:

- `ConnectionStrings__DefaultConnection`: the new provincial PostgreSQL connection string.
- `CronJobOrg__CronSecret`: a new, unique secret for the provincial cron endpoint.
- `Meet__DisplayDate`: optional public schedule text shown on the poster and report.
- `Meet__OpeningDate`: optional countdown start in `YYYY-MM-DDTHH:mm:ss+08:00` format.

Do not reuse the old congressional deployment's connection string or secrets.
For the SQL copy step, `cong_events` must be accessible in the database where
you run the script.

For local PowerShell development, set the connection string in the same terminal
before starting the app (replace the example with the connection string from
your provincial Supabase project):

```powershell
$env:ConnectionStrings__DefaultConnection = 'Host=YOUR_HOST;Port=5432;Database=postgres;Username=YOUR_USER;Password=YOUR_PASSWORD;SSL Mode=Require'
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
