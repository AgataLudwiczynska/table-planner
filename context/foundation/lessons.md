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
