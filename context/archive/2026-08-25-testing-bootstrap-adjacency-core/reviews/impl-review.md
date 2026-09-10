<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Vitest Bootstrap + Adjacency-Conflict Guardrail

- **Plan**: context/changes/testing-bootstrap-adjacency-core/plan.md
- **Scope**: Full plan (Phases 1–3 of 3, all Progress `[x]`)
- **Date**: 2026-08-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Automated verification (re-run at review time)

- `npm run test:run` → **10 passed (1 file)**, exit 0
- `npm run lint` → exit 0 (only `astro-eslint-parser projectService` info notices; no errors)
- `npx astro check` → **0 errors, 0 warnings**, 4 hints (pre-existing `ts(6387)` deprecation hints in `eslint.config.js`, unrelated to this change)

## Findings

### F1 — No negative case guards the conflict-membership check (surviving mutant)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/adjacency.test.ts (whole suite) vs. src/lib/adjacency.ts:30
- **Detail**: The suite proves the false-negative direction well (wrap edge, 2-seat collapse, order independence all guard the flag-emitting path). It does not guard the conflict gate at `adjacency.ts:30` (`if (!conflictSet.has(pairKey(guestA, guestB))) continue`). Deleting that line — making the validator flag *every* adjacent occupied pair regardless of the conflict set — leaves **all 10 tests green**: no case seats two adjacent, occupied, *non-conflicting* guests and asserts no violation. The existing "non-adjacent" negative case (indices 0 and 2) exercises the adjacency gate, not the conflict gate, so it cannot catch this mutation. The plan's Phase 2 §2 rationale for the negative case ("proves no false-positive explosion masks the check") is therefore only partially met.
- **Fix**: Add one case — a 4-seat ring with two *adjacent* occupied guests (e.g. `gA` at s1, `gX` at s2) whose pair is **not** in the conflict set — asserting `validateAllTables(...)` returns `[]`. This kills the mutant on line 30 and completes the false-positive guard.
- **Decision**: FIXED — added the "does not flag adjacent occupied guests who are not a registered conflict pair" case to src/lib/adjacency.test.ts; suite now 11/11 green.
