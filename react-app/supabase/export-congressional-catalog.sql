-- Run this SELECT in the OLD congressional Supabase project's SQL Editor.
-- It is read-only: it does not update, delete, or lock congressional results.
-- Download the result as CSV and provide that file for the provincial import.
-- Do not run the repository-root supabase-provincial-meet.sql in the new project.

select
  id as source_event_id,
  title,
  sport_name,
  sport_category,
  division,
  event_category
from public.cong_events
order by id;
