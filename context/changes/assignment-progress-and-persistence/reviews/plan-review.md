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

## Re-review 2026-09-12 — consistency after the "M" definition flip (mid-implementation)

After the review above, the counter's denominator M was redefined during
implementation from **total seats** (`computeProgress(tables, assignments)`,
`total = seats.length`) to **total guests entered** (`computeProgress(guests,
assignments)`, `total = guests.length`), with a matching edit to the roadmap
S-05 outcome (commit 87c1ec2). The flip is correct — the old seats-based
definition made `isComplete` unreachable when seats > guests and misleading when
seats < guests, whereas the guests-based one reaches completion exactly when
every entered guest has a seat and matches the PRD US-03 label "N / M **gości**
przypisanych". plan.md, roadmap.md, the shipped helper, its test, and
WeddingWorkspace are all consistent with the new definition. Two artifacts were
left behind.

### F3 — plan-brief.md still documents the old "M = total seats" contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness (cross-artifact consistency)
- **Location**: `context/changes/assignment-progress-and-persistence/plan-brief.md`
- **Detail**: The brief was not updated when M flipped from seats to guests. It still says "N = assigned guests, M = total seats" (line 8), describes the source state as "(`tables`, `assignments`)" (line 16), "When every seat is filled (N === M, M > 0)" (line 25), frames the Key Decisions rows around seats/empty-tables (lines 34–36), and specifies "Extract `computeProgress(tables, assignments)`" (line 53). The authoritative plan.md, roadmap.md, and the shipped code all use the guests-based definition, so the brief is a checked-in contradiction — a reader trusting it gets the wrong contract and wrong completion semantics. Nothing downstream broke (implementation followed plan.md), but it is the one place that is out of sync.
- **Fix**: Update the five spots in plan-brief.md to the guests-based definition (M = total guests entered; `computeProgress(guests, assignments)`; "when every entered guest has a seat"), mirroring plan.md's wording.
- **Decision**: FIXED — updated 4 stale spots in plan-brief.md to the guests-based definition (line 8 N/M defn; line 16 source state `guests`; line 53 helper signature `computeProgress(guests, assignments)`; line 57 wired-to `guests`/`assignments`). On close read only 4 spots were stale — the Key Decisions rows and Desired End State were already denomination-neutral (N === M, M > 0).

### F4 — Prior plan-review F2 now contradicts the shipped contract (no recorded rationale for the reversal)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness (traceability)
- **Location**: this file, finding F2 (above)
- **Detail**: F2 above recommended and marked FIXED `total = seats.length` — the exact definition later reversed. Reviews are point-in-time so this is not wrong per se, but a reader cross-referencing F2 sees the review endorsing seats.length while the code ships guests.length, and the *why* of the reversal (US-03 label + reachable completion) is not captured anywhere in the change folder.
- **Fix**: Optional — record a one-line rationale for the seats→guests flip in plan.md (or change.md) so the reversal of F2 is explained rather than silent. (This re-review section already documents it; a pointer from plan.md would close the loop.)
- **Decision**: ACCEPTED — the "Re-review 2026-09-12" section above documents the rationale; no further pointer added to plan.md.
