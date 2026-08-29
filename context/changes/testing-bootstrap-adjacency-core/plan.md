# Test Rollout Phase 1 — Vitest Bootstrap + Adjacency-Conflict Guardrail Implementation Plan

## Overview

Stand up the project's test runner (Vitest — 0 test files today) and lock **Risk #1**
from `context/foundation/test-plan.md`: two "nie obok" guests sit adjacent but no red flag
appears (the `false-negatives = 0` guardrail silently fails). The entire guardrail is a
single pure module, `src/lib/adjacency.ts`, with zero automated coverage. This change
delivers the runner plus an oracle-disciplined unit suite over that module, and closes
follow-up **F6**.

## Current State Analysis

- **The guardrail is one pure, client-only function.** `src/lib/adjacency.ts` exports
  `validateTable` (per-table ring core) and `validateAllTables` (entry point). There is
  **no** server-side or SQL re-implementation — the API/service layer enforces only the
  one-guest-per-seat *invariant* via DB `unique` constraints, never the adjacency rule. The
  challenger question "do client and server adjacency implementations drift?" is **confirmed
  moot** (`research.md` §3). This sharpens Risk #1: the zero-false-negative guardrail has
  exactly one code owner and no runtime backstop — protected today only by manual eyeballing.
- **Two guardrail-sensitive lines** (`research.md` §2):
  - **Wrap edge**: `seats[(i + 1) % seatCount]` (`adjacency.ts:26`) — last seat neighbors
    first (seat 1 ↔ seat N).
  - **2-seat degenerate collapse**: `edgeCount = seatCount === 2 ? 1 : seatCount`
    (`adjacency.ts:23`) — a 2-seat ring has one edge; the general loop would count it twice.
- **Ring order is data-derived, not from `seatNumber` directly.** `validateTable` iterates
  `table.seats` *array index order*; the server sorts seats ascending by `seat_number`
  (`table.service.ts:27`). A faithful fixture must construct `seats` ascending by
  `seatNumber` (`research.md` §1).
- **Canonical pairing is guaranteed** at three layers (DB `check`, service sort, validator
  `pairKey`); `(A,B) == (B,A)` (`research.md` §5). `pairKey` is **not exported**.
