-- Run this in the Supabase SQL editor once per project.

create table if not exists public.rider_positions (
  rider_id   text primary key,
  route_id   text        not null,
  lat        double precision not null,
  lng        double precision not null,
  accuracy_m double precision,
  speed_mps  double precision,
  updated_at timestamptz not null default now()
);

create index if not exists rider_positions_route_id_idx
  on public.rider_positions (route_id);

-- Realtime only forwards tables that are in this publication.
alter publication supabase_realtime add table public.rider_positions;

alter table public.rider_positions enable row level security;

-- Demo-grade access: this app has no login, so the anon key reads and writes
-- directly. Before putting real riders on it, add auth and scope writes to
-- `auth.uid() = rider_id` so one rider cannot overwrite another's position.
drop policy if exists "anon can read positions" on public.rider_positions;
create policy "anon can read positions"
  on public.rider_positions for select
  to anon, authenticated
  using (true);

drop policy if exists "anon can upsert positions" on public.rider_positions;
create policy "anon can upsert positions"
  on public.rider_positions for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon can update positions" on public.rider_positions;
create policy "anon can update positions"
  on public.rider_positions for update
  to anon, authenticated
  using (true)
  with check (true);
