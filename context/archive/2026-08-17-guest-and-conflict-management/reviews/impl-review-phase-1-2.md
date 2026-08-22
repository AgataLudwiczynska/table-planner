<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-02 Guest & Conflict Management

- **Plan**: context/changes/guest-and-conflict-management/plan.md
- **Scope**: Phase 1 & 2 of 4
- **Date**: 2026-08-19
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

## Findings

### F1 — Redundant index on `guest_conflicts(guest_a_id)`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (efficiency)
- **Location**: supabase/migrations/20260819172911_guests_and_conflicts.sql:35
- **Detail**: `unique (guest_a_id, guest_b_id)` (line 29) already creates a composite btree whose leading column is `guest_a_id`, so the standalone `create index on guest_conflicts (guest_a_id)` is redundant — the unique index already serves `guest_a_id` lookups and the cascade delete of a guest on that side. Only the `guest_b_id` index is genuinely needed (no index leads with `guest_b_id`). The standalone index adds write amplification and disk for no query benefit. Note: this matches the plan's contract (plan line 89 lists all four indexes), so the redundancy originates in the plan, not a deviation. At target scale (≤150 guests) the cost is negligible.
- **Fix**: Optionally drop the `guest_conflicts(guest_a_id)` index in a follow-up migration (keep `guest_b_id`). Low priority — migrations are one-way and the cost is negligible at this scale.
- **Decision**: SKIPPED

### F2 — `CreateGuestInput` uses required-nullable fields where the plan wrote optional

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/types.ts:63
- **Detail**: The plan's Phase 2 contract specified `CreateGuestInput { firstName; lastName; side?; group? }` (optional keys). The implementation uses `side: GuestSide | null` / `group: GuestGroup | null` (required key, nullable value) and documents the choice in a comment ("Empty side/group is `null`, never omitted"). This is a deliberate, arguably stricter improvement: it forces every caller to pass an explicit `null`, so `createGuest`/`updateGuest` never send `undefined` to Supabase (which would otherwise silently skip the column on update). No behavioral defect — noting it only so the plan text and code are known to differ intentionally.
- **Fix**: None required. Optionally reconcile the plan wording to match the required-nullable shape so future reviews don't re-flag it.
- **Decision**: FIXED — reconciled plan.md line 132 to the required-nullable `CreateGuestInput` shape.
