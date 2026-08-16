<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01 Wedding Shell with Tables

- **Plan**: context/changes/wedding-shell-with-tables/plan.md
- **Scope**: Phases 1–2 of 4
- **Date**: 2026-08-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned service-result + error-catalog architecture

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/errors.ts, src/lib/services/result.ts, src/types.ts:48-58
- **Detail**: The plan described services returning DTOs directly (`getWedding(...): Promise<WeddingDto | null>`) and endpoints that "map result to the uniform JSON shape", with `src/lib/api.ts` exposing `json()` + `apiError()`. The implementation instead introduced a full result-object layer not in the plan: `src/lib/errors.ts` (central code→status→message catalog), `src/lib/services/result.ts` (`success`/`failure` helpers), and `ServiceResult<T>`/`ServiceFailure` types. Every service now returns `ServiceResult<T>` and endpoints unwrap via `apiFailure`/`apiErrorFrom`. This is clean, DRY, and centralizes the Polish messages — an improvement — but it is a genuine architectural addition. Because this slice explicitly "establishes the reusable domain patterns that S-02..S-05 will copy" (plan Overview), the pattern S-02+ inherit is now the one in code, not the one in the plan (the source of truth those slices read).
- **Fix**: Document the result-object + error-catalog layer in the plan as an addendum (services return `ServiceResult<T>`; `errors.ts` is the single message/status catalog; endpoints unwrap it) so later slices copy the actual pattern.
  - Strength: Preserves the (better) implemented pattern and re-aligns the plan future slices read as ground truth.
  - Tradeoff: Plan becomes a slightly moving target; a few paragraphs to write.
  - Confidence: HIGH — the addendum pattern is already used in this repo's plans.
  - Blind spot: None significant — the code type-checks and lints.
- **Decision**: FIXED — added "Addendum — Established patterns (as implemented)" section to plan.md

### F2 — Deferred follow-up F1 not flipped after the zod ceiling landed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/follow-ups.md:24
- **Detail**: The `seatCount` ceiling (1–30) that closes follow-up F1 at the API layer landed in `src/pages/api/tables.ts:17-21` (commit 198379e). The `lessons.md` rule "Reconcile deferred review follow-ups at plan/implement time" says to flip register items to DONE with the commit/slice once they land. The central register still shows F1 as "PLANNED (S-01 plan: `zod` 1–30)" — the S-01 API portion is now DONE but untracked (the optional S-04 DB guard legitimately stays OPEN).
- **Fix**: Update `context/foundation/follow-ups.md` F1 row — mark the S-01 API ceiling DONE (commit 198379e), keep the S-04 DB-guard portion OPEN.
- **Decision**: FIXED — follow-ups.md F1 row: S-01 API portion → DONE (198379e), S-04 DB guard stays OPEN.

### F3 — Type/helper names deviate from the plan's contract (intentionally)

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/types.ts:13-36, src/lib/api.ts:5
- **Detail**: The plan's Phase 1 contract named `WeddingDto`/`TableDto`, `RenameWeddingCommand`/`CreateTableCommand`, and `json()`. The code uses `Wedding`/`Table`, `RenameWeddingInput`/`CreateTableInput`, and `apiSuccess()`. This is not a defect — it correctly follows the project's type-naming convention (clean names for domain shapes, `...Input` for request bodies, no `Dto`/`Command`). The plan's contract prose was written before/against the older naming. Flagged only so the plan reader isn't confused; the implementation is the right call.
- **Fix**: Optionally refresh the Phase 1 contract wording in the plan to the actual names (`Wedding`, `CreateTableInput`, `apiSuccess`) — cosmetic, code needs no change.
- **Decision**: FIXED — renamed WeddingDto→Wedding, TableDto→Table, RenameWeddingCommand→RenameWeddingInput, CreateTableCommand→CreateTableInput, json→apiSuccess throughout plan.md (docs only).

### F4 — Unknown DB errors collapse to 500 without server-side logging

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/wedding.service.ts:20,28,41,52; src/lib/services/table.service.ts:15,34
- **Detail**: Every service maps an unknown Supabase/`PostgrestError` to `failure("internal_error")` (generic 500) without logging the underlying error, so production 500s are undebuggable. This is already captured as deferred follow-up **F2** in `context/foundation/follow-ups.md` (target: observability), so it is a known, tracked gap rather than a new omission. Related: `renameWedding` treats an empty update result (line 52) as 500 rather than a guessed 403/404 — a documented, deliberate choice and unreachable in the normal flow (id is server-resolved from the user's own wedding).
- **Fix**: No action this slice — leave F2 tracked in the register; add `console.error(res.error)` at the collapse sites when F2 is scheduled.
- **Decision**: SKIPPED — remains tracked as deferred follow-up F2 (observability).
