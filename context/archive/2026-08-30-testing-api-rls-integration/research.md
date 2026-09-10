---
date: 2026-08-30T14:36:00+0200
researcher: Agata Ludwiczyńska
git_commit: 6f626fb09f9119fca8652bc092a2abcb4bf73600
branch: test/add-test-coverage
repository: table-planner
topic: "API + RLS integration tests (test-plan Phase 2): API surface + validation, RLS/DB inventory, integration test harness"
tags: [research, codebase, testing, rls, idor, api-validation, supabase, vitest, integration]
status: complete
last_updated: 2026-08-30
last_updated_by: Agata Ludwiczyńska
---

# Research: API + RLS Integration Tests (test-plan Phase 2)

**Date**: 2026-08-30T14:36:00+0200
**Researcher**: Agata Ludwiczyńska
**Git Commit**: 6f626fb09f9119fca8652bc092a2abcb4bf73600
**Branch**: test/add-test-coverage
**Repository**: table-planner

## Research Question

Full research feeding the plan for rollout Phase 2 of `context/foundation/test-plan.md` ("API + RLS integration"), covering three areas:

1. **API surface + validation** — endpoints under `src/pages/api/`, their zod validation, auth/ownership handling, and where the risk #5 payload-trust gaps are.
2. **RLS policy inventory** — every owner-scoped table, its policies/grants/constraints, to design the risk #3 cross-account matrix and the risk #1 DB-check.
3. **Integration test harness** — what's needed to stand up local Supabase + two-user fixtures + API contract tests, given the current Vitest setup does no Astro/Cloudflare boot.

Risks covered: **#3** (cross-account read/modify — RLS/IDOR), **#5** (server trusts client input), plus the **#1 DB-check** deferred from Phase 1 (the `guest_conflicts` `check (guest_a_id < guest_b_id)` canonical-ordering constraint).

## Summary

The codebase is well-positioned for this phase. Key conclusions:

