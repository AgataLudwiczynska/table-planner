<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Wedding-scope Schema + RLS Foundation (F-01)

- **Plan**: context/changes/wedding-scope-schema-and-rls/plan.md
- **Scope**: Phases 1–3 of 3 (all complete)
- **Date**: 2026-08-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — RPC has no upper bound on p_seat_count

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql:122
- **Detail**: `create_table_with_seats` guards `p_seat_count <= 0` but has no upper bound. `generate_series(1, p_seat_count)` will materialize whatever is passed, so an authenticated owner calling the RPC via `/rest/v1/rpc` with e.g. `p_seat_count = 100000000` triggers an unbounded insert (lock/bloat/effective self-DoS). Blast radius is limited to the caller's own wedding (ownership guard holds), but the input boundary on a public PostgREST-exposed function is unvalidated. PRD caps realistic usage at ~20 seats/table.
- **Fix**: Add an upper-bound guard next to the existing positive check, e.g. `if p_seat_count > 50 then raise exception 'seat_count_too_large' using errcode = '22023'; end if;` (pick a ceiling comfortably above the ~20-seat product max).
- **Decision**: DEFERRED → follow-up. Not worth a standalone one-way migration in F-01; queued to `follow-ups/review-fixes.md` to land in S-01 (zod input bound; primary) or optionally S-04's `resize_table` migration (DB-level guard).

### F2 — Migration hardening/perf improvements exceed the plan and aren't captured as the reusable pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql:50,146,55
- **Detail**: The implementation adds two anon-hardening statements not in the plan — `revoke all on weddings, tables, seats from anon` (line 50) and `revoke execute ... from public, anon` (line 146) — plus wraps every policy's `auth.uid()` in a scalar subquery `(select auth.uid())` (the Supabase initPlan perf optimization). All three are genuine improvements: the plan explicitly reasoned that RLS default-deny made anon protection unnecessary, but the implementer correctly noticed default table/function grants still expose the objects via PostgREST/GraphQL introspection, and the `(select auth.uid())` form avoids per-row re-evaluation. The concern is not the code — it's that the plan's Migration Notes bill this migration as the pattern S-02/S-03 will copy, and those three details live only in the SQL, not in the documented pattern. Future slices copying the plan's pattern description would omit them.
- **Fix**: Record the two additions as the canonical RLS pattern so S-02/S-03 inherit them — either an addendum in plan.md's "Migration Notes"/"RLS pattern" section, or a `/10x-lesson` entry ("revoke anon table+execute grants alongside RLS; use `(select auth.uid())` in policies"). Low code cost; the value is propagation.
- **Decision**: ACCEPTED-AS-RULE → appended to `context/foundation/lessons.md` ("RLS migrations: revoke anon grants + use `(select auth.uid())` in policies"). Migration code already correct; no code change needed.
