-- Run ONLY in the NEW provincial Supabase project cgpafvjqlbhwulhsfncf.
-- This upgrades an already-installed schema without changing existing rows.
begin;
do $$
begin
  if to_regclass('public.cong_events') is not null then
    raise exception 'Refusing to run in a congressional database';
  end if;
  if to_regclass('public.prov_events') is null or
     to_regprocedure('private.prov_is_admin()') is null then
    raise exception 'Provincial React schema not found';
  end if;
end;
$$;

create or replace function public.prov_set_event_assignments(p_assignments jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
  v_distinct integer;
  v_changed integer;
begin
  if not private.prov_is_admin() then
    raise exception 'Only an administrator may assign coordinators';
  end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'Assignments must be an array';
  end if;
  select count(*), count(distinct x.event_id) into v_count, v_distinct
  from jsonb_to_recordset(p_assignments) as x(event_id integer, coordinator_id integer);
  if v_count <> v_distinct or exists (
    select 1 from jsonb_to_recordset(p_assignments) as x(event_id integer, coordinator_id integer)
    where x.event_id is null or not exists (select 1 from public.prov_events e where e.id = x.event_id)
      or (x.coordinator_id is not null and not exists (
        select 1 from public.prov_coordinators c where c.id = x.coordinator_id))
  ) then
    raise exception 'Duplicate, missing event, or invalid coordinator in assignment batch';
  end if;
  update public.prov_events e set coordinatorid = x.coordinator_id
  from jsonb_to_recordset(p_assignments) as x(event_id integer, coordinator_id integer)
  where e.id = x.event_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_count then
    raise exception 'Only % of % assignments were saved', v_changed, v_count;
  end if;
  return v_changed;
end;
$$;
revoke all on function public.prov_set_event_assignments(jsonb) from public;
grant execute on function public.prov_set_event_assignments(jsonb) to authenticated;
commit;
