# Assignment Progress Counter & State Persistence (S-05) — Plan Brief

> Full plan: `context/changes/assignment-progress-and-persistence/plan.md`

## What & Why

Give the operator a fixed "N / M gości przypisanych" progress counter (N =
guests with a seat, M = total guests entered) that updates on every assignment, and confirm
that the whole plan — assignments, conflicts, tables — comes back unchanged
after logout/login. It closes the north-star loop: the operator can see how
close they are to done and trust that their work is never lost between sessions
(PRD US-03, FR-024).

## Starting Point

Everything the counter needs already lives in `WeddingWorkspace.tsx` central
state (`guests`, `assignments`), and every mutation already updates it. State is
loaded server-side in `wedding.astro` on every post-login render, so persistence
is already provided by the F-01/S-03 Postgres schema + RLS. There is no counter
today, and no pure module for it.

## Desired End State

A header counter on all four tabs reads "N / M gości przypisanych", shows "0 / 0"
for an empty wedding, and is visually emphasised at completion (N === M, M > 0).
It counts seated guests regardless of conflicts (150/150 shows even with
violations; the violations list is separate). After logout/login the operator
sees the identical plan.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Counter placement | Workspace header, all tabs | `WeddingWorkspace` is the state source (no prop-drilling) and "stałe miejsce interfejsu" wants constant visibility | Plan |
| Empty state (M = 0) | Always show "0 / 0" | One format, no conditional hiding; truly a fixed slot from the start | Plan |
| Completion | Emphasise when N === M and M > 0 | Delivers the "150 / 150" done-moment US-03 calls out | Plan |
| Progress vs conflicts | Counter independent of validation | PRD: progress must not depend on validation; violations grow on a separate list | PRD US-03 |
| Testing | Unit-test the counter helper; verify persistence manually | Test-plan puts the automated round trip (Risk #6, High×Low) in rollout Phase 3 and names a heavy suite here an anti-pattern | Test-plan §2–§3 |
| "Summary view" (US-03) | No new view — existing board is the summary | `AssignmentBoard` already renders all tables with seats; roadmap S-05 scopes only counter + persistence | Plan |

## Scope

**In scope:** pure `computeProgress` helper + unit test; header counter with
completion emphasis and "0 / 0" empty state; manual logout/login persistence
smoke.

**Out of scope:** any migration/schema/service/API change; a dedicated automated
persistence suite (→ test rollout Phase 3); a new summary view; per-table
counters, percentages, or "seats remaining"; coupling the counter to conflicts.

## Architecture / Approach

Extract `computeProgress(guests, assignments) → { assigned, total, isComplete }`
into `src/lib/assignment-progress.ts`, unit-test it against hand-derived literals
(node-only lane, `adjacency.test.ts` pattern), then render "N / M gości
przypisanych" in the `WeddingWorkspace` header row above the tabs, wired to the
existing `guests`/`assignments` state so it is reactive for free. Persistence is
pre-existing; a manual smoke confirms it.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Progress counter | Pure helper + unit test + always-visible header counter with completion/empty states | Keeping progress independent of conflict validation |
| 2. Persistence verification | Explicit manual logout/login smoke (no code) | Skipping the round-trip check; over-building an automated suite that belongs to test Phase 3 |

**Prerequisites:** S-03 (done). No migration, no local-Supabase requirement for
the build; the manual smoke runs against `npm run dev`/`preview`.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Automated persistence coverage depends on test rollout Phase 3 being executed;
  until then persistence is guarded only by the manual smoke (accepted per
  test-plan's light-treatment classification of Risk #6).
- Assumes `assignments` state stays one-row-per-guest (guaranteed by the S-03
  upsert-by-`guestId` in `WeddingWorkspace.tsx:116`), so `assignments.length` is
  a faithful N.

## Success Criteria (Summary)

- The operator always sees an accurate "N / M gości przypisanych" that updates on
  every assignment and reaches an emphasised "M / M" at completion — even when
  conflicts exist.
- After logout/login the plan is identical: same guests on same seats, same
  conflicts, same tables.
