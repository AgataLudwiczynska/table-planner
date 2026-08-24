<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Seat Assignment with Real-Time Adjacency Conflict Validation (S-03)

- **Plan**: context/changes/assignment-with-realtime-conflict-validation/plan.md
- **Scope**: Full plan — Phases 1–5 of 5 (Phases 1–2 also reviewed separately in `impl-review-phase-1-2.md`)
- **Date**: 2026-08-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run at review time)

- `npx astro check` — PASS (0 errors, 0 warnings; 4 hints in `eslint.config.js`, pre-existing/unrelated).
- `npm run lint` — PASS (0 errors; only `astro-eslint-parser projectService` advisories).
- `npm run build` — PASS (server built, Complete).

## Findings

### F1 — Guardrail adjacency validator ships with manual verification only

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/adjacency.ts:13-47
- **Detail**: `validateTable`/`validateAllTables` is the slice's defining risk surface — change.md:20 names it "the single most guardrail-sensitive line" with a zero-false-negative requirement (FR-021). The implementation is correct on inspection: `seatCount < 2` → no pairs; `seatCount === 2` caps `edgeCount` at 1 so the single edge is counted once (no self-neighbor, no double-count); `n >= 3` visits each ring edge `{i, (i+1) mod n}` exactly once including the last↔first wrap; pair keys are canonicalized (`a < b`) to match `guest_conflicts` storage order. It was manually verified (Progress 4.4–4.8, 5.6). The residual risk is only that this is guarded by manual checks, not an automated regression test — and Phase 5's ring re-derives seat ordering, so future ring-layout edits could silently regress it. This is a **documented, tracked deferral**, not a gap: it is `follow-ups.md` F6 (Vitest + the "validation never stays silent" suite), targeted at S-03, and "What We're NOT Doing" #4 explicitly excludes a test suite from this slice.
- **Fix**: No action in this slice. Land `follow-ups.md` F6 (pure `validateTable` unit test first — no harness needed) when the test runner arrives; it is already registered with S-03 as target.
- **Decision**: SKIPPED — accepted as-is; residual risk already tracked as `follow-ups.md` F6 (S-03 target). No code change.

## Notes (verified clean, no finding)

- **Plan Adherence** — every planned file is present and matches intent: `assignments` migration (constraints + owner-chain RLS + FK index + `revoke anon` + `(select auth.uid())`), enriched `listTables`/`createTable` re-read with seats, `assignment.service.ts` (explicit guest+seat membership, `upsert(onConflict: guest_id)`, `23505`→`seat_occupied`), `api/assignments.ts` (POST 200 / DELETE), SSR wiring, tab + state in `WeddingWorkspace`, `AssignmentBoard`, `useSeatDnd` (deferred `import()` + `AbortController` + ref-held commit/occupancy), `adjacency.ts`, `TableRing`.
- **Scope Discipline** — no swap (occupied seats reject drops via `canDrop` and expose no seat-click handler), no auto-unassign, no RPC for assignments, only the **core** `@atlaskit/pragmatic-drag-and-drop` installed (no `-react-accessibility`/`-react-drop-indicator`/`@atlaskit/icon`), pinned exactly at `3.0.0`. No unplanned code files in the diff.
- **Safety & Quality** — RLS owner-chain on all four operations; `revoke all … from anon`; service validates guest+seat membership before write (RLS as backstop); `on delete cascade` on all three FKs; failed assign/unassign surfaced via `ServerError`, never silent; `source.data` narrowed before use; monitor commits from event data (no stale-closure write).
- **Pattern Consistency** — mirrors `conflict.service.ts` (membership + canonical order), `tables.ts` endpoint sequence, `setGuests`/`setConflicts` functional-update pattern, `Row`/clean-domain/`…Input` type naming, `ROUTES.apiAssignments` (no hardcoded literal). `onGuestDeleted` extended to prune assignments (no phantom occupied seat).
- **Lessons priors** — RLS revoke-anon + `(select auth.uid())` ✅; route registry ✅; RLS verification runbook updated same slice ✅; deferred follow-ups reconciled (F6 test, F7 prod-migration path via deploy-runbook, F8 ring legibility all registered centrally) ✅; comments ≤2 lines / "why" ✅.

---

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review (re-run): Seat Assignment with Real-Time Adjacency Conflict Validation (S-03)

> Fresh full-plan review re-run at the user's request. Appended below the prior report (2026-08-23) rather than overwriting it. Same code (HEAD `b83d705`); the only later commit than the prior report is the docs-only plan epilogue.

- **Plan**: context/changes/assignment-with-realtime-conflict-validation/plan.md
- **Scope**: Full plan — Phases 1–5 of 5
- **Date**: 2026-08-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run at HEAD b83d705)

