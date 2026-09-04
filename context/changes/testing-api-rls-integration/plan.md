# API + RLS Integration Tests (test-plan Phase 2) Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md` ("API + RLS integration") stands up the project's **first integration test harness** and uses it to lock in three protections:

- **Risk #3 (RLS / IDOR)** — as user B and as anon, cross-account reads and writes against user A's rows are refused (0 rows / `42501` / `permission denied`) across all six owner-scoped tables, with the sharpest focus on the four RLS-only mutations.
- **Risk #5 (payload trust)** — malformed/hostile HTTP payloads get a clean 4xx with no partial write and no guest PII in the error body; a client-supplied `wedding_id` is provably ignored.
- **#1 DB-check (follow-up F9)** — a non-canonical `(B,A)` insert into `guest_conflicts` is rejected by the DB CHECK (`23514`).

## Current State Analysis

- **Zero shared test infrastructure.** The only test today is `src/lib/adjacency.test.ts` (pure unit). There is no fixtures module, no `test/` dir, no mock Supabase client, no `globalSetup`, no CI, and no `supabase start`/`db:reset`/`db:seed` script (research §Area 3).
- **The standalone `vitest.config.ts` is deliberately Astro-free** (13 lines, only the `@ → ./src` alias). It avoids `getViteConfig()` because the Cloudflare adapter's `validateWorkerEnvironmentOptions` rejects Vitest's `resolve.external` (Phase 1 reversal record, `tooling-vitest-setup.md` Addendum 2). Consequently **any import chain reaching `src/lib/supabase.ts` fails to resolve `astro:env/server`** — importing a route in-process is impossible.
- **The security model is two-layered and mostly sound but untested.** Write endpoints resolve the wedding server-side from `locals.user.id` (the client can never supply a `wedding_id`); Postgres RLS is the backstop. Four mutations — `PATCH /api/guests`, `DELETE /api/guests`, `DELETE /api/conflicts`, `DELETE /api/assignments` — scope only by a client-supplied row id with **no explicit `wedding_id` filter**, relying entirely on RLS. These are the primary IDOR regression surface (research §Area 1, Architecture Insights).
- **Payload trust is already tight.** Every JSON endpoint does `try/catch` on `request.json()` → `zod.safeParse()` → builds service input from `parsed.data` only; error bodies are static Polish constants (no PII). `seatCount` is bounded `1..30` in zod (F1, DONE). This needs contract tests to prove and prevent regression.
- **Local Supabase is ready** (`supabase/config.toml`): API `127.0.0.1:54321`, DB `127.0.0.1:54322`, `[auth.email] enable_confirmations = false` (seeded users sign in immediately), `minimum_password_length = 6`. `[db.seed]` points at `./seed.sql` which **does not exist** — benign for `db reset` (it emits only a `WARN:` on stderr and exits 0; seeding here is programmatic anyway). No service-role key or DB URL is declared in any committed env file — they are read from `supabase status` at runtime.

## Desired End State

`npm run test:integration` (against a locally running Supabase) passes a suite that:

