<!-- PLAN-REVIEW-REPORT -->
# Plan Review: API + RLS Integration Tests (test-plan Phase 2)

- **Plan**: context/changes/testing-api-rls-integration/plan.md
- **Mode**: Deep
- **Date**: 2026-09-02
- **Verdict**: SOUND (after triage — all 4 findings fixed; was REVISE at review time)
- **Findings**: 0 critical · 2 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → PASS (after triage) |
| Plan Completeness | WARNING → PASS (after triage) |

## Grounding

9/9 paths ✓ (`test/` and `supabase/seed.sql` absent — new/acknowledged). Symbols ✓: error catalog (`invalid_seat_count`, `validation_error`, `*_not_found`), RPC `not_owner`/`42501`, RPC `seat_count_must_be_positive`/`22023`, `guest_conflicts` CHECK `(guest_a_id < guest_b_id)` + UNIQUE, `revoke all ... from anon` on all tables — all confirmed against code/migrations. brief↔plan ✓. Verified in code: the four RLS-only mutations scope by client `id` only (no `wedding_id` filter) → cross-account resolves to `*_not_found` (404) via `.maybeSingle()` null; `seatCount` bounded `1..30` in zod (both 0 and 31 → `invalid_seat_count` 400); POST bodies strip unknown keys via zod safeParse (extra `wedding_id` never reaches the service).

## Findings

### F1 — One test:integration glob couples DB layer to preview

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1–2 (config/script) vs Testing Strategy → Manual Testing Steps
- **Detail**: One config, one include glob (`test/integration/**`), so `npm run test:integration` runs Phase 2 (direct-Postgres, no preview) AND Phase 3 (HTTP, needs preview) in the same invocation. But Manual Testing Steps say step 1 runs "Phases 1–2 — all green" without preview, and only step 2 starts preview. With everything under one glob, step 1 can't be all-green: Phase 3 specs fail-fast on the readiness check. Net effect: no green run is possible without a full `npm run build && preview` first — even when only iterating on RLS tests.
- **Fix A ⭐ Recommended**: Split into two globs/scripts
  - Strength: `test:integration:db` runs the direct-Postgres layer standalone (fast, only needs Supabase); `:http` (or umbrella `test:integration`) adds the preview layer. Matches the plan's own two-seam architecture and the Manual Steps' 1-then-2 ordering.
  - Tradeoff: Two scripts + two include globs to maintain.
  - Confidence: HIGH — seams already cleanly separated by dir.
  - Blind spot: None significant.
- **Fix B**: Keep one script; correct the Manual Steps wording
  - Strength: Minimal edit — just state preview is always required.
  - Tradeoff: Every RLS-test iteration still pays the preview build.
  - Confidence: HIGH.
  - Blind spot: Loses the fast DB-only lane the plan implies exists.
- **Decision**: FIXED via Fix A (minimal: `test:integration` = full suite incl. preview, `test:integration:db` = fast direct-Postgres lane; Manual Steps, Performance, and DB-layer success criteria + Progress aligned)

### F2 — Success criterion 2.6 doesn't actually test isolation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details (isolation) + Phase 2 criterion 2.6 / Progress 2.6
- **Detail**: The plan flags shared-DB isolation as a real risk but leaves the mechanism undecided ("per-test cleanup, or each test on its own rows"). Criterion 2.6 — "two consecutive runs yield identical results" — only proves `db reset` determinism (each full run resets at globalSetup), NOT the flagged risk: residue from a successful INSERT (e.g. the canonical conflict the `23505` test must create first) corrupting a later "0 rows" SELECT within the same run. The one criterion meant to catch this can't.
- **Fix**: Decide the isolation mechanism in the plan (recommend: each write-spec creates + cleans its own rows, or order the read-only SELECT-isolation specs before any INSERT spec), and reword 2.6 to assert within-run isolation (e.g. a SELECT-isolation assertion that runs after the write/DB-check specs still sees 0 cross-account rows).
- **Decision**: FIXED via Option 1 (self-cleanup per write-spec + `fileParallelism: false`; mechanism decided in Critical Implementation Details + Phase 1 §1 config + Phase 2 §5 db-check; 2.6 reworded to assert within-run isolation, mirrored in Progress)

### F3 — Preview↔Supabase env coupling unstated

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 (http-client) / Critical Implementation Details
- **Detail**: globalSetup reads the connection from `supabase status` and resets+seeds the LOCAL Supabase. The preview worker reads its own `SUPABASE_URL`/`SUPABASE_KEY` from `.dev.vars`. Phase 3 signs in as the seeded users through preview — so the two MUST target the same local instance. The plan documents the stale-*build* footgun loudly but never states this env coupling; if `.dev.vars` points elsewhere, signin fails with a confusing auth error, not the readiness message. (Local Supabase keys are deterministic, so low-risk but silent when wrong.)
- **Fix**: Add "preview must run against the same local Supabase (`.dev.vars` → 127.0.0.1:54321)" to the Phase 3 prerequisite/readiness note.
- **Decision**: FIXED (env-coupling prerequisite added to Phase 3 §1 `http-client.ts` readiness contract and cookbook §6.3)

