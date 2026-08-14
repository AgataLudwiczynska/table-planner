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
