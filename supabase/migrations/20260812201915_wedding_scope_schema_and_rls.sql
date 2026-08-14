-- F-01: wedding-scope schema (weddings/tables/seats) + owner-only RLS + atomic RPC.
-- First migration of the repo — establishes the RLS + RPC patterns reused by S-02/S-03.
-- RLS cross-account verification: see docs/reference/rls-verification-protocol.md

-- Defensive: gen_random_uuid() lives in core since PG13 (config is PG17), so this
-- guard is belt-and-suspenders for a fresh project without the extension.
create extension if not exists pgcrypto;

-- Tables ----------------------------------------------------------------------

create table weddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table tables (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings (id) on delete cascade,
  name text not null,
  seat_count int not null check (seat_count > 0),
  created_at timestamptz not null default now()
);

create table seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references tables (id) on delete cascade,
  seat_number int not null check (seat_number > 0),
  created_at timestamptz not null default now(),
  unique (table_id, seat_number)
);

-- FK indexes: RLS owner-chain policies subquery these FKs on every row check;
-- without the index each policy evaluation is a seq scan.
create index on tables (wedding_id);
create index on seats (table_id);

-- RLS -------------------------------------------------------------------------
-- No policies for the `anon` role: RLS default-deny already blocks it, so an
-- explicit `TO anon USING (false)` would add lines without adding protection.

alter table weddings enable row level security;
alter table tables enable row level security;
alter table seats enable row level security;

-- Harden: anon gets nothing. RLS default-deny already blocks anon rows, but
-- Supabase's default table grants still expose these tables in the anon GraphQL
-- schema (discoverable via introspection). Revoking removes them entirely.
revoke all on weddings, tables, seats from anon;

-- weddings: full owner CRUD (S-01 auto-provision INSERT, rename UPDATE, delete).
create policy weddings_select on weddings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy weddings_insert on weddings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy weddings_update on weddings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy weddings_delete on weddings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- tables: owner-chain SELECT/UPDATE/DELETE (S-01 list, S-04 rename+delete).
-- No INSERT policy — rows are created exclusively via create_table_with_seats().
create policy tables_select on tables
  for select to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy tables_update on tables
  for update to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

create policy tables_delete on tables
  for delete to authenticated
  using (exists (
    select 1 from weddings w
    where w.id = wedding_id and w.user_id = (select auth.uid())
  ));

-- seats: SELECT only — seats are created/removed solely via the RPC + FK cascade.
create policy seats_select on seats
  for select to authenticated
  using (exists (
    select 1 from tables t
    join weddings w on w.id = t.wedding_id
    where t.id = table_id and w.user_id = (select auth.uid())
  ));

-- RPC -------------------------------------------------------------------------
-- SECURITY DEFINER bypasses RLS on the seats INSERT, so the function MUST verify
-- ownership itself before writing — otherwise any authenticated user could seed
-- rows into someone else's wedding. Ownership check is the first guard.
-- SET search_path = public hardens against search_path hijacking (SECURITY DEFINER best practice).
create or replace function public.create_table_with_seats(
  p_wedding_id uuid,
  p_name text,
  p_seat_count int
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_table_id uuid;
begin
  if p_seat_count <= 0 then
    raise exception 'seat_count_must_be_positive' using errcode = '22023';
  end if;

  if not exists (
    select 1 from weddings where id = p_wedding_id and user_id = auth.uid()
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  insert into tables (wedding_id, name, seat_count)
    values (p_wedding_id, p_name, p_seat_count)
    returning id into v_table_id;

  insert into seats (table_id, seat_number)
    select v_table_id, generate_series(1, p_seat_count);

  return v_table_id;
end $$;

-- EXECUTE reaches anon two ways: Postgres' default PUBLIC grant on function
-- creation, plus Supabase's default privileges granting anon directly. Strip both
-- so anon can't reach this SECURITY DEFINER RPC via /rest/v1/rpc, then grant only
-- authenticated — the ownership guard still gates by auth.uid() on top.
revoke execute on function public.create_table_with_seats(uuid, text, int) from public, anon;
grant execute on function public.create_table_with_seats(uuid, text, int) to authenticated;
