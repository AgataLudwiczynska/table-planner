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
