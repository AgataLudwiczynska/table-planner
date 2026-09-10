# Secure integration testing for Supabase — Phase 2 (`testing-api-rls-integration`)

> Standalone security-focused research note. Kept separate from any formal
> `/10x-research` `research.md` so it does not collide. Sources pulled fresh
> via Context7 (official Supabase docs) — see the bottom of this file.
>
> Scope: Risk #3 (RLS / IDOR), Risk #5 (server trusts client input), and the
> deferred #1 DB-check (`guest_conflicts` canonical-ordering constraint), per
> `context/foundation/test-plan.md` §3 Phase 2.

## The core insight

The test harness for RLS/IDOR is itself a **privileged security tool**: to set
up two users' data it must hold the `service_role` key, which has the Postgres
`BYPASSRLS` attribute and full access to every row. So "secure" here has two
halves:

1. **Fidelity** — the tests must exercise RLS _the way production does_ (real
   user JWTs → `authenticated`/`anon` roles), or they prove nothing.
2. **Blast radius** — the harness holds a god-key and can wipe a database. It
   must be structurally impossible for it to touch anything but a local,
   throwaway Postgres.

Get either wrong and the suite is either security theater or a foot-gun.

## 1. The role/client matrix — use the right key for the right job

Supabase resolves **every API key to a Postgres role**, and RLS policies
evaluate against that role.

| Client             | Key                                            | Postgres role                    | Sees RLS?   | Use in tests for                                        |
| ------------------ | ---------------------------------------------- | -------------------------------- | ----------- | ------------------------------------------------------- |
| **User client**    | anon/publishable key **+ a signed-in user JWT** | `authenticated`, real `auth.uid()` | ✅ enforced | **All assertions** — production-faithful                |
| **Anon client**    | anon/publishable key, no session               | `anon`                           | ✅ enforced | Anonymous-denial assertions                             |
| **Service client** | `service_role`/secret key                      | `service_role` (`BYPASSRLS`)     | ❌ bypassed | **Setup/teardown/seeding ONLY — never an assertion**    |

Security rule that follows: **the service-role client may never appear in an
`expect()`**. Asserting against a service-role client asserts Postgres works,
not that _your RLS_ works. The `service_role` token has no `sub`/`email`/
`session_id` — it literally cannot represent "user B," so it cannot test IDOR.

**Why real JWTs, not `SET ROLE authenticated` / `set local role`:** you can fake
a role in SQL, but only a real signed-in session carries the JWT claims (`sub` =
`auth.uid()`, `role`, etc.) that RLS policies like `auth.uid() = owner_id`
actually read. The authoritative application-layer pattern mints real sessions:

```ts
// setup: admin (service_role) creates confirmed users — bypasses email flow
const admin = createClient(URL, SERVICE_ROLE_KEY);
await admin.auth.admin.createUser({ id: USER_A, email, password, email_confirm: true });

// assertions: a normal client that signs IN to get a real JWT
const userA = createClient(URL, ANON_KEY);
await userA.auth.signInWithPassword({ email, password });
// userA now runs under auth.uid() === USER_A, exactly like the browser
```

The docs note the seed-SQL approach _cannot_ create a sign-in-capable user — you
need the Auth admin API for that.

## 2. The oracle nuance that most RLS suites get wrong

The single most important correctness point, and it changes your assertions.
Postgres checks **table GRANTs before RLS policies**:

- **Missing GRANT** → hard error `42501 permission denied`.
- **GRANT present but no RLS policy matches** → **silent success over zero
  rows** — _not_ an error.

