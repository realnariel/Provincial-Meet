-- Run once in the Supabase SQL editor if the earlier provincial import placed
-- Individual/Team/etc. in sport_category and Boys/Girls/Mixed in event_category.
-- Only affected provincial rows are updated; congressional data is untouched.
update public.prov_events
set sport_category = event_category,
    event_category = sport_category
where upper(btrim(coalesce(event_category, ''))) in ('BOYS', 'GIRLS', 'MIXED')
  and upper(btrim(coalesce(sport_category, ''))) not in ('BOYS', 'GIRLS', 'MIXED');
