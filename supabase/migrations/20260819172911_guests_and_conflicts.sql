-- S-02: guests + guest_conflicts (owner-scoped) + owner-only RLS.
-- Copies the F-01 owner-chain RLS + FK-index pattern.

-- Tables ----------------------------------------------------------------------

-- side/group are text + CHECK (not enums) so MVP values evolve via a trivial migration.
-- `group` is reserved, so the column is `guest_group` (DTO field stays `group`).
create table guests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  side text check (side is null or side in ('panna_mloda', 'pan_mlody', 'wspolne', 'nieokreslone')),
  guest_group text check (guest_group is null or guest_group in ('rodzina', 'przyjaciele', 'wspolpracownicy')),
  created_at timestamptz not null default now(),
  -- Lets a display name resolve to a single guest id (Konflikty picker).
  unique (wedding_id, first_name, last_name)
);

-- Canonical order + unique on the ordered pair make (A,B)/(B,A) impossible (S-03 counting).
-- wedding_id is denormalized for a single-join owner policy; the service is its sole guarantor.
create table guest_conflicts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings (id) on delete cascade,
  guest_a_id uuid not null references guests (id) on delete cascade,
  guest_b_id uuid not null references guests (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (guest_a_id < guest_b_id),
  unique (guest_a_id, guest_b_id)
);

-- FK indexes: RLS owner-chain subqueries these FKs per row; without them each check seq-scans.
create index on guests (wedding_id);
create index on guest_conflicts (wedding_id);
create index on guest_conflicts (guest_a_id);
create index on guest_conflicts (guest_b_id);

-- RLS -------------------------------------------------------------------------
-- No anon policies: RLS default-deny already blocks anon.

alter table guests enable row level security;
alter table guest_conflicts enable row level security;

-- Revoke anon: default-deny blocks rows, but Supabase grants still expose the tables in the anon schema.
revoke all on guests, guest_conflicts from anon;

-- guests: full owner CRUD, owner-chain via wedding_id.
create policy guests_select on guests
  for select to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy guests_insert on guests
  for insert to authenticated
  with check (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy guests_update on guests
  for update to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy guests_delete on guests
  for delete to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

-- guest_conflicts: SELECT/INSERT/DELETE only — a conflict is add/remove, never updated.
create policy guest_conflicts_select on guest_conflicts
  for select to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy guest_conflicts_insert on guest_conflicts
  for insert to authenticated
  with check (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy guest_conflicts_delete on guest_conflicts
  for delete to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));