Consequences for the Phase 2 IDOR matrix (`change.md` says "returns 0 rows or
42501"):

| Operation as user B against user A's row | Expected result                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `SELECT`                                 | **0 rows** (RLS filters the row out — no error)                         |
| `UPDATE` / `DELETE`                      | **no-op, 0 rows affected** — the `error` is `null`! RLS excludes the row |
| `INSERT` with A's owner_id               | RLS `WITH CHECK` violation → error (e.g. `42501`)                        |
| **anon** on a table where grants revoked | `42501 permission denied`                                               |

The trap: a naive test does
`const { error } = await userB.update(...); expect(error).not.toBeNull()` — and
**fails to catch a real IDOR leak**, because a well-behaved RLS no-op _also_
returns `error: null`. The docs' own example handles this correctly by
**re-reading as user A afterward and asserting the row was NOT mutated**:

```ts
await userB.from("weddings").update({ name: "Hacked!" }).eq("id", A_wedding);
// error is null — that alone proves nothing. Verify the negative:
await userA.signIn();
const { data } = await userA.from("weddings").select();
expect(data.every((w) => w.name !== "Hacked!")).toBe(true); // the real oracle
```

So the oracle discipline (test-plan §6.2 — "assert on SQLSTATE and row counts,
never message strings") must be sharpened to: **assert row-count / post-state,
and only assert SQLSTATE (`42501`, `23514`, `23505`) where an error is genuinely
expected** (grants, CHECK, unique). Don't assert "error is non-null" as a
blanket IDOR oracle.

This also validates Risk #3's "must challenge": _that each new table inherited
the anon-grant revocation._ You prove it via the `42501`-vs-`0-rows`
distinction — a table that forgot `revoke ... from anon` returns `0 rows` to
anon instead of `42501`, and only a test that distinguishes the two catches it.

## 3. Secret handling — the `service_role` key

The secret key has full access and bypasses all security policies — keep it
server-side, never expose it. In a test harness:

- **Never commit it, never hardcode it.** Read it at runtime from
  `supabase status -o json` (as test-plan §6.2 prescribes) or from a CI-injected
  env var. Committing it to a fixture or tracked `.env` is the classic leak.
- **Never log it.** No `console.log(status)` dumps, no printing the client
  config on failure. Keep it in a variable, pass it to `createClient`, let it
  die with the process.
- **Keep it out of `provide`/`inject` payloads where possible** — pass per-user
  JWTs to specs (short-lived, scoped), and construct the service client only
  inside `globalSetup`/teardown, not in every spec. Narrower reach = smaller
  leak surface.
- **Local key ≠ prod key.** The local `service_role` key from `supabase start`
  is a well-known dev key and is low-risk. The danger is a test _config_ that
  reads a _production_ key from ambient env and points at prod — see §4.

## 4. Blast-radius guard — the destructive-reset foot-gun

The harness runs `supabase db reset` (recreates the container, re-applies
migrations, discards all data). Fine against a local throwaway DB, catastrophic
against anything else. Defense in depth:

1. **Fail-fast that Supabase is local & running.** Read `supabase status -o
   json`; if it errors, abort with "run `npx supabase start` first".
2. **Assert the DB host is local before any destructive call.** Parse the DB
   URL and hard-refuse unless host ∈ `{127.0.0.1, localhost, ::1}`. This line
   stops a mis-set `SUPABASE_DB_URL` from wiping a real database. Make it a
   guard that _throws_, not a warning.
3. **Never read prod connection details in the test config.** Source connection
   info _only_ from `supabase status` (local CLI), not from the app's runtime
   env resolution (`src/lib/supabase.ts` reads `astro:env/server` — test-plan
   §6.2 says don't import it; that also keeps prod env out of the test path).
4. **`fileParallelism: false`** (test-plan §6.2) — one shared local DB; parallel
   writers corrupt each other's fixtures. A correctness _and_ safety property
   (deterministic teardown).

## 5. RLS/IDOR suite design (Risk #3)

Two application-layer approaches exist; pick based on what you're proving:

- **pgTAP / `supabase test db`** — SQL-level, uses `tests.create_supabase_user`
  / `tests.authenticate_as`, runs in a `begin/rollback` transaction so it's
  self-cleaning. Great for exhaustive per-table policy matrices, closest to the
  DB. Runs via `supabase test db` in CI with zero JS.
- **Vitest + supabase-js with real sign-in** (the pattern in §1) — exercises the
  _client library + PostgREST + RLS_ path, i.e. closer to what the app does.
  Matches the chosen stack (Vitest) and the Phase 3 / HTTP ambitions.

**Recommendation:** Vitest + real JWTs is the right primary layer here — it's
the existing runner, it tests the same PostgREST path the app uses, and it
extends naturally to the API-contract tests (Risk #5). Reserve pgTAP only if you
later want an exhaustive policy matrix cheaply.

The matrix to cover, per owner-scoped table, for the CRUD verbs:

```
              SELECT      INSERT          UPDATE       DELETE
user A own    ✅ N rows   ✅ succeeds     ✅ mutates   ✅ removes
user B on A   0 rows      WITH CHECK err  0 affected   0 affected   (+ verify A's row intact)
anon          42501       42501           42501        42501
```

The test-plan §2 anti-pattern for Risk #3 — _"testing only the owner happy path
(that is not a security test)"_ — is exactly the B-on-A and anon rows above.
Those are the security test.

## 6. API contract tests (Risk #5) securely

For the HTTP layer (malformed/hostile payload → clean 4xx):

- **Drive real HTTP** against `npm run preview` (workerd) so you test the real
  Zod validation + error translation path, authenticated with a real user JWT
  session — same as production.
- **Assert the negative security properties**, not just the status code:
  - **no partial write** — after a rejected request, re-query as the user and
    assert DB state is unchanged (same "verify the negative" discipline as §2).
  - **no PII in the error body** — assert the response body does _not_ contain
    guest names/emails. A genuine privacy assertion, not a formatting one.
  - **cross-wedding FK** — a `guest_id`/`seat_id` belonging to _another_ wedding
    must be rejected as 4xx, not silently accepted (IDOR-via-payload, the
    overlap of #3 and #5).
- **Oracle discipline** (test-plan §2 for #5): don't assert the exact error
  string copied from the error helper — assert status class (4xx), SQLSTATE
  where relevant, and absence of PII.

## 7. The `guest_conflicts` DB-check (deferred #1)

Simple and self-contained: as a service client (setup is legitimate here —
you're testing a DB constraint, not RLS), attempt to `INSERT` a non-canonical
`(B, A)` pair where `B > A`, and assert it's rejected with SQLSTATE `23514`
(check violation). Assert on the SQLSTATE, never the message.

## 8. CI security

- CI runs `supabase start` in the runner, giving a fresh throwaway DB with the
  well-known local keys — **no production secrets needed** for this suite.
  That's the secure default: the RLS suite should _never_ need a real project's
  secret key.
- Keep the local-host guard active in CI too — cheap insurance if someone ever
  wires a real `SUPABASE_DB_URL` secret into the job.

## Bottom line — the secure design in five rules

1. **Service-role for setup/teardown only; every assertion runs under a real
   user or anon JWT.** No exceptions.
2. **Assert post-state and row counts, not "error is non-null"** — an
   RLS-blocked write is a silent 0-row no-op, and only a re-read catches the
   leak. Reserve SQLSTATE assertions (`42501`/`23514`/`23505`) for where an
   error is truly expected.
3. **Guard the blast radius**: refuse to run (let alone `db reset`) unless the
   DB host is provably local; source connection info only from `supabase
   status`, never from prod env.
4. **Never commit or log the secret key**; read it at runtime, keep its reach as
   narrow as `globalSetup`.
5. **CI uses a fresh local stack with throwaway keys** — the RLS suite needs
   zero production secrets.

## Sources

All pulled fresh via Context7 this session (official Supabase docs):

- [Local development — testing overview](https://supabase.com/docs/guides/local-development/testing/overview)
- [pgTAP extended](https://supabase.com/docs/guides/local-development/testing/pgtap-extended)
- [Understanding API keys & Postgres roles](https://supabase.com/docs/guides/getting-started/api-keys)
- [Row Level Security guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Troubleshooting: database API 42501 errors](https://supabase.com/docs/guides/troubleshooting)