1. Proves the full risk-weighted cross-account matrix (#3) using two real per-user JWT sessions plus an anon session.
2. Proves the `guest_conflicts` `(B,A)` CHECK rejection (#1-DB), flipping F9 to DONE.
3. Proves the payload contract (#5) by driving real HTTP requests against `npm run preview`.

The fast unit run (`npm run test:run`) is untouched — still Astro-free, no Supabase dependency. The cookbook (§6.2, §6.3) documents how to add integration and API-contract tests.

### Key Discoveries

- **Two clean seams, two test layers** (research §Area 3): direct `@supabase/supabase-js` clients with per-user JWTs for RLS/constraint facts; HTTP `fetch` against a running server (cookie jar) for contract facts. Unifying them by importing routes in-process is the trap — `astro:env/server` blocks it.
- **The assertion vocabulary is fixed** (`lessons.md:40-44`, research crib sheet): cross-account SELECT → 0 rows; INSERT into A's scope → `42501`; UPDATE/DELETE on A's rows → 0 rows affected; anon → `permission denied` (`42501`); RPC with A's `wedding_id` → `not_owner` `42501`. Assert on SQLSTATE / status codes, never copied message strings (oracle problem, test-plan §89).
- **The #1 DB-check is one precise assertion** (research §Area 2): as the owner, insert with the **larger** uuid as `guest_a_id` → SQLSTATE `23514`. The insert must pass RLS `with check` first (do it as the owner), so the CHECK is the failing constraint.
- **`enable_confirmations = false`** is what makes programmatic sign-in work without an email step — a documented dependency of the harness.

## What We're NOT Doing

- **No migration** — this phase ships zero schema changes, so no prod-apply gate applies (`lessons.md:47-51` N/A here).
- **The `guest_conflicts.wedding_id` cross-scope smell** (S-02 review) — a service-invariant gap, not an RLS/payload gap. Out of scope; recorded as a new follow-up targeting a future DB constraint/trigger or service test.
- **The optional S-04 DB-side `seatCount` guard** (F1 second half, OPEN) — belongs to the resize slice and needs a migration; our #5 tests assert against the existing zod `1..30` contract regardless.
- **CI wiring** — the harness is CI-portable (reads connection from `supabase status`), but authoring a Supabase-starting workflow is Phase 4 / out of this lesson's scope. Tests are local-only for now.
- **Auth-flow internals, UI/pixel, static pages, shadcn primitives** — excluded per test-plan §7.
- **Starting Supabase or building the app inside `globalSetup`** — both are the developer's responsibility (assert-running), kept out of the test lifecycle by decision.

## Implementation Approach

Three phases, cheapest-enabling-first: build the harness, then the direct-Postgres layer (RLS matrix + DB-check), then the HTTP layer (contract tests).

Key architecture decisions (from planning, grounded in research's open questions):

- **Impersonation** — two real anon-key JWT sessions (each user signs in; queries run under real `auth.uid()`). `service_role` is reserved for seed/teardown and the owner-side DB-check insert. Most faithful to production RLS.
- **Config shape** — a separate `vitest.integration.config.ts` invoked by a new `test:integration` script, keeping the fast unit run Astro-free and Supabase-free.
- **Boot strategy** — `globalSetup` asserts Supabase is running (fail-fast with a message), guards that the DB host is `127.0.0.1`/`localhost` before any destructive op, runs `db reset`, then programmatically seeds users A/B and mints their JWTs.
- **Contract-test server** — `npm run preview` (workerd, faithful to prod). The developer starts it (and rebuilds) themselves, like Supabase; the stale-build footgun is documented loudly.
- **Seed** — programmatic (Auth admin API + service-role inserts), connection read from `supabase status -o json`.
- **RLS matrix breadth** — risk-weighted: SELECT-isolation ×6 tables, anon-denial ×6, all reachable writes (hardest on the four RLS-only mutations + RPC `not_owner`), structural-denial cells asserted once.

## Critical Implementation Details

- **Destructive-op safety guard** — `globalSetup` runs `db reset`, which is destructive. Before any reset/seed, assert the DB URL host resolved from `supabase status` is `127.0.0.1`/`localhost` and abort otherwise. This is the one guard that prevents a mis-targeted reset (e.g. a linked remote project). Parse `supabase status -o json`, never scrape the human-formatted text output.
- **`service_role` hygiene** — the service-role key is powerful even locally; keep it in process memory only, never log it, never write it to a committed file.
- **Test isolation on a shared DB** — `globalSetup` seeds once for the whole suite. Almost all cross-account writes in the matrix are *denied* (RLS refuses them → no residue), and the DB-check inserts are *rejected* too (`23514`/`23505` reuse the seeded guests + canonical pair, leaving nothing); the only successful writes are the one-time seed graph in `globalSetup`. Mechanism: **each write-spec cleans up its own rows** (`afterAll`/`afterEach` service-role `DELETE`, idempotent), so residue never survives into a later assertion regardless of file order. Additionally, run the integration specs **without file parallelism** (`fileParallelism: false` / single fork in `vitest.integration.config.ts`) so concurrent files never write to the shared DB at once. Order-dependence is thus avoided, not relied upon.
- **Contract-test ordering dependency** — `npm run preview` serves a built snapshot; the developer must rebuild + restart it before an integration run or the contract tests silently exercise stale code. Document this in the script's failure/readiness message and in the cookbook.

## Phase 1: Integration Harness Foundation

### Overview

Stand up the second Vitest config, `globalSetup`, programmatic two-user seed, and JWT/session plumbing. Deliver a green smoke test proving both seams (two JWT sessions + the service-role path) work.

### Changes Required:

#### 1. Integration Vitest config

**File**: `vitest.integration.config.ts` (new)

**Intent**: A standalone integration config, separate from `vitest.config.ts`, so the fast unit run stays Astro-free and Supabase-free. Wires `globalSetup`, an integration-only `include` glob, and the `@ → ./src` alias. One shared config serves both lanes (`test:integration:db` and the full `test:integration`); specs are laid out so each lane selects its own set.

**Contract**: `defineConfig` from `vitest/config`; `test.globalSetup` points at the setup module; `test.include` matches integration specs only (e.g. `test/integration/**/*.test.ts`), with DB-layer and HTTP-layer specs separable by directory or naming convention (e.g. `test/integration/db/**` vs `test/integration/http/**`) so the two lanes can be selected independently; disable file parallelism (`fileParallelism: false` / single fork) so integration specs never write to the shared local DB concurrently; replicate the `@/*` alias. Must NOT boot Astro/Cloudflare.

#### 2. Integration npm scripts (two lanes)

**File**: `package.json`

**Intent**: Two integration scripts sharing one config, so the direct-Postgres layer can be iterated without a preview build while the umbrella still runs everything. `test:integration:db` runs only the direct-Postgres specs (Phase 2 + smoke) — needs only local Supabase. `test:integration` runs the full suite including the HTTP layer (Phase 3) — needs `npm run preview` too, and is the default "run all integration tests" command, so it can never report green while silently skipping the HTTP security tests. The existing `test`/`test:run` remain the fast unit lane.

**Contract**: `"test:integration:db"` runs Vitest single-pass over the direct-Postgres specs only; `"test:integration"` runs single-pass over all integration specs. Both use `vitest.integration.config.ts` (shared `globalSetup`). Lane selection is by directory or include glob — exact mechanism is an implementation choice. No change to `test`/`test:run`.

#### 3. globalSetup — connection, guard, reset, seed, sessions

**File**: `test/integration/global-setup.ts` (new)

**Intent**: Prepare deterministic per-run state. Read connection details from `supabase status -o json`; assert Supabase is running (fail-fast with a clear "run `npx supabase start` first" message); assert the DB host is `127.0.0.1`/`localhost` before any destructive op; run `db reset`; programmatically seed users A and B, each with a full owner-owned data graph (wedding → a table + its seats via the RPC → ≥2 guests → a canonical `guest_conflicts` pair → an assignment) — a wedding-only seed would make the cross-account SELECT/UPDATE/DELETE cells vacuous (0 rows because A owns nothing, not because RLS blocked B); sign both in to mint JWTs; expose connection + credentials to specs.

**Contract**: Reads url + anon key + service-role key + DB URL from `supabase status -o json`. Creates users via the Auth admin API (service-role). Depends on `enable_confirmations = false`. `service_role` key held in memory only, never logged. Exposes to tests: base URL, anon key, and for users A/B their id + a signed-in client (or access token) + the ids of their seeded rows (wedding, table, a seat, the two guests, the conflict pair, the assignment) so the matrix can target real owner-owned rows. The exact export mechanism (global setup return, a written run-scoped fixtures file, or a shared module) is an implementation choice. **`db reset` + missing `seed.sql`**: reset emits a benign `WARN:` on stderr for the missing `[db.seed]` file and exits 0 (verified against the CLI source — a nonexistent seed path is never fatal); gate the reset step on the **exit code, not stderr content**. Seeding here is programmatic (Auth admin API + service-role inserts), so it does not depend on `seed.sql` at all.

#### 4. Two-user fixtures / client factory

**File**: `test/integration/fixtures.ts` (new)

**Intent**: Helpers that build the per-user `@supabase/supabase-js` clients (anon-key + user JWT), an anon client, and a service-role client for setup/teardown — so specs read cleanly.

**Contract**: `createUserClient(accessToken)`, `createAnonClient()`, `createServiceClient()` (or equivalent). Typed against `src/db/database.types.ts` where useful. No import of `src/lib/supabase.ts`.

#### 5. Smoke test

**File**: `test/integration/smoke.test.ts` (new)

**Intent**: Prove the harness end-to-end before building the matrix: two JWT sessions resolve distinct `auth.uid()`, each sees its own seeded wedding, and the service-role client can read across both.

**Contract**: Asserts user A's client reads A's wedding (1 row) and user B's reads B's (1 row); service-role reads both. Green run = harness proven.

#### 6. Cookbook stub updates

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 (integration) "TBD" with the harness shape once it exists (config, seams, seed, run command); leave §6.3 for Phase 3.

**Contract**: §6.2 documents: separate config + `test:integration`, direct-Postgres seam with two JWT sessions, programmatic seed, `supabase start` prerequisite. Prose only.

### Success Criteria:

#### Automated Verification:

- Integration config loads without booting Astro: `npm run test:integration:db` starts (does not error on `astro:env/server`).
- Smoke test passes: `npm run test:integration:db`.
- Fast unit run is unaffected: `npm run test:run`.
- Lint passes: `npm run lint`.

#### Manual Verification:

- With Supabase stopped, `npm run test:integration:db` fails fast with the "run `npx supabase start` first" message (not a hang or opaque connection error).
- The destructive-op guard aborts if the DB host is not local (verified by inspection/temporary override).
- No `service_role` key appears in test output/logs.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: RLS / IDOR Cross-Account Matrix + guest_conflicts DB-Check

### Overview

Using the direct-Postgres seam, prove the risk-weighted cross-account matrix (#3) and the `guest_conflicts` `(B,A)` CHECK rejection (#1-DB / F9).

### Changes Required:

#### 1. Cross-account SELECT isolation (all six tables)

**File**: `test/integration/rls-select.test.ts` (new)

**Intent**: As user B, selecting A's rows returns 0 rows across every owner-scoped table; each user sees only their own.

**Contract**: For `weddings`, `tables`, `seats`, `guests`, `guest_conflicts`, `assignments` — B's client `.select()` filtered to A's ids → empty. **Positive control**: in the same spec, A's own client sees its N>0 seeded rows in each table while B sees 0 — the pair together proves RLS filtered, not that the table was empty. Assert on row count, not messages.

#### 2. Anon denial (all six tables)

**File**: `test/integration/rls-anon.test.ts` (new)

**Intent**: The anon session is refused on every table — proving each table inherited the anon-grant revocation (a test-plan §2 must-challenge).

**Contract**: Anon client against each table → `permission denied` (`42501`). Assert on SQLSTATE.

#### 3. Cross-account writes — focus on the four RLS-only mutations

**File**: `test/integration/rls-writes.test.ts` (new)

**Intent**: As user B, mutating A's rows is refused. Hardest coverage on the four RLS-only mutations (`PATCH/DELETE guests`, `DELETE conflicts`, `DELETE assignments`); reachable INSERTs into A's scope raise `42501`; UPDATE/DELETE on A's rows affect 0 rows; structural-denial cells (no INSERT policy on `tables`/`seats`, no UPDATE on `guest_conflicts`) asserted once each.

**Contract**: UPDATE/DELETE on A's rows as B → 0 rows affected. INSERT into A's scope (`guests`/`guest_conflicts`/`assignments`/`weddings`) as B → `42501`. Direct INSERT into `tables`/`seats` → denied (no policy). Assert on rows-affected / SQLSTATE. **Rows-affected cells chain `.select()` and assert on the returned array length (`[]` = 0 affected), not on `error` alone — a bare `.update()`/`.delete()` returns `{ data: null, error: null }` whether RLS filtered the row or not, so an `error`-only check is a no-op.**

#### 4. RPC ownership check

**File**: `test/integration/rls-rpc.test.ts` (new)

**Intent**: `create_table_with_seats` with A's `wedding_id` called as B is refused by the RPC's own owner self-check.

**Contract**: B calls the RPC with A's `wedding_id` → `not_owner` `42501`. Anon → permission denied on execute.

#### 5. guest_conflicts (B,A) CHECK — the #1 DB-check (F9)

**File**: `test/integration/db-check-conflicts.test.ts` (new)

**Intent**: As the owner, a non-canonical insert (larger uuid as `guest_a_id`, using two of the owner's seeded guests) is rejected by the DB CHECK; a duplicate of the seeded canonical pair is rejected by UNIQUE.

**Contract**: Owner insert with `guest_a_id > guest_b_id` (the two seeded guests, larger uuid first) → SQLSTATE `23514`. Insert duplicating the seeded canonical pair → `23505`. Both inserts pass RLS `with check` first (done as owner) so the CHECK / UNIQUE is the failing constraint. Both are *rejected*, so this spec leaves **no successful write** — no per-spec cleanup needed (the two guests and the canonical pair are seed rows, reset by `globalSetup`).

#### 6. Follow-up bookkeeping

**File**: `context/foundation/follow-ups.md`

**Intent**: Flip F9 to DONE (with commit/slice). Add a new OPEN follow-up for the `guest_conflicts.wedding_id` cross-scope smell (target: future DB constraint/trigger or service test), with rationale.

**Contract**: F9 row → DONE; new row appended for the wedding_id smell.

### Success Criteria:

#### Automated Verification:

- All RLS/IDOR specs pass: `npm run test:integration:db`.
- The `guest_conflicts` `(B,A)` insert raises `23514` (asserted): `npm run test:integration:db`.
- Lint passes: `npm run lint`.

#### Manual Verification:

- The matrix covers all six tables for SELECT-isolation and anon-denial, incl. a positive control (each user sees its own seeded rows while the other sees 0) (reviewed against the research crib sheet).
- F9 is flipped to DONE and the new wedding_id follow-up is recorded.
- Tests are isolated *within a run* — after the write/DB-check specs have run, a baseline/SELECT-isolation check still sees only seed rows (0 cross-account, no orphan rows), proving per-spec cleanup worked; a second consecutive run also yields identical results.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: API Payload Contract Tests (Risk #5)

### Overview

Using the HTTP seam against `npm run preview` (workerd), prove the server rejects hostile payloads cleanly — clean 4xx, no partial write, no PII in the error body, client-supplied `wedding_id` ignored.

### Changes Required:

#### 1. HTTP harness — server readiness + cookie-jar auth

**File**: `test/integration/http-client.ts` (new)

**Intent**: Helpers to assert the preview server is reachable (fail-fast with a "run `npm run build && npm run preview` first" message), sign in via `POST /api/auth/signin`, and carry the Set-Cookie jar for authenticated requests.

**Contract**: `signIn(email, password)` → cookie jar; `authedFetch(path, init)` reuses cookies. Base URL from config (preview default). Readiness check before the suite runs. **Prerequisite — env coupling**: preview must run against the *same* local Supabase that `globalSetup` seeds — its `.dev.vars` `SUPABASE_URL`/`SUPABASE_KEY` must point at the local instance (`127.0.0.1:54321`). If they diverge, signin fails with a confusing auth error, not the readiness message; note this in the readiness/failure guidance.

#### 2. Malformed / wrong-typed payload contract tests

**File**: `test/integration/api-validation.test.ts` (new)

**Intent**: Across the JSON endpoints, missing/wrong-typed fields, out-of-range `seatCount`, and unparseable bodies get a clean 4xx from the error catalog, with no partial write.

**Contract**: e.g. `POST /api/tables` with `seatCount` 0 or 31 → 400 `invalid_seat_count`; missing required field → 400 `validation_error`; unparseable JSON → 400. Assert on status/code, never the copied message string (oracle problem). Verify no row was written on failure.

#### 3. IDOR-via-HTTP + wedding_id ignored

**File**: `test/integration/api-idor.test.ts` (new)

**Intent**: As user B over HTTP, the RLS-only mutations against A's ids return the not-found path (404), and a body carrying an extra `wedding_id` is provably ignored (mass-assignment defense by construction).

**Contract**: `PATCH/DELETE /api/guests`, `DELETE /api/conflicts`, `DELETE /api/assignments` with A's id as B → 404 (`*_not_found`). A create body with an extra `wedding_id` → the row is scoped to B's own wedding, not the supplied one.

#### 4. No-PII-in-error assertion

**File**: `test/integration/api-error-body.test.ts` (new)

**Intent**: Error bodies never echo guest input (names, ids from the payload) — only static catalog messages.

**Contract**: Trigger validation/conflict errors with recognizable input values; assert the response body contains none of them, only the static Polish message + code.

#### 5. Cookbook §6.3 + stale-build note

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.3 (new API endpoint) "TBD" with the contract-test pattern; document the `npm run preview` prerequisite and the rebuild-before-run footgun.

**Contract**: §6.3 documents: preview-server target, cookie-jar auth, assert-status-not-message discipline, rebuild+restart prerequisite, and the env coupling (preview's `.dev.vars` must point at the same local Supabase — `127.0.0.1:54321` — that `globalSetup` seeds). Prose only.

### Success Criteria:

#### Automated Verification:

- All contract specs pass against a running preview: `npm run test:integration`.
- Fast unit run still unaffected: `npm run test:run`.
- Lint passes: `npm run lint`.

#### Manual Verification:

- With preview stopped, the HTTP suite fails fast with the "run `npm run build && npm run preview` first" message.
- Spot-check one error body confirms no guest PII / input echo.
- The rebuild-before-run footgun is documented in the cookbook and the readiness message.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for final manual confirmation.

---

## Testing Strategy

### Integration Tests (this phase is entirely integration):

- **Direct-Postgres (Phase 2)** — risk-weighted cross-account matrix across six tables; the `guest_conflicts` CHECK/UNIQUE assertions. Two real JWT sessions + anon + service-role.
- **HTTP contract (Phase 3)** — hostile payloads → clean 4xx, no partial write, no PII, `wedding_id` ignored; IDOR-via-HTTP 404 path. Cookie-jar auth against `npm run preview`.

### Oracle discipline:

- Assert on SQLSTATE codes (`42501`, `23514`, `23505`) and HTTP status/error codes — never on message strings copied from the error catalog (test-plan §89, `lessons.md:40-44`).

### Manual Testing Steps:

1. `npx supabase start`, then `npm run test:integration:db` (Phases 1–2, direct-Postgres layer only) — all green, no preview needed.
2. `npm run build && npm run preview` in one terminal, `npm run test:integration` in another (full suite incl. Phase 3) — all green.
3. Stop Supabase / preview and confirm each suite fails fast with its guidance message.

## Performance Considerations

- Integration runs are the slow, deliberate lane — kept out of the fast per-edit hook. `db reset` + programmatic seed run once per suite in `globalSetup`.
- Preview build is a per-run developer cost, accepted for prod-runtime fidelity (workerd).
- `test:integration:db` skips the preview build entirely (only local Supabase), giving a fast inner loop while authoring the RLS matrix; the full `test:integration` (with preview) is the complete pre-commit run.

## Migration Notes

None — this phase ships no migration.

## References

- Research: `context/changes/testing-api-rls-integration/research.md`
- Test plan (Phase 2, risk map, §6/§7): `context/foundation/test-plan.md`
- Follow-ups F9 (target = this phase), F1 (S-04 optional DB guard): `context/foundation/follow-ups.md`
- RLS runbook this phase automates: `docs/reference/rls-verification-protocol.md`
- Phase 1 reversal record (Vitest config): `context/archive/2026-08-25-testing-bootstrap-adjacency-core/tooling-vitest-setup.md`
- Reference unit test (oracle discipline): `src/lib/adjacency.test.ts`
- `db reset` never fails on a missing seed (WARN-only, exit 0) — CLI source `GetPendingSeeds`: `https://github.com/supabase/cli/blob/develop/apps/cli-go/pkg/migration/seed.go`; reset docs: `https://github.com/supabase/cli/blob/develop/apps/cli/docs/supabase/db/reset.md` (via Context7, verified 2026-09-03)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration Harness Foundation

#### Automated

- [ ] 1.1 Integration config loads without booting Astro (`npm run test:integration:db` starts, no `astro:env/server` error)
- [ ] 1.2 Smoke test passes (`npm run test:integration:db`)
- [ ] 1.3 Fast unit run unaffected (`npm run test:run`)
- [ ] 1.4 Lint passes (`npm run lint`)

#### Manual

- [ ] 1.5 With Supabase stopped, `test:integration:db` fails fast with the "run `npx supabase start` first" message
- [ ] 1.6 Destructive-op guard aborts on a non-local DB host
- [ ] 1.7 No `service_role` key appears in test output/logs

### Phase 2: RLS / IDOR Cross-Account Matrix + guest_conflicts DB-Check

#### Automated

- [ ] 2.1 All RLS/IDOR specs pass (`npm run test:integration:db`)
- [ ] 2.2 `guest_conflicts` `(B,A)` insert raises `23514` (asserted) (`npm run test:integration:db`)
- [ ] 2.3 Lint passes (`npm run lint`)

#### Manual

- [ ] 2.4 Matrix covers all six tables for SELECT-isolation and anon-denial, incl. a positive control (each user sees its own seeded rows while the other sees 0) (reviewed vs research crib sheet)
- [ ] 2.5 F9 flipped to DONE; new `guest_conflicts.wedding_id` follow-up recorded
- [ ] 2.6 Tests isolated within a run — after write/DB-check specs, a baseline/SELECT-isolation check sees only seed rows (per-spec cleanup proven); two consecutive runs also identical

### Phase 3: API Payload Contract Tests (Risk #5)

#### Automated

- [ ] 3.1 All contract specs pass against a running preview (`npm run test:integration`)
- [ ] 3.2 Fast unit run still unaffected (`npm run test:run`)
- [ ] 3.3 Lint passes (`npm run lint`)

#### Manual

- [ ] 3.4 With preview stopped, the HTTP suite fails fast with the "run `npm run build && npm run preview` first" message
- [ ] 3.5 Spot-check one error body confirms no guest PII / input echo
- [ ] 3.6 Rebuild-before-run footgun documented in cookbook + readiness message