- **Toolchain is clean-slate** (`research.md` §6, `tooling-vitest-setup.md`): Vite pinned
  `^7.3.2` → Vitest **4.x** line (exact `4.1.11`); `@/*` → `./src/*` alias must be replicated;
  `adjacency.ts` imports only *types*, so it unit-tests as pure ESM with no Astro/Cloudflare
  boot. ESLint applies `strictTypeChecked` + `stylisticTypeChecked` to all `.ts`, and
  lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` at commit — test files are in scope.

## Desired End State

`npm test` runs a Vitest suite that fails if the adjacency guardrail ever silently misses a
flag. The suite covers the wrap edge, the 2-seat collapse, partial occupancy, order
independence, and cross-table independence — all with expected values derived **by-hand from
ring geometry**, never from the implementation. `npm run lint` and `astro check` stay green
on the new files. The test-plan cookbook §6.1 documents the unit-test pattern, and F6 is
marked DONE.

### Key Discoveries:

- Single source of truth: `src/lib/adjacency.ts:13-47` (validateTable + validateAllTables).
- Oracle table for ring edges (`research.md` §2): N<2 → none; N=2 → `(0,1)` once;
  N≥3 → `(i,(i+1) mod N)` for i=0..N-1, **including** the wrap edge `(N-1,0)`.
- `Violation` carries both seat ids **and** both guest ids in *adjacency* order, not
  canonical UUID order (`types.ts:64-71`, `research.md` §4) — assert the flagged pair as an
  **unordered set**.
- Astro's `getViteConfig()` from `astro/config` inherits the `@/*` alias for free
  (`tooling-vitest-setup.md` §1) — the recommended config base.
- `Assignment` has three fields `{ id, guestId, seatId }` — a typed fixture must supply `id`
  even though the validator reads only `seatId`/`guestId` (`research.md` §7).

## What We're NOT Doing

- **No DB / integration test in this phase.** The violation logic is pure with no DB
  dependency. The one DB-side fact worth asserting — that `guest_conflicts` rejects a
  non-canonical `(B,A)` insert via its `check` constraint — is **deferred to Phase 2**
  (API + RLS integration), which already stands up local Supabase. This phase records that
  hand-off; it does not pull Docker/Supabase into an otherwise pure-logic phase. Order
  independence *at the guardrail* is still proven here at the unit layer.
- **No DOM / component / DnD tests.** No `jsdom`/`happy-dom`, no `@testing-library/*`, no
  `AssignmentBoard.tsx` render test. Reserved for later phases.
- **No `@cloudflare/vitest-pool-workers`.** The target is a pure function; `environment:
  'node'` is correct.
- **No CI gate wiring.** Test-plan §5 marks unit+integration as "required after Phase 1";
  the actual CI step is wired in Phase 4 (gates phase). This phase makes the gate
  *runnable*, not *enforced*.
- **No server/client adjacency parity test** — confirmed moot (there is one implementation).

## Implementation Approach

Three incremental phases: (1) make the runner exist and prove the alias resolves with a
throwaway smoke test; (2) replace the smoke with the real oracle-disciplined suite; (3)
document and do the bookkeeping. Each phase is independently verifiable via `npm test` /
`npm run lint`.

## Critical Implementation Details

- **Oracle discipline** (the load-bearing constraint): every expected `Violation` set is
  derived by hand from the ring-edge table above, written as a literal in the test. Never
  compute expectations by calling `validateAllTables` and snapshotting its output — that
  would encode a bug as the expectation. This is the single most important rule of the suite.
- **Seat order must mirror production**: fixtures build `table.seats` ascending by
  `seatNumber`. A fixture with out-of-order seats would pass against a wrong oracle.
- **Assert pairs as unordered sets**: `Violation.guestAId/guestBId` are in adjacency order,
  not canonical order — positional assertions are brittle and can mask a real check.

## Phase 1: Vitest Runner Bootstrap

### Overview

Install Vitest, add a `getViteConfig()`-based config, wire the `test` scripts, reconcile
with ESLint/lint-staged, and prove the runner + `@/*` alias work with a minimal smoke test.

### Changes Required:

#### 1. Vitest dependency

**File**: `package.json`

**Intent**: Add `vitest@4.1.11` (exact pin, not `^`; 4.x line — its Vite peer declares Vite 7)
as a devDependency. Confirm the resolved version against the `vite@^7.3.2` override at install
time; against Vite 7 a peer conflict signals too **low** a Vitest line, not too high — the fix
is a newer line, never `--force`. `4.1.11` is the advisory floor; exact-pin + committed lockfile
is deliberate for supply-chain hygiene. Rationale + advisory check: `tooling-vitest-setup.md`
→ *Addendum*.

**Contract**: `devDependencies.vitest` present at `4.1.11` (exact); `npm install` completes with
no peer-dependency error against `vite ^7.3.2`.

#### 2. Test scripts

**File**: `package.json`

**Intent**: Add `test` (watch/interactive, `vitest`) and `test:run` (single-pass for
CI/agents, `vitest run`) scripts. `test:run` is the command later phases wire as the CI gate.

**Contract**: `scripts.test` and `scripts.test:run` exist. Update `CLAUDE.md` Commands
section is handled in Phase 3 — not here.

#### 3. Vitest configuration

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Base the config on Astro's `getViteConfig()` from `astro/config` so it inherits
the resolved `@/*` alias, the Tailwind plugin, and `astro:env/server` resolution — matching
the official `with-vitest` template and future-proofing Phase 2/3. Set `environment: 'node'`
(pure function, no DOM). Do **not** enable `globals` — tests import `describe/it/expect`
explicitly.

**Contract**: `export default getViteConfig({ test: { environment: 'node' } })` with a
`/// <reference types="vitest/config" />` triple-slash at the top. No `globals` key. No
`@cloudflare/vitest-pool-workers`.

#### 4. Lint / lint-staged reconciliation for test files

**File**: `eslint.config.js` (only if the smoke test cannot pass lint as-is)

**Intent**: Test files are `.ts` and fall under `strictTypeChecked` + `projectService`. Vitest
imports (`describe/it/expect` from `vitest`) are ordinary typed imports, so no globals-types
entry is needed. Verify the smoke test passes `npm run lint` with **no** config change; add a
minimal test-file override **only if** a strict rule genuinely misfires on idiomatic test code
(document which rule and why in the commit). Default expectation: **no ESLint change required.**

**Contract**: `npm run lint` is green on the new `vitest.config.ts` and the smoke test with,
ideally, zero `eslint.config.js` delta. `tsconfig.json` `include: ["**/*"]` already covers
test files for `astro check`.