- **The security model is two-layered and mostly sound.** Write endpoints resolve the wedding server-side from `locals.user.id` (the client can *never* supply a `wedding_id`), and Postgres RLS is the backstop. But **four mutations scope only by a client-supplied row id with no explicit `wedding_id` filter** — `PATCH /api/guests`, `DELETE /api/guests`, `DELETE /api/conflicts`, `DELETE /api/assignments`. These rely *entirely* on RLS for cross-account protection and are the primary IDOR regression surface (risk #3). Under RLS a cross-account id matches zero rows → `.maybeSingle()` empty → `*_not_found` (404). That "404, not 200" is the exact assertion to lock in.
- **Payload trust (risk #5) is already tight, but untested.** Every JSON endpoint does `try/catch` on `request.json()` → `zod.safeParse()` → builds service input from `parsed.data` only (never spreads the raw body). Error bodies are static Polish constants from a catalog — **no guest PII leaks** in any error message. `seatCount` is bounded `1..30` in zod (F1, done). There are no multi-write transactions outside the one `SECURITY DEFINER` RPC, so partial-write risk is minimal. This all needs contract tests to prove it and prevent regression.
- **The #1 DB-check is a single, precise assertion.** `guest_conflicts` has `check (guest_a_id < guest_b_id)` and `unique (guest_a_id, guest_b_id)`. A non-canonical `(B,A)` insert (larger uuid as `guest_a_id`) raises SQLSTATE **`23514`**; a duplicate canonical pair raises **`23505`**. The insert must pass RLS `with check` first (do it as the owner), so the CHECK is the failing constraint.
- **The harness is the real work.** There is **zero shared test infrastructure** today (one pure-unit test file, no fixtures/mocks/helpers, no `globalSetup`, no CI, no Supabase start script). The current `vitest.config.ts` is deliberately Astro-free, so **importing `src/lib/supabase.ts` or any API route in-process fails** — `astro:env/server` won't resolve. Two clean seams exist: (a) direct `@supabase/supabase-js` clients with per-user JWTs for RLS/constraint assertions, and (b) HTTP `fetch` against a running `npm run preview` with a cookie jar for contract tests. A **second Vitest project/config** with its own `globalSetup` is needed.

## Detailed Findings

### Area 1 — API surface + validation

**Cross-cutting architecture** (applies to every JSON endpoint):

- **Auth**: `src/middleware.ts:8-24` calls `supabase.auth.getUser()` on every request and writes `context.locals.user`. Only `ROUTES.wedding` (a page) is in `PROTECTED_ROUTES` (`src/middleware.ts:33-37`) — **`/api/*` routes are NOT gated by middleware**; each endpoint enforces its own `if (!user) return apiErrorFrom("unauthorized")`.
- **Client**: `src/lib/supabase.ts:6-25` — `createServerClient` bound to session cookies, so every query runs under the caller's RLS context. Returns `null` when env unset (drives `supabase_unconfigured` 503).
- **Envelopes**: success `{ data }`, error `{ error: { code, message } }` — `src/lib/api.ts:5-30`.
- **Error catalog**: `src/lib/errors.ts:2-22` maps code → status + static Polish message. `validation_error`/`invalid_seat_count`/`conflict_self`/`invalid_guest` = 400, `unauthorized` = 401, `forbidden` = 403, `*_not_found` = 404, `guest_name_exists`/`conflict_exists`/`seat_occupied` = 409, `internal_error` = 500, `supabase_unconfigured` = 503.
- **Service result**: `src/lib/services/result.ts` — `success(data)` / `failure(code)` discriminated union; `failure` looks up status+message from the catalog.

**IDOR / ownership model (risk #3) — the central finding.** Two-layer defense:

1. **Explicit ownership at the wedding root** — `getWedding(supabase, user.id)` (`src/lib/services/wedding.service.ts:33-43`) resolves the wedding by `.eq("user_id", userId)`. The client never supplies a wedding id; write endpoints pass this server-resolved `found.data.id` as `wedding_id`.
2. **RLS backstop on child rows** — for mutations scoped only by a client-supplied row id, there is **no explicit `wedding_id` filter** in the service query. Cross-account protection is entirely RLS.

**Payload handling (risk #5).** Every JSON endpoint: `try { body = await request.json() } catch { return 400 validation_error }` then `schema.safeParse(body)` → 400 on failure. Unknown/extra fields are stripped by `safeParse`; endpoints construct service input from `parsed.data` only. **A client-supplied `wedding_id`/`user_id` is impossible** — never read from any body. Only `parsed.error.issues[0].message` (a static string) is returned, never the raw issue with the offending value → **no PII/input echo**.

**Per-endpoint inventory** (all set `export const prerender = false`):

| Endpoint | Methods | Validation | Cross-account guard | Notes |
| --- | --- | --- | --- | --- |
| `/api/guests` POST | POST | `guestFieldsSchema` (`src/pages/api/guests.ts:14-23`): firstName/lastName trimmed 1-100; `side` enum nullish; `group` enum nullish | **explicit** — `getWedding`, insert scoped to owner wedding | 409 `guest_name_exists` on PG `23505` (`guest.service.ts:54`); no name echoed |
| `/api/guests` PATCH | PATCH | `updateGuestSchema` = fields + `id: z.uuid()` | **RLS only** — `updateGuest(supabase, id, …)` filters `.eq("id", guestId)` only (`guest.service.ts:60-82`) | **Primary risk #3 target**; non-owned id → 404 `guest_not_found` |
| `/api/guests` DELETE | DELETE | `deleteGuestSchema` = `{ id: z.uuid() }` | **RLS only** — `.eq("id", guestId)` only (`guest.service.ts:84-89`) | **risk #3 target**; empty → 404 |
| `/api/tables` POST | POST | `createTableSchema` (`src/pages/api/tables.ts:11-22`): name 1-50; **`seatCount` int 1..30** | **explicit (in RPC)** — SECURITY DEFINER `create_table_with_seats` re-checks owner | atomic table+N seats (one RPC, no partial write); `not_owner`→`42501`→403; `seatCount` 0→`22023`→`invalid_seat_count` |
| `/api/conflicts` POST | POST | `{ guestAId: uuid, guestBId: uuid }` | **explicit** — both guests `.eq("wedding_id").in("id",[lo,hi])`, requires 2 (`conflict.service.ts:34-36`) | rejects self (`conflict_self` 400), duplicate (`conflict_exists` 409); canonicalizes order before insert |
| `/api/conflicts` DELETE | DELETE | `{ id: uuid }` | **RLS only** — `.eq("id", conflictId)` (`conflict.service.ts:60-68`) | **risk #3 target**; empty → 404 |
| `/api/assignments` POST | POST | `{ guestId: uuid, seatId: uuid }` | **explicit (dual)** — guest `.eq(wedding_id).eq(id)`; seat via `tables!inner(wedding_id)` join (seats has no wedding_id) (`assignment.service.ts:34-51`) | upsert `onConflict: guest_id` (atomic move); occupied seat → `23505`→`seat_occupied` 409 |
| `/api/assignments` DELETE | DELETE | `{ guestId: uuid }` | **RLS only** — `.eq("guest_id", guestId)` (`assignment.service.ts:66-71`) | **risk #3 target**; empty → 404 |
| `/api/wedding` PATCH | PATCH | `renameSchema` `{ name: trimmed 1-100 }` | derived id (own wedding via `getWedding`) + RLS | empty update → generic `internal_error` 500 by design |

**Auth endpoints** (`src/pages/api/auth/{signin,signup,signout}.ts`) are form-based (not JSON), no zod, redirect-based. Excluded from test scope by test-plan §7 (auth-flow internals = thin wrappers over a trusted library). Note: `signin.ts:17` URL-encodes the raw Supabase auth error into the redirect — not guest PII, but surfaces auth-provider messages.

### Area 2 — RLS + DB constraint inventory

Three migrations, applied in filename order:

- **M1** = `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql` — `weddings`, `tables`, `seats`, RPC `create_table_with_seats`.
- **M2** = `supabase/migrations/20260819172911_guests_and_conflicts.sql` — `guests`, `guest_conflicts`.
- **M3** = `supabase/migrations/20260822194500_assignments_and_rls.sql` — `assignments`.

**Six owner-scoped tables.** Ownership root: `weddings.user_id → auth.users(id)` (M1:13).

| Table | Ownership chain | Constraints of note |
| --- | --- | --- |
| `weddings` | `user_id = auth.uid()` (direct) | — |
| `tables` | `wedding_id → weddings.user_id` | `check (seat_count > 0)` (M1:22) |
| `seats` | `table_id → tables.wedding_id → user_id` (2-hop; **no `wedding_id` column**) | `unique (table_id, seat_number)` (M1:31) |
| `guests` | `wedding_id → weddings.user_id` | `unique (wedding_id, first_name, last_name)` (M2:17); `side`/`group` enum CHECKs (M2:13-14) |
| `guest_conflicts` | `wedding_id → user_id` (denormalized) | **`check (guest_a_id < guest_b_id)` (M2:28)** + `unique (guest_a_id, guest_b_id)` (M2:29) |
| `assignments` | `wedding_id → user_id` (denormalized) | `unique (guest_id)` (M3:14) + `unique (seat_id)` (M3:15) |

**The #1 DB-check target — exact SQL** (`guest_conflicts`, M2:22-30):

```sql
create table guest_conflicts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings (id) on delete cascade,
  guest_a_id uuid not null references guests (id) on delete cascade,
  guest_b_id uuid not null references guests (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (guest_a_id < guest_b_id),     -- M2:28  → violation = SQLSTATE 23514
  unique (guest_a_id, guest_b_id)       -- M2:29  → duplicate = SQLSTATE 23505
);
```

To force the CHECK violation deterministically: pick two guest uuids, insert with the **larger** uuid as `guest_a_id` (reverse of sorted order). No trigger normalizes ordering — enforcement is purely at the DB layer. The insert must be done **as the owner** (RLS `with check` at M2:88 must pass first) so the CHECK is the failing constraint, not RLS.

**RLS** enabled on all six tables (M1:43-45, M2:41-42, M3:25). All policies scoped `to authenticated`; **no `anon` policies** (rely on default-deny + grant revocation). Every policy uses the optimized **`(select auth.uid())`** subquery form (per `lessons.md:12-16`). Bare `auth.uid()` appears only inside the RPC body (M1:127), not in a policy.

- `weddings`: full CRUD by direct `user_id` match (M1:53-68).
- `tables`: SELECT/UPDATE/DELETE via owner EXISTS; **no INSERT policy** (M1:71) — rows created only via RPC.
- `seats`: **SELECT only** (M1:98-104); no write policies — created via RPC + FK cascade.
- `guests`: full CRUD via owner EXISTS (M2:48-78).
- `guest_conflicts`: SELECT/INSERT/DELETE only, **no UPDATE** (M2:80) — add/remove only.
- `assignments`: full CRUD via owner EXISTS (M3:31-61).

**Grants / revokes** — `revoke all … from anon` on every table (M1:50, M2:45, M3:28). This makes anon access **`permission denied`** (`42501`), not merely 0 rows. There are **no explicit `grant … to authenticated`** for tables — relies on Supabase default privileges gated by RLS. So for authenticated cross-account: SELECT → **0 rows** (RLS filter); INSERT with victim's wedding_id → **`42501`** (`with check` fails); UPDATE/DELETE on victim rows → **0 rows affected** (`using` mismatch).

**The one RPC** — `public.create_table_with_seats(p_wedding_id uuid, p_name text, p_seat_count int) returns uuid` (M1:111-140), `SECURITY DEFINER`, `set search_path = public`. Called at `src/lib/services/table.service.ts:39`. Because SECURITY DEFINER bypasses RLS, it self-checks ownership (M1:126-130) with bare `auth.uid()` → `not_owner` `42501` for a foreign wedding; `seat_count <= 0` → `22023` (M1:122-123). Grants: `revoke execute … from public, anon; grant execute … to authenticated` (M1:146-147).

**Test-assertion crib sheet** (derived):

- **(a) User B vs A's rows** — SELECT: 0 rows (all 6 tables). INSERT into `guests`/`guest_conflicts`/`assignments`/`weddings` with A's scope: `42501`. Direct INSERT into `tables`/`seats`: denied (no INSERT policy). UPDATE/DELETE on A's rows: 0 rows affected. RPC with A's `wedding_id`: `42501` `not_owner`.
- **(b) anon** — any table: `permission denied` (`42501`); RPC: permission denied.
- **(c) `guest_conflicts` non-canonical (B,A)** — as owner, `guest_a_id > guest_b_id` → CHECK violation `23514`; duplicate canonical → `23505`.

### Area 3 — Integration test harness

**Current state** (`vitest.config.ts`, 13 lines): `environment: "node"`, only the `@ → ./src` alias, **no `setupFiles`/`globalSetup`/`include`/`coverage`/`projects`**. The comment states it deliberately avoids `getViteConfig()` because that boots `@cloudflare/vite-plugin`, which rejects Vitest's `resolve.external`. Default include glob would sweep up integration specs into the same pool.

**Versions**: `vitest 4.1.11` (exact pin), `@supabase/supabase-js ^2.99.1`, `@supabase/ssr ^0.10.3`, `supabase ^2.23.4` CLI, `zod ^4.4.3`. Scripts: `test` (watch), `test:run` (single-pass), `db:types` (gen types). **No `supabase start`/`db:reset`/`db:seed` script.**

**Existing test infrastructure**: exactly **one** file — `src/lib/adjacency.test.ts` (pure unit, inline typed factories, no Supabase/DB/HTTP). **No shared fixtures module, no `test/` dir, no mock Supabase client anywhere.** The harness starts from zero.

**The seam problem** (`src/lib/supabase.ts:3`): `import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"` is a virtual module materialized by the Astro Vite integration, which the standalone Vitest config never loads. Therefore:

1. **Any import chain reaching `src/lib/supabase.ts` fails to resolve `astro:env/server`.** Every API route imports `createClient` from `@/lib/supabase`, so **importing a route in-process pulls in the broken import.**
2. Route handlers need `context.locals.user`, populated by middleware that does **not** run when a handler is called directly.

**Two clean seams (recommended):**

- **Direct-to-Postgres via `@supabase/supabase-js` the test constructs itself** — for RLS/IDOR assertions (risk #3) and the `guest_conflicts` constraint check (#1-DB). `createClient(url, key)` with per-user JWTs (or service_role for setup) touches none of `src/lib/supabase.ts`, so no Astro coupling. Direct analog of the manual runbook.
- **HTTP contract tests against a running server** — for risk #5 and the API-contract half of #3. Boot `npm run preview` (workerd, bindings active) or `npm run dev`, then `fetch()` real endpoints. Auth is **cookie-based** (`@supabase/ssr`, httpOnly cookies) — the harness must carry a cookie jar, e.g. by driving `POST /api/auth/signin` and reusing Set-Cookie. This exercises middleware + zod + services + RLS end-to-end.

**Local Supabase** (`supabase/config.toml`): API on `http://127.0.0.1:54321`, DB on `127.0.0.1:54322` (Postgres 17, DSN `postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Critically **`[auth.email] enable_confirmations = false`** → seeded users sign in immediately, no email step. `minimum_password_length = 6`. `[db.seed]` points at `./seed.sql` which **does not exist** — a two-user seed is net-new (file or programmatic). Env names: `.env.example`/`.dev.vars.example` declare only `SUPABASE_URL` + anon `SUPABASE_KEY`. **No service-role key or DB URL is declared anywhere** — the harness reads url + anon key + service_role key + DB URL from `npx supabase status` at runtime (app code has no service-role path).

**CI & hooks**: **No `.github/` at all** — no CI. `.husky/pre-commit` runs `npx lint-staged` + `npx astro check` only — **no tests, no Supabase start**. So integration tests are **local-only** until a Supabase-starting workflow is authored (explicitly out of this lesson's scope, but the harness should be CI-portable — read connection details from `supabase status`, not committed env files).

## Code References

- `src/middleware.ts:8-24` — auth resolution → `locals.user`; `:33-37` — only `ROUTES.wedding` protected, not `/api/*`.
- `src/lib/supabase.ts:3` — `astro:env/server` import (the test seam blocker); `:6-25` — session-cookie-bound client, `null` when unset.
- `src/lib/api.ts:5-30` — response envelopes. `src/lib/errors.ts:2-22` — status/code/message catalog. `src/lib/services/result.ts` — success/failure union.
- `src/lib/services/wedding.service.ts:33-43` — `getWedding` (server-side owner resolution, the explicit-ownership root).
- `src/pages/api/guests.ts:14-31` (schemas), `:33/67/97` (POST/PATCH/DELETE); `src/lib/services/guest.service.ts:60-89` (RLS-only PATCH/DELETE).
- `src/pages/api/tables.ts:11-22,41`; `src/lib/services/table.service.ts:33-53` (RPC call).
- `src/pages/api/conflicts.ts:10-17`; `src/lib/services/conflict.service.ts:22-68`.
- `src/pages/api/assignments.ts:10-17`; `src/lib/services/assignment.service.ts:27-71` (dual explicit ownership on POST; RLS-only DELETE).
- `src/pages/api/wedding.ts`; `src/lib/services/wedding.service.ts:46-54`.
- `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql` — weddings/tables/seats/RPC (M1 refs above).
- `supabase/migrations/20260819172911_guests_and_conflicts.sql:22-30` — **the `guest_conflicts` CHECK + UNIQUE (risk #1-DB)**.
- `supabase/migrations/20260822194500_assignments_and_rls.sql:8-61` — assignments schema + RLS.
- `vitest.config.ts` — current Astro-free config. `supabase/config.toml` — ports, `enable_confirmations = false`, missing `seed.sql`.
- `.husky/pre-commit` — lint-staged + astro check, no tests.
- `src/lib/adjacency.test.ts` — the only existing test (pure unit, reference for oracle discipline + typed factories).

## Architecture Insights

- **"Client never names the scope."** Across every write path the wedding id is derived server-side from `locals.user.id`; there is no request shape in which a caller supplies `wedding_id`/`user_id`. This eliminates the classic mass-assignment/scope-forgery vector by construction — worth an explicit assertion (send a body with an extra `wedding_id`, prove it's ignored).
- **Explicit-ownership vs RLS-only is a deliberate, uneven split.** POST/create paths validate ownership explicitly *and* have RLS; the four id-scoped mutations (`PATCH/DELETE guests`, `DELETE conflicts`, `DELETE assignments`) have **only** RLS. That's safe today but is the single point of failure if a future migration regresses a policy — the highest-value regression tests in the phase.
- **Canonical ordering is enforced in two independent places.** The service sorts ids before insert (`conflict.service.ts`), and the DB has `check (guest_a_id < guest_b_id)`. Phase 1 proved order-independence at the *guardrail* (unit); this phase proves the *DB* backstop — they are not substitutes (per Phase 1 plan and F9).
- **The assertion vocabulary is fixed** (`lessons.md:40-44`): cross-account SELECT/INSERT/UPDATE/DELETE as another user → **0 rows / `42501`**; anon → **`permission denied`**. Tests should assert on SQLSTATE codes / status codes, not copied message strings (oracle problem, test-plan §89).
- **Two distinct test layers, two distinct seams.** RLS/constraint facts are cheapest asserted straight against Postgres with two anon-key sessions; contract facts (risk #5) need the real HTTP stack. Trying to unify them by importing routes in-process is the trap — `astro:env/server` blocks it.

## Historical Context (from prior changes)

- **Phase 1 — `context/archive/2026-08-25-testing-bootstrap-adjacency-core/`** (APPROVED, 11/11 unit tests green). Stood up `vitest@4.1.11` (exact pin; 4.x matches the repo's Vite 7 override, and is the advisory floor for GHSA-82fw-gwwq-j7x9). Standalone `vitest.config.ts` — `getViteConfig()` **fails at startup under the Cloudflare adapter** (`validateWorkerEnvironmentOptions` rejects `resolve.external`); full reversal in `tooling-vitest-setup.md` Addendum 2, which states any worker/DB-dependent suite must use `@cloudflare/vitest-pool-workers` **or a separate Vitest project**, not `getViteConfig()`. Established oracle discipline + typed fixture factories + colocated `src/**/*.test.ts`.
- **Phase 1 explicit deferrals to Phase 2** (`plan.md` "What We're NOT Doing", lines 63-68; Integration Tests, 351-354): the `guest_conflicts` `(B,A)` CHECK assertion against local Supabase. Recorded in `test-plan.md §6.5` and **follow-up F9**.
- **S-02 — `context/archive/2026-08-17-guest-and-conflict-management/`** introduced the `guest_conflicts` CHECK + UNIQUE and the anon-revoke RLS pattern. **Latent smell** (`reviews/plan-review.md:70`): nothing at the DB guarantees `guest_conflicts.wedding_id` equals the two guests' `wedding_id` — only the service sets it; a service bug could write a cross-scope conflict. Relevant to risk #5 (payload trust across denormalized scope).
- **S-03 — `context/archive/2026-08-22-assignment-with-realtime-conflict-validation/`** chose service-layer membership validation over an RPC for assignments. **F3** (`reviews/plan-review.md:56-58`): assignments RLS `with check` verifies ownership of the server-supplied `wedding_id` but **not** that `seat_id` belongs to it — so the service independently validates seat membership via seats→tables (seats has no `wedding_id`). **DELETE-by-guest_id** is safe precisely because a cross-wedding id is invisible under RLS → `assignment_not_found` 404 (`impl-review.md:85-87`) — the exact behavior to regression-test.
- **`docs/reference/rls-verification-protocol.md`** (60 lines) is the manual protocol this phase automates: the full two-user matrix across all owner-scoped tables (A creates rows; B → 0 rows / `42501`; anon → permission denied), with S-02 and S-03 sections. Impersonation technique documented (`set local role authenticated; set local request.jwt.claims = …`) — translatable to a service-role connection, or better replaced by two real anon-key JWT sessions (more faithful).
- **`docs/reference/deploy-runbook.md`** — prod migration apply is manual; step 3 verifies via the RLS protocol. Automating the protocol strengthens the deploy-verify step.
- **`lessons.md`**: `:12-16` (revoke anon + `(select auth.uid())`), `:40-44` (keep RLS runbook in sync; assertion vocabulary), `:47-51` (plans with a migration need a prod-apply step — N/A here, this phase ships no migration).

## Deferred Follow-ups Pulled Into This Phase (from `context/foundation/follow-ups.md`)

- **F9 (OPEN, target = this phase)** — assert the `guest_conflicts` `check (guest_a_id < guest_b_id)` at the integration layer; a non-canonical `(B,A)` insert must be rejected. **This is the #1 DB-check.** Flip to DONE when it lands.
- **F1 (partially done)** — `seatCount` upper bound is DONE in zod (`1..30`, commit 198379e); the optional S-04 **DB-side** guard remains OPEN (not this phase). The `1..30` bound is the contract the risk #5 `seatCount` tests assert against.

## Related Research

- `context/archive/2026-08-25-testing-bootstrap-adjacency-core/research.md` — Phase 1 research (adjacency guardrail).
- `context/archive/2026-08-25-testing-bootstrap-adjacency-core/tooling-vitest-setup.md` — the Vitest/`getViteConfig()` reversal record (Addendum 2), authoritative for the second-config decision here.

## Open Questions

1. **Impersonation strategy for RLS assertions**: two real anon-key JWT sessions (most faithful, exercises actual `auth.uid()` path) vs a service-role connection with `set local request.jwt.claims` (matches the runbook literally). Recommendation leans to real sessions for the cross-account matrix, service-role reserved for setup/teardown — to confirm at plan time.
- 2. **Second-config shape**: a separate `vitest.integration.config.ts` invoked by a new script, vs a Vitest `projects` split. Either works; the split must exclude integration specs from the fast unit run and give them a `globalSetup`.
3. **How much to boot in `globalSetup`**: assert an already-running `supabase start` (fail fast with a message) vs start/reset it in-process. Given no CI yet and local-only scope, "assert running + reset DB + seed two users programmatically" is the lean default — confirm.
4. **Contract-test server target**: `npm run preview` (workerd, faithful to prod runtime, bindings active) vs `npm run dev` (faster, but not the Workers runtime). Preview is more faithful for risk #5; dev is cheaper. Decide per cost/signal at plan time.
5. **`guest_conflicts.wedding_id` cross-scope smell** (S-02 review): worth one targeted test (insert a conflict whose `wedding_id` ≠ the guests' `wedding_id` as the owner) or explicitly out of scope? It's a service-invariant gap, not an RLS/payload gap — likely note-and-defer, but flag at plan time.
