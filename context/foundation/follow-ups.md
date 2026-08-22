# Deferred Follow-ups

> Central register of review findings intentionally **deferred** rather than fixed when they
> surfaced. One row per item. The full rationale stays in the source `follow-ups/*.md` of the
> change where the finding was born — this file only **indexes and tracks status** (like
> `MEMORY.md` indexes memories).
>
> Consult this file when planning or implementing a slice (see `lessons.md` →
> "Reconcile deferred review follow-ups at plan/implement time"). Pull in any item whose
> **Target** is the slice at hand; flip it to DONE (with the commit/slice) once it lands.

## Status legend

- **OPEN** — not yet addressed.
- **PLANNED** — addressed in a written plan, not yet implemented.
- **DONE** — landed; append the commit/slice, keep briefly, then prune.

## Open / in-flight

| ID | Target | Summary | Status | Source |
| -- | ------ | ------- | ------ | ------ |
| F1 | S-01 (API) · S-04 (optional DB) | Bound `seat_count` upper limit — RPC `create_table_with_seats` has no ceiling; add one in the API `zod` schema, and optionally a defense-in-depth guard inside the resize RPC. | DONE (S-01 API: `zod` 1–30, 198379e) · OPEN (S-04 DB guard, optional) | `context/archive/2026-08-09-wedding-scope-schema-and-rls/follow-ups/review-fixes.md` |
| F2 | future / observability | When a service collapses an unknown Supabase/DB error to a generic 500, log the underlying `PostgrestError` server-side (e.g. `console.error`) so 500s stay debuggable while users still get only the generic message. | OPEN | S-01 error-handling design discussion (`context/changes/wedding-shell-with-tables/`) |
| F3 | future / UI polish | Restyle the sign-in/sign-up screens and the anonymous landing page from the dark cosmic palette to the light wedding theme (`bg-wedding`) introduced in S-01, so the whole app reads as one consistent wedding-appropriate look. | OPEN | S-01 impl review (`context/changes/wedding-shell-with-tables/reviews/impl-review.md`) |
| F4 | future / DX | Evaluate a form-handling library (e.g. React Hook Form + zod resolver) to replace the hand-rolled per-field `useState`/validation now repeated across the rename, add-table, guest add/edit, and conflict-picker forms; would cut boilerplate and let the client reuse the endpoints' `zod` schemas. | OPEN | `context/changes/guest-and-conflict-management/follow-ups/form-library.md` |
| F5 | future / refactor | Extract the "Stoły" tab out of `WeddingWorkspace` into its own `TablesTab.tsx` (mirroring `GuestsTab`/`ConflictsTab`) and move the table-form state (`tableName`/`seatCount`/`fieldErrors`/`addTable`) into it; pure refactor for encapsulation, no behaviour change. | OPEN | `context/changes/guest-and-conflict-management/follow-ups/extract-tables-tab.md` |
| F6 | future / test-runner · S-03 guardrail | Stand up a test runner (Vitest) and cover the adjacency validator with the "validation never stays silent" guardrail (change.md:20). Do the **pure `validateTable` unit test first** — it needs no integration harness (no Supabase/Astro/DOM), so it's cheap the moment a runner lands; heavier component/DnD coverage can follow. Cover the cases enumerated in the plan's Testing Strategy: adjacent flags / non-adjacent doesn't / first↔last wrap-around / n===2 modulo-collapse counted once (both neighbour formulas resolve to the same seat) / n===1 empty / partial occupancy, plus `validateAllTables` cross-table independence. Prime regression target: the Phase 5 SVG ring re-derives seat ordering, so this test guards future ring-layout changes. S-03 ships with manual verification only. | OPEN | S-03 planning (`context/changes/assignment-with-realtime-conflict-validation/plan.md`) |
| F7 | prod / release (S-02) | S-02 (`guests`+`guest_conflicts`) is merged + deployed, but its migration was never pushed to the prod Supabase project — Cloudflare Workers Builds deploys code only, not migrations, so prod schema is behind the deployed code. Fix: in a low-traffic window, `npx supabase migration list` then `npx supabase db push` (linked prod); verify per the RLS runbook. Pre-launch (no real users) so harmless now, but must land before prod gets traffic. S-03's migration is not merged yet — it rides its own merge via `docs/reference/deploy-runbook.md`, not this debt. | OPEN | S-03 implementation (`context/changes/assignment-with-realtime-conflict-validation/`) |

## Done

(none yet)
