<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Assignment Progress Counter & State Persistence (S-05)

- **Plan**: context/changes/assignment-progress-and-persistence/plan.md
- **Mode**: Deep
- **Date**: 2026-09-12
- **Verdict**: REVISE → SOUND (both findings fixed during triage)
- **Findings**: 1 critical  0 warnings  1 observation  (all resolved)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓, symbols ✓ (state WeddingWorkspace.tsx:46-50, mutations :80-94/:103-107/:115-120, upsert-by-guestId :116, seatCount↔seats map table.service.ts:16-17), brief↔plan ✓.

## Findings

### F1 — Success Criteria use `- [ ]` checkboxes outside the Progress section

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §"Success Criteria" (lines 161-177), Phase 2 (lines 208-223)
- **Detail**: The Automated/Manual Verification subsections inside both Phase blocks use `- [ ]` checkbox bullets (e.g. line 161 `- [ ] Unit tests pass: npm run test:run`). The Progress-format contract (`.claude/skills/10x-plan/references/progress-format.md`) requires Phase blocks to contain plain `- ` bullets only — checkboxes live exclusively in `## Progress`. The tooling parses document-wide (§58-59): "Next pending step = first `- [ ]` line in document order" and "Completion = count([x]) / count([ ]+[x])". The first `- [ ]` in this document is line 161 (a Success-Criteria bullet with no `N.M` index), not the real Progress step 1.1 at line 289 — so next-step detection is wrong and every Success-Criteria checkbox is double-counted into the completion ratio. Archived plans do this correctly: 2026-09-04's Success Criteria use plain `- ` bullets, checkboxes only under `## Progress`.
- **Fix**: In both Phase blocks, change the `- [ ]` bullets under `#### Automated Verification:` and `#### Manual Verification:` to plain `- ` bullets (drop the `[ ]`). Leave the `## Progress` section (lines 285-315) unchanged — it already uses `- [ ] N.M` correctly.
- **Decision**: FIXED — converted 15 `- [ ]` bullets to plain `- ` across both phases' Success Criteria; verified 0 checkboxes remain before `## Progress`.

### F2 — `total` uses `seatCount`; codebase convention is `seats.length`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §1 — computeProgress contract (line 117)
- **Detail**: The helper defines `total = sum of table.seatCount`. Elsewhere the codebase derives the effective seat count from the materialized array: `adjacency.ts:19` (`const seatCount = seats.length`) and `TableRing.tsx:170` (`const n = seats.length`). `seatCount` and `seats.length` are equal by construction (the atomic `create_table_with_seats` / `update_table` RPCs keep them in sync — table.service.ts:16-17 maps both from one row), so this is not a bug today. But `assigned` is bounded by real seats (`seatId` must reference a seat), so deriving `total` from `seats.length` too makes `isComplete` provably reachable and matches the existing convention.
- **Fix**: Consider `total = sum of table.seats.length` for consistency with adjacency.ts / TableRing.tsx. Optional — functionally equivalent while the RPC invariant holds.
- **Decision**: FIXED — changed the helper contract (line 117) and the Key Discoveries note to `seats.length`; Current State Analysis (line 28) left as-is (still accurately describes Table carrying both fields).
