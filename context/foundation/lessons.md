# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Keep commit descriptions short — summary only, no details

- **Context**: creating git commits (at the end of work on a task, via CLI or `git commit -m`)
- **Problem**: verbose commit descriptions that list every detail are hard to scan in `git log` and duplicate what the diff already shows — the user wants a short summary, not a chronicle of the work
- **Rule**: Write the commit description as a short summary of the work (2–3 lines max beyond the subject). Do not spell out change details or rationale — that information lives in the diff and in related docs/issues, which the commit should reference with a brief pointer at most.
- **Applies to**: implement, impl-review

## RLS migrations: revoke anon grants + use `(select auth.uid())` in policies

- **Context**: every Supabase migration that enables RLS on new tables (F-01 `weddings`/`tables`/`seats`; pattern copied by S-02/S-03)
- **Problem**: RLS default-deny blocks rows, but Supabase's default grants still expose the tables in the anon schema (PostgREST/GraphQL introspection), and the default EXECUTE + PUBLIC grants let anon reach `SECURITY DEFINER` RPCs. RLS policies alone do not close this. Separately, a bare `auth.uid()` in a policy is re-evaluated per row. In F-01 these decisions lived only in the migration SQL, not in the plan's documented pattern — risk that S-02/S-03 copying the plan's prose omit them.
- **Rule**: In every RLS migration: (1) `revoke all on <tables> from anon`, and for `SECURITY DEFINER` functions `revoke execute ... from public, anon` before `grant ... to authenticated`; (2) wrap `auth.uid()` in policies as `(select auth.uid())` (initPlan optimization — evaluated once instead of per row).
- **Applies to**: plan, implement, impl-review

## Reconcile deferred review follow-ups at plan/implement time

- **Context**: planning or implementing a slice. Reviews (`/10x-impl-review`, `/10x-plan-review`) sometimes defer a finding instead of fixing it in place.
- **Problem**: a deferred finding gets buried in that change's `follow-ups/review-fixes.md` under `context/archive/…`, so nobody sees it when the slice it targets comes up — it survives only in human memory (F-01's unbounded `seat_count` had to be recalled by hand during S-01 planning).
- **Rule**: keep a central register at `context/foundation/follow-ups.md` (index + status only; full rationale stays in the per-change `follow-ups/*.md`). When deferring a finding, add a row there tagged with its **target slice**. When planning/implementing a slice, read `follow-ups.md` and pull in every item targeting it; flip items to DONE (with commit/slice) as they land.
- **Applies to**: plan, implement, impl-review, plan-review

## Keep code comments short — max 2 lines, explain "why" not "what"

- **Context**: any code comment anywhere in the codebase (services, endpoints, components, Astro pages — all languages)
- **Problem**: verbose multi-line comment blocks bloat files, drift out of sync with the code, and narrate what the code already says, making files harder to scan
- **Rule**: Keep every code comment short and to the point — max 2 lines. Explain the "why", not a narration of what the code does; if a comment only restates the code, drop it.
- **Applies to**: implement, impl-review
