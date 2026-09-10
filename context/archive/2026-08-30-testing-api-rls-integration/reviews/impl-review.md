<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: API + RLS Integration Tests (test-plan Phase 2)

- **Plan**: context/changes/testing-api-rls-integration/plan.md
- **Scope**: All 3 phases of 3 (full-plan review)
- **Date**: 2026-09-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS (recorded green at implement time; not re-executed this review) |

## Notes on method

- All 16 files named in the plan's "Changes Required" are present in the diff (`462ac1e^..b2d81e2`) and implemented faithfully. `smoke.test.ts` was placed under `test/integration/db/` (plan said `test/integration/`) — an improvement, since the `test:integration:db` lane globs `test/integration/db` and the Phase 1 success criterion runs the smoke test through that lane.
- Test assertions were cross-checked against the real endpoints and error catalog (`src/pages/api/*`, `src/lib/errors.ts`, `src/lib/services/*`): the 404 not-found paths, `invalid_seat_count`/`validation_error` codes, the 201 + `data.id` create shape, and the mass-assignment defense (guests `POST` schema omits `wedding_id`, so an extra body key is stripped and the wedding is resolved server-side) all match what the specs assert.
- Oracle discipline is strictly followed: SQLSTATE codes (`42501`/`23514`/`23505`), row-count / post-state re-reads as the owner, and HTTP status + error `code` — never copied message strings. The PATCH-guests UPDATE cell uses a probe value (`"Jan"`) that differs from the seed (`"Anna"`) and re-reads as A, exactly as the plan's detailed oracle requirement demanded.
- **Success criteria were not re-executed in this review.** `npm run test:integration*` runs a destructive `supabase db reset` in `globalSetup` and requires Docker + a built `npm run preview`. The Progress checkboxes record all automated checks green at implement time (5c24269 / 4bf4be7 / 9f107e2), and the spec contracts were verified statically here. `npm run lint` and `npm run test:run` were not run but are cheap/non-destructive — can be run on request.

## Findings

### F1 — Changes beyond the plan's "Changes Required" list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: test/integration/seed.ts, test/integration/supabase-status.ts, vitest.config.ts, context/foundation/lessons.md
- **Detail**: Four changes appear in the diff that the plan's Changes Required did not list:
  (1) `test/integration/seed.ts` and (2) `test/integration/supabase-status.ts` — the plan folded seeding and `supabase status -o json` parsing + the local-host guard into `global-setup.ts`; they were extracted into their own modules.
  (3) `vitest.config.ts` gained `include: ["src/**/*.test.ts"]` — the plan said the fast unit lane stays "untouched."
  (4) `context/foundation/lessons.md` gained a new "Small, single-purpose files" lesson.
  All are benign and arguably improvements: the extractions follow the very lesson that was added, and the `vitest.config.ts` `include` is *necessary* to keep `test/integration/**` out of the default unit glob (without it the fast unit run would try to load the Supabase-dependent integration specs — so the change preserves the plan's intent even though it edits a file the plan called untouched).
- **Fix**: Record these four as an addendum in `plan.md` (or the epilogue) so the plan stays the source of truth for future reviews — no code change.
- **Decision**: FIXED (Fix differently — added an "Implementation Addendum" to plan.md that categorizes the four deviations into harness-structure changes vs. a process artifact, the lessons.md entry)

### F2 — No-PII error-body guarantee is narrow and the cookbook overstates the invariant

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.3; src/pages/api/guests.ts:49, conflicts.ts:35, assignments.ts:35
- **Detail**: §6.3 states error bodies "carry only the static catalog `{ code, message }`." In reality the `validation_error` branch returns `parsed.error.issues[0].message` (the zod issue message), not the catalog's static message. The no-PII property holds today only because those zod messages are hand-written static Polish strings that don't interpolate the received value, and `api-error-body.test.ts` exercises just two endpoints/fields. A future endpoint whose zod message embedded the received input would leak it, and the suite would not catch the regression.
- **Fix**: Soften the §6.3 wording to match reality (the `validation_error` message is the zod issue message, which must stay input-free) — or add a convention note that zod messages never interpolate user input. No code change needed now.
- **Decision**: FIXED (Fix now — §6.3 "No data echo" reworded to name the zod-message branch and require zod messages stay input-free)
