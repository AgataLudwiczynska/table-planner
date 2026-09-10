<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Table Edit with Guest Auto-Unassign (S-04)

- **Plan**: context/changes/table-edit-with-guest-auto-unassign/plan.md
- **Mode**: Deep
- **Date**: 2026-09-06
- **Verdict**: REVISE
- **Findings**: 1 critical, 3 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

10/10 paths ✓ (migrations, service, api/tables.ts, types.ts, errors.ts, adjacency.ts, WeddingWorkspace/GuestsTab/AssignmentBoard, ui/ dir confirms no dialog primitive). RPC pattern (create_table_with_seats) + service/endpoint skeletons ✓. DELETE-with-JSON-body precedent confirmed (GuestsTab → DELETE /api/guests with body:{id}; guests.ts/assignments.ts DELETE handlers). Delete not-found detection pattern confirmed (`.delete().select("id").maybeSingle()` → `!res.data` → *_not_found). brief↔plan consistent.

## Findings

### F1 — Shrink dialog trigger can skip confirmation, silently freeing guests

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real logic bug; fix is clear but must be reasoned
- **Dimension**: End-State Alignment
- **Location**: Phase 3 §2 (Intent vs. Contract — internal contradiction)
- **Detail**: The Intent triggers the dialog when `newCount < assignedCount`; the Contract computes N as "seats with seatNumber > newCount that appear in assignments." These are not equivalent — the Intent's rule is a false negative. Guests are assigned to arbitrary seats (drag-to-seat, not low-seat-first). Example: 10-seat table with guests on seats 1 and 10 (assignedCount=2); shrink to 5 → "5 < 2" is false → no dialog → RPC still deletes seats 6–10, cascading away the seat-10 guest's assignment → guest freed with no confirmation, violating FR-008/US-02. The roadmap acceptance test (contiguous seats 1–7) masks this because there `newCount<assignedCount` and `N>0` coincide.
- **Fix**: Make the trigger use the same N as the Contract: `N = |{ assignments whose seatId belongs to this table with seatNumber > newCount }|`, open the shrink dialog iff `N > 0`, and drop the "newCount < assignedCount" formulation so trigger and displayed count are one computation.
  - Strength: Removes the class of bug; trigger and copy can't diverge.
  - Tradeoff: None — it's strictly the correct set.
  - Confidence: HIGH — verified against assignments keying off seatId (types.ts:36-40) and the RPC's `seat_number > p_seat_count` delete (plan.md:70).
  - Blind spot: None significant.
- **Decision**: FIXED (Fix differently — approach B: dialog shows on every shrink `newCount < currentSeatCount`, no per-guest N computed; generic warning copy "Zmniejszenie stołu może spowodować, że przypisani do niego goście zostaną z niego usunięci.", confirm button "Zmień mimo to"). Edited plan.md Overview, Desired End State, Phase 3 §2/§3, Success Criteria, and Progress 3.6.

### F2 — Plan compounds the F5 debt instead of resolving it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff (scope vs. debt); pause to decide
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 §2–§4 (all target WeddingWorkspace.tsx)
- **Detail**: Guests, conflicts, and seating are each extracted components (GuestsTab, ConflictsTab, AssignmentBoard); only the "Stoły" tab lives inline in WeddingWorkspace.tsx (:195-264). Follow-up F5 (OPEN, context/foundation/follow-ups.md) explicitly says to extract that tab into TablesTab.tsx "mirroring GuestsTab/ConflictsTab." This plan adds edit/delete controls, two AlertDialogs, a pluralization helper, `editingTableId`, a create↔edit form toggle, and two reconciliation callbacks — all inline into WeddingWorkspace, enlarging the exact file F5 flags. The lessons rule "Reconcile deferred review follow-ups at plan/implement time" says to pull in follow-ups targeting the touched area; the plan never mentions F5.
- **Fix**: Add a Phase 3 step to extract TablesTab.tsx (moving the existing add-table form + state) and land the new edit/delete/dialog logic there — closing F5 in the slice already rewriting this surface. If deferring is preferred, record that decision + rationale in "What We're NOT Doing" and leave F5 OPEN deliberately.
  - Strength: New complexity lands in a clean, consistent component; F5 closes for free in the one slice that's already here.
  - Tradeoff: Modest extra scope now vs. a larger inline island + a later refactor touching the same code twice.
  - Confidence: HIGH — the extraction target and pattern already exist.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A — pulled TablesTab.tsx extraction into Phase 3 as new step §1, renumbered §2–§5, retargeted edit/delete/dialog steps to TablesTab.tsx, kept reconciliation callbacks in WeddingWorkspace as props; added Success Criteria 3.9 + Release R.2 to flip F5 DONE in follow-ups.md; added F5 reference).

### F3 — RPC snippet never captures the pre-update seat_count

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — silent geometry break if implemented literally
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 SQL snippet (plan.md:64-79)
- **Detail**: The snippet runs `update tables set seat_count = p_seat_count` (line 72) then branches on `if p_seat_count < v_current_count` (line 74) — but `v_current_count` is never declared or assigned in the plan, and the "Critical Implementation Details" sequence omits reading it. An implementer who reads current seat_count after the UPDATE gets `p_seat_count` back, so both branches skip: tables.seat_count changes while seats rows don't — exactly the seat_count/seats divergence §2 warns "breaks the ring geometry."
- **Fix**: Add reading the current seat_count as an explicit first data step (`select seat_count into v_current_count from tables where id = p_table_id;`) BEFORE the UPDATE, alongside the freed-guest capture; show `v_current_count` in the declared vars and in the sequence list.
- **Decision**: FIXED (added the `select ... into v_current_count` read before the UPDATE in the snippet, inserted the read into the Critical Implementation Details sequence, and declared `v_current_count`/`v_freed` in the `declare` block).

### F4 — No step flips F1 to DONE in the central follow-ups register

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 / Release (vs. context/foundation/follow-ups.md F1)
- **Detail**: The plan closes F1's S-04 portion (DB-side 22023 guard for seat_count 0/31); follow-ups.md F1 is "DONE (S-01 API) · OPEN (S-04 DB guard, optional)." The lessons rule "Reconcile deferred review follow-ups" says to flip items to DONE (with commit/slice) as they land. No phase/step updates follow-ups.md.
- **Fix**: Add a step (Phase 1 or Release) to mark F1's S-04 DB-guard portion DONE in context/foundation/follow-ups.md with this slice's commit.
- **Decision**: FIXED (added Release step R.3 to flip F1's S-04 DB-guard portion DONE in follow-ups.md, mirroring R.2 for F5).