#### 5. Smoke test (throwaway)

**File**: `src/lib/adjacency.smoke.test.ts` (new, deleted/replaced in Phase 2)

**Intent**: Prove the runner boots and the `@/*` alias resolves by importing
`validateAllTables` from `@/lib/adjacency` and asserting it returns `[]` for empty inputs.
This is a config sanity check, not coverage — Phase 2's real suite supersedes it.

**Contract**: One `it` importing from `@/lib/adjacency` (alias path, not relative) asserting
`validateAllTables([], [], [])` equals `[]`. `npm test` (single-pass) passes.

### Success Criteria:

#### Automated Verification:

- `npm install` resolves Vitest with no peer conflict against `vite ^7.3.2`
- `npm run test:run` executes the smoke test and passes
- The smoke test imports via the `@/` alias (proves alias resolution), not a relative path
- `npm run lint` passes on `vitest.config.ts` and the smoke test
- `npx astro check` passes

#### Manual Verification:

- `npm test` (watch mode) starts and re-runs on file change
- No spurious Vite/Astro boot errors in the runner output
- `npm audit signatures` confirms provenance on the installed vitest tree
- `npm audit` surfaces no advisory against the resolved vitest subtree

**Implementation Note**: After this phase and all automated verification passes, pause for
human confirmation that manual testing succeeded before proceeding to Phase 2.

---

## Phase 2: Adjacency Guardrail Unit Suite

### Overview

Replace the smoke test with the real oracle-disciplined suite covering every guardrail-
sensitive case for Risk #1 and F6. Test primarily through `validateAllTables`; drop to
`validateTable` only for pure ring-geometry edges (n=1, n=2 collapse, wrap) where hand-built
maps read clearer.

### Changes Required:

#### 1. Typed fixture factories

**File**: `src/lib/adjacency.test.ts` (new) — or a small local `__fixtures__` helper if it
keeps the suite readable

**Intent**: Provide typed factories for `Table`/`Seat`/`Assignment`/`Conflict` so cases stay
terse and type-correct. Seats are always built ascending by `seatNumber` to mirror the server
sort; `Assignment` factory supplies the required `id`.

**Contract**: Factories produce the exact domain shapes from `src/types.ts` (camelCase, not
`*Row`). A `ringTable(n)` helper yields a table with `n` seats in ascending `seatNumber`
order and consistent `seatCount`. Fixtures compare violations as unordered `{guestAId,
guestBId}` sets (a small normalize helper), never positionally.

#### 2. Oracle-disciplined test cases

**File**: `src/lib/adjacency.test.ts`

**Intent**: Cover, with by-hand-derived expectations, the full Risk #1 / F6 case set:
- **Adjacent conflict flags** — pair at seats i, i+1 on a 4-seat ring → one violation.
- **Non-adjacent does not flag** — same pair at seats i, i+2 → no violation (proves no
  false-positive explosion masks the check).
- **Wrap edge** — pair at seat 1 and seat N (indices N-1, 0) on N≥3 → one violation.
- **2-seat collapse** — conflict pair on a 2-seat table → exactly **one** violation, not two.
- **n=1 and n<2** — single/empty seat table → no violations (via `validateTable`).
- **Partial occupancy** — one seat of an adjacent conflict pair empty → no violation.
- **Order independence** — conflict stored `(A,B)`; guests seated `(B,A)` in adjacency → still
  flags. Assert in *both* seatings. (This is where a naive re-impl silently drops a flag.
  This proves the guardrail is order-independent; the DB `check`-constraint assertion remains
  separately owed in rollout Phase 2 — the unit test does not stand in for it.)
