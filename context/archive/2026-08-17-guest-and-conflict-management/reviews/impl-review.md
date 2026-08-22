<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-02 Guest & Conflict Management

- **Plan**: context/changes/guest-and-conflict-management/plan.md
- **Scope**: Full plan — Phases 1–4 of 4
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated success criteria re-run at review time: `npx astro check` → 0 errors / 0 warnings; `npm run lint` → clean; `grep -c "guests\|guest_conflicts" src/db/database.types.ts` → 8 (> 0). Manual criteria are marked complete in Progress with commit shas and rely on the implementer's attestation (cross-account RLS, preview HTTP checks — not re-verifiable from a static diff, consistent with this repo's manual-verification approach).

## Findings

### F1 — Canonical-order compare relies on lowercase-canonical UUID form

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/conflict.service.ts:31 (vs migration line 28)
- **Detail**: The service orders the pair with a JavaScript string compare (`guestAId < guestBId`) while the DB enforces `check (guest_a_id < guest_b_id)` using Postgres `uuid` comparison. These agree only because Supabase-generated UUIDs are lowercase canonical hex — the two orderings are byte-identical for that input, and ids here always originate from the DB. If the orderings ever diverged (e.g. an uppercased id entered the path), the insert would raise check-violation SQLSTATE 23514, which is not mapped and would fall through to `internal_error` (500) rather than a clean 4xx. Current correctness is intact; this is a latent-assumption note, not a live bug.
- **Fix**: Optionally map SQLSTATE `23514` on the conflict insert to a 4xx (e.g. `invalid_guest`) so a future ordering divergence degrades gracefully instead of surfacing a raw 500. Low priority — no current input can trigger it.
- **Decision**: SKIPPED

### F2 — Conflict duplicate pre-check is redundant with the 23505 backstop

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/lib/services/conflict.service.ts:38-46
- **Detail**: `createConflict` runs an explicit SELECT for an existing `(lo, hi)` pair before inserting, then also catches the unique-violation 23505 on insert (line 54). The pre-check adds one round-trip and a benign TOCTOU window (the insert still catches a racing duplicate). **This is exactly what the plan specified** ("Critical Implementation Details": pre-check returns a friendly `conflict_exists`, the unique constraint is the backstop) — so it is plan-adherent, not drift. The agent flagged it as the most worthwhile *optional* cleanup. Given a single operator at ≤150 guests, the extra round-trip is negligible.
- **Fix**: Keep as designed (recommended — matches the plan's intent and gives the cleaner error without depending on the constraint). Only drop the pre-check if the extra round-trip ever matters, relying on the 23505 catch alone.
- **Decision**: SKIPPED (kept as designed — plan-adherent)

### F3 — Guests endpoint accepts omitted side/group (`.nullish()`) vs the explicit-null contract

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/guests.ts:21-22, 59-60, 89-90
- **Detail**: The plan's `CreateGuestInput` contract note said callers pass explicit `null` (never `undefined`) so Supabase never silently skips a column on update. The zod schema uses `.nullish()` (accepts omitted / `undefined` / `null`), then normalizes with `?? null` before the service call, so the value reaching Supabase is always explicit `null`. Functionally correct and safe — the endpoint is simply more lenient at its edge than the contract prose implied. Cosmetic contract-vs-implementation gap.
- **Fix**: Leave as-is (the `?? null` normalization already satisfies the contract's actual requirement). Alternatively tighten the schema to `.nullable()` if you want the API surface to reject omitted keys.
- **Decision**: SKIPPED (left as-is — `?? null` satisfies the contract)

### F4 — Unplanned "≥2 guests" guard in ConflictsTab

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/wedding/ConflictsTab.tsx:92-95
- **Detail**: When fewer than two guests exist, the tab hides the pair form and shows "Dodaj co najmniej dwoje gości…". This isn't in the plan's Phase 4 contract but is a sensible, benign UX guard entirely within the Konflikty feature's scope — it crosses none of the "What We're NOT Doing" boundaries. Noted for the record.
- **Fix**: Keep — benign in-scope UX polish.
- **Decision**: SKIPPED (kept — benign in-scope UX polish)