### F4 — db reset vs. the missing seed.sql

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 (globalSetup runs `db reset`)
- **Detail**: Current State notes `[db.seed]` points at `./seed.sql` which does not exist, yet globalSetup runs `supabase db reset` (which honors `[db.seed]`). Verify reset doesn't warn/error on the missing file — if it does, Phase 1's very first destructive step is noisy or fails.
- **Fix**: Confirm behavior; if reset complains, either create an empty `seed.sql` or disable `[db.seed]` for the test flow.
- **Decision**: FIXED (verified via Context7/CLI source — `db reset` emits a benign WARN and exits 0 on a missing seed, never fatal; plan now notes this in Phase 1 §3 + Current State, gates the reset on exit code not stderr, and cites the CLI source in References. No empty `seed.sql` needed — seeding is programmatic.)

---

## Second Review Pass

- **Date**: 2026-09-03
- **Mode**: Deep
- **Findings this pass**: 0 critical · 1 warning · 1 observation (F5–F6)
- **Verdict after this pass**: REVISE at review time → SOUND after triage (both F5 and F6 FIXED). F5 was a real end-state gap; F6 a cheap correctness note. Both new; neither overlaps F1–F4.

### Grounding (this pass)

Re-grounded against migrations + endpoints. Confirmed: `weddings/tables/seats` (`20260812…`), `guests/guest_conflicts` (`20260819…`), `assignments` (`20260822…`) all owner-chain RLS; `guest_conflicts` FKs `guest_a_id`/`guest_b_id` → `guests(id)` with `check (guest_a_id < guest_b_id)` + `unique(guest_a_id, guest_b_id)`; `tables`/`seats` have **no INSERT policy**, `guest_conflicts` has **no UPDATE policy** (plan's structural-denial cells accurate); RPC `create_table_with_seats` self-checks `not_owner`/`42501` and revokes execute from `public, anon`. The four new `test/integration/*` files + `vitest.integration.config.ts` still absent (expected). Follow-ups: only F9 targets this slice — plan pulls it correctly; nothing missed.

### F5 — Seed scope (weddings only) leaves the SELECT-isolation and UPDATE/DELETE matrix cells vacuous

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §3 (globalSetup seed) + Phase 2 §1 (rls-select) / §3 (rls-writes) / §5 (db-check)
- **Detail**: The seed contract is specified only as "seed users A and B **with their weddings**" (Phase 1 §3 Intent/Contract; Critical Impl Details calls the seed + the canonical conflict pair "the only successful writes"). But the matrix's read/modify cells only prove RLS when user A **owns concrete rows** in the child tables:
  - **SELECT-isolation (§1)** — "B's `.select()` filtered to A's ids → empty" is trivially true for `tables/seats/guests/guest_conflicts/assignments` if A owns no rows there. 5 of 6 tables return 0 rows because the table is empty for A, **not because RLS blocked B** — a false-green. Only `weddings` is meaningfully exercised by the seed as described.
  - **UPDATE/DELETE on A's rows (§3)** — "→ 0 rows affected" is equally vacuous: `update guests where id = <id A doesn't own>` affects 0 rows whether RLS works or not. The cell needs A to own a known row id in each table.
  - **DB-check (§5)** — the `(B,A)`→`23514` and duplicate→`23505` inserts are FK-bound to `guests(id)`; the owner must first hold **two** guest rows. The plan states only "insert with `guest_a_id > guest_b_id`" — the two-guest precondition (and its cleanup, which cascades) is unstated.
  Net: success criteria 2.1/2.4 ("all six tables covered for SELECT-isolation") can pass while the goal — isolation proven *by the control* — is unmet for most tables. This is the exact "all criteria green, goal unmet" gap.
- **Fix**: Specify the seed as a full per-user fixture graph for **both** A and B — wedding → a table (+ its seats via the RPC) → ≥2 guests → a canonical `guest_conflicts` pair → an assignment — so every child table holds owner-owned rows with ids the specs can reference. And add a **positive control** to the SELECT-isolation spec (A's client sees its own N>0 rows while B sees 0), so a green run proves RLS filtered rather than that the table was empty. (Alternative for the write cells: have each write-spec create A's row as service-role first, then attempt B's op — but a shared seed graph also serves §1 and §5 and is less per-spec bookkeeping.)
- **Decision**: FIXED (Phase 1 §3 seed → full per-user graph for both users + seeded-row ids exposed to specs; Phase 2 §1 gains a positive control; Phase 2 §5 reuses seeded guests/pair and leaves no successful write; Critical Impl Details isolation sentence + criterion/Progress 2.4 aligned)

### F6 — "UPDATE/DELETE → 0 rows affected" needs `.select()` or the assertion is a no-op

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §3 (rls-writes) — assertion vocabulary "→ 0 rows affected"
- **Detail**: With `@supabase/supabase-js`, `.update({…}).eq('id', …)` / `.delete().eq('id', …)` return `{ data: null, error: null }` by **default** — RLS-filtered rows produce no error and no row count. To assert "0 rows affected" the call must chain `.select()` and assert `data.length === 0`. If a spec instead asserts only `error === null` (the natural reading of "0 rows affected, no error"), it passes even if RLS were broken and A's row were actually mutated — a silent false-green on the RLS-only mutation cells (`PATCH/DELETE guests`, `DELETE conflicts`, `DELETE assignments`), which are the plan's highest-priority regression surface. The INSERT→`42501` and DB-check cells are unaffected (they raise, so the oracle is the SQLSTATE).
- **Fix**: State in Phase 2 §3's contract that rows-affected cells chain `.select()` and assert on the returned array length (`[]` = 0 affected), not on `error` alone. One line in the plan; keeps the oracle honest for the four RLS-only mutations.
- **Decision**: FIXED (Phase 2 §3 contract now requires rows-affected cells to chain `.select()` and assert on returned array length, not on `error` alone)
