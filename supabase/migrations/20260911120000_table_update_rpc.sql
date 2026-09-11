-- S-04: atomic rename + resize RPC for tables, with guest auto-unassign on shrink.
-- Copies the F-01 create_table_with_seats() SECURITY DEFINER + ownership-guard + grant pattern.

-- SECURITY DEFINER bypasses RLS on the seats writes, so ownership is the first guard.
-- SET search_path = public hardens against search_path hijacking.
create or replace function public.update_table(
  p_table_id uuid,
  p_name text,
  p_seat_count int
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_count int;
  v_freed uuid[];
begin
  if not exists (
    select 1 from weddings
    where id = (select wedding_id from tables where id = p_table_id)
      and user_id = auth.uid()
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if p_seat_count < 1 or p_seat_count > 30 then
    raise exception 'seat_count_out_of_range' using errcode = '22023';
  end if;

  -- Read current count before the update; both resize branches compare against it.
  select seat_count into v_current_count from tables where id = p_table_id;

  -- Capture freed guests before the seat delete cascades their assignments away.
  select coalesce(array_agg(a.guest_id), '{}')
    into v_freed
    from assignments a
    join seats s on s.id = a.seat_id
   where s.table_id = p_table_id and s.seat_number > p_seat_count;

  update tables set name = p_name, seat_count = p_seat_count where id = p_table_id;

  if p_seat_count < v_current_count then
    delete from seats where table_id = p_table_id and seat_number > p_seat_count; -- cascade drops assignments
  elsif p_seat_count > v_current_count then
    insert into seats (table_id, seat_number)
      select p_table_id, generate_series(v_current_count + 1, p_seat_count);
  end if;

  return v_freed;
end $$;

-- Strip default PUBLIC/anon EXECUTE; grant only authenticated (guard still gates by auth.uid()).
revoke execute on function public.update_table(uuid, text, int) from public, anon;
grant execute on function public.update_table(uuid, text, int) to authenticated;
