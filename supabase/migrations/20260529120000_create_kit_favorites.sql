create table if not exists public.kit_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kit_id uuid not null references public.kits(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, kit_id)
);

create index if not exists idx_kit_favorites_user_created_at
  on public.kit_favorites(user_id, created_at desc);

create index if not exists idx_kit_favorites_kit_id
  on public.kit_favorites(kit_id);

alter table public.kit_favorites enable row level security;

drop policy if exists "Users can read own kit favorites" on public.kit_favorites;
create policy "Users can read own kit favorites"
  on public.kit_favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own kit favorites" on public.kit_favorites;
create policy "Users can insert own kit favorites"
  on public.kit_favorites
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own kit favorites" on public.kit_favorites;
create policy "Users can delete own kit favorites"
  on public.kit_favorites
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Admins can manage kit favorites" on public.kit_favorites;
create policy "Admins can manage kit favorites"
  on public.kit_favorites
  for all
  using (coalesce((select role::text from public.profiles where id = auth.uid()), '') = 'admin')
  with check (coalesce((select role::text from public.profiles where id = auth.uid()), '') = 'admin');
