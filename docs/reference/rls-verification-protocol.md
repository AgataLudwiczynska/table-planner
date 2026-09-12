# RLS cross-account verification protocol

Shared runbook for verifying RLS isolation. Linked from every migration that ships RLS
(F-01 `weddings`/`tables`/`seats`, S-02 guests+conflicts, S-03 assignments).

> **Run as the `authenticated` role, NOT the default `postgres`.** In postgres mode RLS
> is bypassed and `auth.uid()` = NULL, so steps 3–5 return every row (false-fail).
> In the Studio SQL Editor: "Run as" → authenticated + pick a user.
> Fallback (older Studio): wrap each user's steps in a transaction with
> `set local role authenticated;` +
> `set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';`

**Prep:** create two test users A and B via Studio Auth (magic link → Inbucket http://127.0.0.1:54324).

**As user A** (impersonate A → `auth.uid()` = uuid_A):
1. `insert into weddings (user_id, name) values (auth.uid(), 'A wedding') returning id;` → returns `uuid_W_A`
2. `select create_table_with_seats(uuid_W_A, 'A table', 10);` → returns `uuid_T`; `select count(*) from seats where table_id = uuid_T` → 10

**As user B** (switch impersonation to B):
3. `select * from weddings where id = uuid_W_A;` → MUST return 0 rows (RLS blocks SELECT)
4. `update weddings set name = 'hacked' where id = uuid_W_A;` → MUST affect 0 rows (RLS blocks UPDATE)
5. `delete from weddings where id = uuid_W_A;` → MUST affect 0 rows (RLS blocks DELETE)
6. `select create_table_with_seats(uuid_W_A, 'B hack', 5);` → MUST raise `not_owner` (RPC ownership check)

## S-02: guests + guest_conflicts

Reuses `uuid_W_A` from above (user A's wedding).

**As user A** (impersonate A):
7. `insert into guests (wedding_id, first_name, last_name) values (uuid_W_A, 'Anna', 'Nowak') returning id;` → `uuid_G_A1`
8. `insert into guests (wedding_id, first_name, last_name) values (uuid_W_A, 'Bartek', 'Kowalski') returning id;` → `uuid_G_A2`
9. `insert into guest_conflicts (wedding_id, guest_a_id, guest_b_id) values (uuid_W_A, least(uuid_G_A1, uuid_G_A2)::uuid, greatest(uuid_G_A1, uuid_G_A2)::uuid) returning id;` → `uuid_C_A`

**As user B** (switch impersonation to B):
10. `select * from guests where wedding_id = uuid_W_A;` → MUST return 0 rows (RLS blocks SELECT)
11. `select * from guest_conflicts where wedding_id = uuid_W_A;` → MUST return 0 rows
12. `update guests set last_name = 'hacked' where id = uuid_G_A1;` → MUST affect 0 rows
13. `delete from guest_conflicts where id = uuid_C_A;` → MUST affect 0 rows
14. `insert into guests (wedding_id, first_name, last_name) values (uuid_W_A, 'X', 'Y');` → MUST affect 0 rows (RLS `with check` blocks INSERT into A's wedding)

**As anon** (no auth — wrap in a transaction: `begin; set local role anon;` … `rollback;`):
15. `select * from guests;` and `select * from guest_conflicts;` → MUST raise `permission denied` (grants revoked from anon), not just 0 rows

## S-03: assignments

Reuses `uuid_W_A` (user A's wedding), `uuid_T` (user A's table from step 2), and `uuid_G_A1`/`uuid_G_A2` (user A's guests from steps 7–8).

**As user A** (impersonate A):
16. `select id from seats where table_id = uuid_T order by seat_number limit 1;` → `uuid_S_A1` (a seat of A's table)
17. `insert into assignments (wedding_id, guest_id, seat_id) values (uuid_W_A, uuid_G_A1, uuid_S_A1) returning id;` → `uuid_AS_A`

**As user B** (switch impersonation to B):
18. `select * from assignments where wedding_id = uuid_W_A;` → MUST return 0 rows (RLS blocks SELECT)
19. `update assignments set seat_id = uuid_S_A1 where id = uuid_AS_A;` → MUST affect 0 rows (RLS blocks UPDATE)
20. `delete from assignments where id = uuid_AS_A;` → MUST affect 0 rows (RLS blocks DELETE)
21. `insert into assignments (wedding_id, guest_id, seat_id) values (uuid_W_A, uuid_G_A2, uuid_S_A1);` → MUST raise `42501` (RLS `with check` blocks INSERT into A's wedding)

**As anon** (no auth — wrap in a transaction: `begin; set local role anon;` … `rollback;`):
22. `select * from assignments;` → MUST raise `permission denied` (grants revoked from anon), not just 0 rows

## S-04: update_table RPC (rename + resize)

Reuses `uuid_W_A` (user A's wedding) and `uuid_T` (user A's table from step 2).
No new RLS table ships here — only a SECURITY DEFINER RPC — so this covers the RPC's
ownership guard + anon revoke, not table policies.

**As user A** (impersonate A):
23. `select update_table(uuid_T, 'A table', 12);` → returns `{}` (grow frees nobody); `select count(*) from seats where table_id = uuid_T` → 12

**As user B** (switch impersonation to B):
24. `select update_table(uuid_T, 'B hack', 5);` → MUST raise `not_owner` / `42501` (RPC ownership check); table unchanged

**Out-of-range (as user A):**
25. `select update_table(uuid_T, 'A table', 0);` and `select update_table(uuid_T, 'A table', 31);` → MUST raise `seat_count_out_of_range` / `22023`

**As anon** (no auth — wrap in a transaction: `begin; set local role anon;` … `rollback;`):
26. `select update_table(uuid_T, 'x', 5);` → MUST raise `permission denied for function update_table` (execute revoked from anon)