- **Cross-table independence** — `validateAllTables` over multiple tables attributes each
  violation to the correct `tableId`; a conflict split across two tables does not flag.

**Contract**: Each case has a literal expected-violation set derived from the ring-edge table
in `research.md` §2, not from running the function. Wrap, 2-seat collapse, and order
independence are each covered by at least one positive case. `validateTable` is used only for
n=1/n=2/wrap geometry; everything else goes through `validateAllTables`.

#### 3. Remove the smoke test

**File**: `src/lib/adjacency.smoke.test.ts` (delete)

**Intent**: The real suite subsumes the smoke check; delete the throwaway.

**Contract**: File removed; `npm run test:run` still green.

### Success Criteria:

#### Automated Verification:

- `npm run test:run` passes the full adjacency suite
- The suite includes explicit positive cases for the wrap edge, the 2-seat collapse, and
  order independence `(A,B)`/`(B,A)`
- At least one negative case (non-adjacent placement) and one partial-occupancy case assert
  no violation
- A cross-table case asserts correct `tableId` attribution via `validateAllTables`
- `npm run lint` and `npx astro check` pass on the suite
- The smoke test file no longer exists

#### Manual Verification:

- Spot-check one expected-violation literal by hand against the ring-edge table to confirm
  the oracle was derived by-hand, not copied from a test run
- Temporarily breaking `edgeCount` (e.g. dropping the `=== 2 ? 1` guard) makes the 2-seat
  case fail — confirms the test actually guards that line (revert after)

**Implementation Note**: After this phase and all automated verification passes, pause for
human confirmation before proceeding to Phase 3.

---

## Phase 3: Documentation & Bookkeeping

### Overview

Record the new capability in project docs, fill the test-plan cookbook, note the deferred
integration test, and close F6.

### Changes Required:

#### 1. CLAUDE.md test commands

**File**: `CLAUDE.md`

**Intent**: Replace the "No test suite is configured yet" line in the Commands section with
the real `npm test` / `npm run test:run` entries and a one-line note that the runner is
Vitest on `getViteConfig()`.

**Contract**: Commands section lists `test` and `test:run`; the stale "No test suite" caveat
is removed.

#### 2. Test-plan cookbook §6.1 + Phase 1 status/deferral note

**File**: `context/foundation/test-plan.md`

**Intent**: Fill §6.1 (adding a unit test) with the concrete pattern — file location
(`src/lib/*.test.ts`, colocated), naming, the reference test (`adjacency.test.ts`), the run
command (`npm run test:run`), and the oracle-by-hand discipline. Add a one-line note in §3 (or
§6.5) that Phase 1's "integration" scope — the `guest_conflicts` `check`-constraint assertion
— is intentionally carried to Phase 2. Optionally bump the §3 Phase 1 status toward
`complete` once Progress is fully `[x]`.

**Contract**: §6.1 no longer reads "TBD — see §3 Phase 1"; it names the reference test and
run command. A visible sentence records the integration-test deferral to Phase 2.

#### 3. Close follow-up F6

**File**: `context/foundation/follow-ups.md`

**Intent**: Flip F6 (`follow-ups.md:27`) from `OPEN` to `DONE`, referencing this change id.

**Contract**: F6 status is `DONE` with a pointer to
`context/changes/testing-bootstrap-adjacency-core/`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` / prettier pass on edited Markdown (lint-staged runs `prettier --write` on
  `*.md`)
- `grep -q "No test suite is configured yet" CLAUDE.md` returns nothing (caveat removed)
- `grep -q "TBD — see §3 Phase 1" context/foundation/test-plan.md` returns nothing (§6.1
  filled)
- F6 line in `follow-ups.md` reads `DONE`

#### Manual Verification:

- Cookbook §6.1 reads as actionable to someone adding their first unit test
- The Phase 2 integration deferral is discoverable by a future reader of the test-plan

**Implementation Note**: Final phase — after automated verification, confirm the docs read
cleanly, then this change is ready for `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

