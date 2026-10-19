-- Run once in the NEW provincial Supabase project's SQL Editor.
-- This only replaces the result RPCs and their permissions. It does not alter
-- existing events, results, teams, coordinators, or qualifiers.
-- Legacy single-award upgrade: do NOT run after upgrade-multiple-awards.sql.
begin;

do $$
begin
  if to_regclass('public.prov_events') is null or
     to_regclass('public.prov_teams') is null or
     to_regclass('public.prov_qualifiers') is null or
     to_regprocedure('private.prov_can_manage_event(integer)') is null then
    raise exception 'Provincial schema is incomplete; apply schema.sql first';
  end if;
end
$$;

create or replace function public.prov_publish_result(
  p_event_id integer,
  p_gold_team_id integer,
  p_silver_team_id integer,
  p_bronze_team_id integer,
  p_gold_winner_name text,
  p_silver_winner_name text,
  p_bronze_winner_name text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_team_name text;
  v_name text;
  v_gender text;
begin
  if not private.prov_can_manage_event(p_event_id) then
    raise exception 'Not permitted to publish this event';
  end if;

  if (p_gold_team_id is not null and
      p_gold_team_id in (p_silver_team_id, p_bronze_team_id)) or
     (p_silver_team_id is not null and
      p_silver_team_id = p_bronze_team_id) then
    raise exception 'A team cannot receive two medals in one event';
  end if;

  select title
  into v_title
  from public.prov_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found';
  end if;

  update public.prov_events
  set goldteamid = p_gold_team_id,
      silverteamid = p_silver_team_id,
      bronzeteamid = p_bronze_team_id,
      gold_winner_name = nullif(btrim(p_gold_winner_name), ''),
      silver_winner_name = nullif(btrim(p_silver_winner_name), ''),
      bronze_winner_name = nullif(btrim(p_bronze_winner_name), ''),
      status = 'Completed'
  where id = p_event_id;

  select name
  into v_team_name
  from public.prov_teams
  where id = p_gold_team_id;

  v_gender := case
    when v_title ilike '%boys%' then 'M'
    when v_title ilike '%girls%' then 'W'
    else null
  end;

  if v_team_name is not null then
    for v_name in
      select initcap(btrim(value))
      from regexp_split_to_table(
        coalesce(p_gold_winner_name, ''), E'[\\r\\n]+'
      ) as names(value)
      where btrim(value) <> ''
    loop
      update public.prov_qualifiers
      set participant_name = v_name,
          team = v_team_name,
          role = 'Athlete',
          gender = v_gender,
          updated_by = auth.uid(),
          updated_at = now() at time zone 'utc'
      where event_id = p_event_id
        and lower(participant_name) = lower(v_name);

      if not found then
        insert into public.prov_qualifiers
          (event_id, participant_name, team, role, gender, updated_by)
        values
          (p_event_id, v_name, v_team_name, 'Athlete', v_gender, auth.uid());
      end if;
    end loop;
  end if;
end;
$$;

create or replace function public.prov_clear_result(p_event_id integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.prov_can_manage_event(p_event_id) then
    raise exception 'Not permitted to clear this event';
  end if;

  update public.prov_events
  set status = 'Pending',
      goldteamid = null,
      silverteamid = null,
      bronzeteamid = null,
      gold_winner_name = null,
      silver_winner_name = null,
      bronze_winner_name = null
  where id = p_event_id;

  delete from public.prov_qualifiers where event_id = p_event_id;
end;
$$;

revoke all on function public.prov_publish_result(
  integer, integer, integer, integer, text, text, text
) from public;
revoke all on function public.prov_clear_result(integer) from public;
grant execute on function public.prov_publish_result(
  integer, integer, integer, integer, text, text, text
) to authenticated;
grant execute on function public.prov_clear_result(integer) to authenticated;

commit;
