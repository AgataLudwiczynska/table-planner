-- S-03: assignments (one row per guest) + owner-only RLS.
-- Copies the F-01/S-02 owner-chain RLS + FK-index pattern.

-- Tables ----------------------------------------------------------------------

-- One row per guest: unique(guest_id) makes assign/move an upsert; unique(seat_id) enforces max 1 guest/seat.
-- wedding_id denormalized (seats has no wedding_id) for a single-join owner policy; the service guards membership.
create table assignments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings (id) on delete cascade,
  guest_id uuid not null references guests (id) on delete cascade,
  seat_id uuid not null references seats (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guest_id),
  unique (seat_id)
);

-- FK index: RLS owner-chain subqueries wedding_id per row; without it each check seq-scans.
-- guest_id/seat_id already get indexes from their unique constraints.
create index on assignments (wedding_id);

-- RLS -------------------------------------------------------------------------
-- No anon policies: RLS default-deny already blocks anon.

alter table assignments enable row level security;

-- Revoke anon: default-deny blocks rows, but Supabase grants still expose the table in the anon schema.
revoke all on assignments from anon;

-- assignments: full owner CRUD, owner-chain via wedding_id (UPDATE covers the upsert move).
create policy assignments_select on assignments
  for select to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy assignments_insert on assignments
  for insert to authenticated
  with check (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy assignments_update on assignments
  for update to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy assignments_delete on assignments
  for delete to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));
