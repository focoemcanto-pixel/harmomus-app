create policy home_featured_kits_admin_access on public.home_featured_kits
for all
to authenticated
using (true)
with check (true);