- The full case set in Phase 2 §2 — this *is* the deliverable, not a check on other code.
- Key edge cases: wrap edge (seat 1 ↔ seat N), 2-seat modulo collapse counted once, n<2
  empty, partial occupancy, order independence `(A,B)`/`(B,A)`, cross-table independence.

### Integration Tests:

- **Deferred to Phase 2 of the rollout** (`API + RLS integration`): the `guest_conflicts`
  `check (guest_a_id < guest_b_id)` constraint rejecting a non-canonical insert, asserted
  against local Supabase where that harness already exists.

### Manual Testing Steps:

1. Run `npm test` in watch mode; edit a fixture and confirm re-run.
2. Temporarily break the 2-seat guard (`edgeCount`) and confirm the 2-seat case fails; revert.
3. Read one expected-violation literal against the ring-edge oracle table to confirm by-hand
   derivation.

## Performance Considerations

Negligible — a pure-function unit suite. `getViteConfig()` adds async Astro-config boot at
startup; acceptable for one suite and worth the free alias resolution.

## Migration Notes

None — additive tooling only. No schema, no runtime code change. `adjacency.ts` is not
modified.

## References

- Research: `context/changes/testing-bootstrap-adjacency-core/research.md`
- Tooling notes: `context/changes/testing-bootstrap-adjacency-core/tooling-vitest-setup.md`
- Test strategy: `context/foundation/test-plan.md` §2 (Risk #1), §3 (Phase 1), §6.1
- Guardrail source: `src/lib/adjacency.ts:13-47`
- Domain shapes: `src/types.ts:22-71`
- Follow-up: `context/foundation/follow-ups.md:27` (F6)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Runner Bootstrap

#### Automated

- [ ] 1.1 npm install resolves Vitest with no peer conflict against vite ^7.3.2
- [ ] 1.2 npm run test:run executes the smoke test and passes
- [ ] 1.3 The smoke test imports via the @/ alias (proves alias resolution), not a relative path
- [ ] 1.4 npm run lint passes on vitest.config.ts and the smoke test
- [ ] 1.5 npx astro check passes

#### Manual

- [ ] 1.6 npm test (watch mode) starts and re-runs on file change
- [ ] 1.7 No spurious Vite/Astro boot errors in the runner output
- [ ] 1.8 npm audit signatures confirms provenance on the installed vitest tree
- [ ] 1.9 npm audit surfaces no advisory against the resolved vitest subtree

### Phase 2: Adjacency Guardrail Unit Suite

#### Automated

- [ ] 2.1 npm run test:run passes the full adjacency suite
- [ ] 2.2 Suite includes explicit positive cases for the wrap edge, the 2-seat collapse, and order independence (A,B)/(B,A)
- [ ] 2.3 At least one non-adjacent negative case and one partial-occupancy case assert no violation
- [ ] 2.4 A cross-table case asserts correct tableId attribution via validateAllTables
- [ ] 2.5 npm run lint and npx astro check pass on the suite
- [ ] 2.6 The smoke test file no longer exists

#### Manual

- [ ] 2.7 Spot-check one expected-violation literal by hand against the ring-edge table
- [ ] 2.8 Temporarily breaking edgeCount makes the 2-seat case fail (revert after)

### Phase 3: Documentation & Bookkeeping

#### Automated

- [ ] 3.1 npm run lint / prettier pass on edited Markdown
- [ ] 3.2 grep for "No test suite is configured yet" in CLAUDE.md returns nothing
- [ ] 3.3 grep for "TBD — see §3 Phase 1" in test-plan.md returns nothing
- [ ] 3.4 F6 line in follow-ups.md reads DONE

#### Manual

- [ ] 3.5 Cookbook §6.1 reads as actionable for a first unit test
- [ ] 3.6 The Phase 2 integration deferral is discoverable in the test-plan