- `npx astro check` — PASS (0 errors, 0 warnings; 4 hints in `eslint.config.js`, pre-existing/unrelated).
- `npm run lint` — PASS (0 errors; only `astro-eslint-parser projectService` advisories).
- `npm run build` — PASS (server built, Complete; sitemap `site`-missing WARN is pre-existing).

## Findings

### F2 — DELETE /api/assignments unassigns by guest_id without resolving wedding ownership (asymmetric with POST)

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/assignments.ts:49-72
- **Detail**: POST resolves the wedding via `getWedding()` before writing; DELETE calls `unassign(supabase, guestId)` with no wedding resolution, deleting by `guest_id` alone. This is exactly the item-6 contract (`unassign` takes no `weddingId`) and is safe — a cross-wedding `guestId` is invisible under the assignments DELETE RLS policy, so `maybeSingle()` returns null → `assignment_not_found` (404), no cross-tenant delete. Both drift and safety sub-agents independently flagged only the asymmetry, not a vulnerability.
- **Fix**: No action needed. Optional consistency tweak: resolve the wedding in DELETE too (mirroring POST) so the two handlers read identically — but RLS already enforces the boundary, so this is cosmetic and leaving it as-is is faithful to the plan contract.
- **Decision**: SKIPPED — accepted as-is; RLS enforces the owner boundary and the asymmetric shape is faithful to the Phase 2 plan contract. No code change.

### F3 — Guardrail adjacency validator ships with manual verification only (no automated regression test)

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/adjacency.ts:20-47
- **Detail**: `validateTable`/`validateAllTables` is the slice's zero-false-negative surface (change.md:20, FR-021). Both sub-agents traced the loop and confirmed it correct: `n < 2` → no pairs; `n === 2` caps `edgeCount` at 1 (single edge once, no self-neighbor, no double-count); `n >= 3` visits each ring edge once including the last↔first wrap; pair keys canonicalized (`a < b`) to match `guest_conflicts` ordering. Residual risk is only that it is guarded by manual checks, not an automated test — and Phase 5's ring re-derives seat ordering, so a future ring-layout edit could silently regress it. This is a documented, tracked deferral (`follow-ups.md` F6, S-03 target), not a gap; "What We're NOT Doing" #4 excludes a test suite from this slice. (Carried over from the prior report's F1.)
- **Fix**: No action in this slice. Land `follow-ups.md` F6 (pure `validateTable` unit test first — no harness needed) when the test runner arrives.
- **Decision**: SKIPPED — duplicate of this file's earlier F1 (same finding, carried over); already decided SKIPPED there and tracked as `follow-ups.md` F6. No code change.

## Notes (verified clean, no finding)

- **Plan Adherence** — drift agent read all 13 planned files; every one is MATCH. Constraints + owner-chain RLS + FK index + `revoke anon` + `(select auth.uid())` in the migration; enriched `listTables`/`createTable` re-read with seats (the contract's specific "don't hand-build" worry is satisfied); `assignment.service.ts` membership-before-write + `upsert(onConflict: guest_id)` + `23505`→`seat_occupied`/`42501`→`forbidden`; endpoint sequence; SSR wiring; tab + functional-update state; `AssignmentBoard`; `useSeatDnd`; `adjacency.ts`; `TableRing` (`angle = 2πi/n − π/2`, seat 1 at top).
- **Scope Discipline** — all seven "What We're NOT Doing" guardrails hold: no occupied-seat swap (`canDrop` false when occupied), no auto-unassign, no assignment RPC, no test suite, only core `@atlaskit/pragmatic-drag-and-drop` pinned `3.0.0` (no `-react-accessibility`/`-react-drop-indicator`), no perf work, no S-04/S-05 scope.
- **Safety & Quality** — adjacency loop traced correct (2-seat collapse, wrap edge); `useSeatDnd` cleanup aborts + unbinds (no leak, no pre-import race), monitor commits from event data (no stale closure), binds once (occupancy behind `occupiedRef`), `canDrop` blocks occupied + non-guest; service validates guest+seat membership before write with no cross-wedding write path; migration RLS clean. One fully-mitigated TOCTOU (seat read → upsert, closed by `unique(seat_id)` + RLS) — no change needed.
- **Pattern Consistency** — service mirrors `conflict.service.ts`/`table.service.ts` (`COLUMNS`, `Pick<Row>`, `toX`, `failure()`/`success()`); endpoint mirrors `tables.ts` (`prerender = false`, guards, zod `safeParse`, `getWedding`); `cn()` for all merged classes; `ROUTES.apiAssignments` (no literals); Polish UI copy; comments "why"/≤2 lines. Only the F1 DELETE/POST asymmetry noted.
- **Lessons priors** — RLS revoke-anon + `(select auth.uid())` ✅; route registry ✅; RLS verification runbook updated same slice ✅; deferred follow-ups reconciled centrally (F6/F7/F8) ✅; comments ≤2 lines / "why" ✅.
