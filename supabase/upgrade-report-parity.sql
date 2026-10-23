begin;

-- The legacy meet's Regional Qualifier and Participant reports are consolidated
-- reports for all signed-in meet staff. This adds report-wide read access while
-- retaining the existing event-scoped insert, update, and delete policies.
drop policy if exists prov_qualifiers_staff_report_read on public.prov_qualifiers;
create policy prov_qualifiers_staff_report_read
on public.prov_qualifiers
for select
to authenticated
using (true);

commit;
