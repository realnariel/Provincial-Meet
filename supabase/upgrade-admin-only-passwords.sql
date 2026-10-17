-- Run once in the NEW provincial Supabase project's SQL Editor.
-- Removes the first-login password-change requirement for existing accounts.
-- Password changes remain available only through the coordinator-admin Edge
-- Function, whose reset-password action requires an administrator profile.
begin;

alter table public.prov_coordinators
  alter column must_change_password set default false;

update public.prov_coordinators
set must_change_password = false
where must_change_password;

create or replace function private.prov_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.prov_coordinators c
    where c.auth_user_id = (select auth.uid())
      and c.is_admin
  );
$$;

create or replace function private.prov_can_manage_event(p_event_id integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.prov_is_admin() or exists (
    select 1
    from public.prov_events e
    join public.prov_coordinators c on c.id = e.coordinatorid
    where e.id = p_event_id
      and c.auth_user_id = (select auth.uid())
  );
$$;

revoke all on function private.prov_is_admin() from public;
revoke all on function private.prov_can_manage_event(integer) from public;
grant usage on schema private to authenticated;
grant execute on function private.prov_is_admin() to authenticated;
grant execute on function private.prov_can_manage_event(integer) to authenticated;

commit;
