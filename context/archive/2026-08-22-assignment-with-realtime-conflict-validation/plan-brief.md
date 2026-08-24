# Seat Assignment with Real-Time Adjacency Conflict Validation (S-03) — Plan Brief

> Full plan: `context/changes/assignment-with-realtime-conflict-validation/plan.md`
> Research: `context/changes/assignment-with-realtime-conflict-validation/research.md`
> API reference: `context/changes/assignment-with-realtime-conflict-validation/pragmatic-drag-and-drop-api-reference.md`

## What & Why

S-03 is the product's north-star slice: assign guests to specific seats (drag-and-drop + click fallback) and validate adjacency conflicts in real time. The instant an assignment changes — no "Check" button — both seats of any violated "not next to each other" conflict light up red and the pair is listed. It proves the core hypothesis: real-time validation only matters if it flags violations instantly on real data.

## Starting Point

Weddings, tables, seats, guests, and binary conflict pairs already exist (F-01, S-01, S-02). But seats have never reached the client — `wedding.astro` sends tables as `{id, name, seatCount}` only, there is no `assignments` table, no seat/assignment service, and no drag-and-drop or validation code anywhere. `WeddingWorkspace.tsx` is a single `client:load` island already holding tables/guests/conflicts in state.

## Desired End State

A new "Rozsadzanie" tab: an unassigned-guests panel beside each table drawn as a numbered ring of seats. The operator drags (or clicks) a guest onto a seat; occupied seats reject drops; a seated guest can move to another empty seat or be released via × / dropping on the panel. Every change re-validates all tables and highlights both seats of each adjacency violation red, listing the violated pairs. Everything persists across reload.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Persistence shape | Separate `assignments` table, `unique(guest_id)`+`unique(seat_id)`, upsert-on-move, no RPC | Single-row writes make "move" atomic without a definer RPC; reuses S-02 membership pattern | Frame (change.md) |
| DnD library | `@atlaskit/pragmatic-drag-and-drop` (core element adapter) | React-19 compatible, SSR-safe, ESLint-tolerant; selected + verified upstream | Research |
| Mounting | New tab inside `WeddingWorkspace` (not a sibling island) | Shares in-memory tables/guests/conflicts → instant re-validation, zero extra fetches | Research |
| Seat data delivery | Seats nested under `Table` (`Table.seats`); assignments a separate array/state | Static seats belong to their table; dynamic assignments stay separate per the refresh pattern | Plan |
| Ring vs flat | Flat numbered seat list first (phases 3–4), graphical SVG ring last (phase 5) | De-risks DnD + validation before geometry; matches the change.md speed mitigation | Plan |
| Validation recompute | Full re-scan of all tables on every change, built on pure `validateTable` | Simplest and hardest to leave silent (zero-false-negative guardrail); trivial at wedding scale | Plan |
| Click fallback | Select guest → click seat (toggle/Esc to clear) | One model shared with DnD, calls the same assign function; natural on touch | Plan |
| Unassign gesture | × on occupied seat + panel as drop target | Accessible without a mouse; one `unassign` call for both paths | Plan |
| Testing | Manual verification now; automate via follow-up F6 when a runner exists | No test runner in repo yet; guardrail integration test tracked so it isn't lost | Plan |
| DnD import / a11y pkg | Deferred dynamic `import()` in `useEffect`; skip optional a11y companion | Guarantees SSR safety + bundle-split; × + keyboard cover the non-pointer baseline | Plan / Research |

## Scope

**In scope:** `assignments` table + RLS; seat + assignment reads; assign/move/unassign service + `/api/assignments`; seating tab with unassigned panel; DnD + click assignment; real-time adjacency validation + red highlight + violated-conflicts list; graphical SVG ring.

**Out of scope:** swap of two occupied seats; auto-unassign on conflict; SECURITY DEFINER RPC; automated test suite (F6); pragmatic-dnd a11y companion package; performance-target work; S-04 table edit / S-05 progress counter.

## Architecture / Approach

DB → service → API → UI. New `assignments` table (owner-only RLS, unique constraints as the invariant guard). `listTables` embeds seats; `listAssignments` feeds a separate array into the existing SSR `Promise.all`. `assignment.service.ts` validates guest+seat membership then upserts/deletes. In the browser, `WeddingWorkspace` gains a seating tab whose `AssignmentBoard` hosts one central DnD monitor + a click-selection state machine, both calling the same `assignGuestToSeat`; assignment state updates functionally from returned rows. A pure `validateAllTables` derives violations over live in-memory state on every render — no round-trip for the UI reaction.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Persistence | `assignments` table + RLS, types, error codes, route | RLS policy correctness (data-leak guardrail) |
| 2. Backend | Nested-seat read, assignment service + endpoint, SSR wiring | Membership validation + `23505` → `seat_occupied` mapping |
| 3. Flat board + interactions | Seating tab, DnD + click assign/move, × / panel unassign | First `useEffect`/DnD; SSR safety on workerd |
| 4. Real-time validation | Pure `validateTable`, red highlight, violated list | 2-seat modulo collapse; zero false negatives |
| 5. Graphical ring | SVG ring replacing the flat list | Preserving all behavior through the layout change |

**Prerequisites:** S-01, S-02 (both done); local Supabase for the migration; `docs/reference/rls-verification-protocol.md`.
**Estimated effort:** ~4–5 sessions across 5 phases.

## Open Risks & Assumptions

- **Guardrail without automation:** "validation never stays silent" is verified manually this slice; follow-up F6 must add the integration test once a runner exists, or a regression could slip in a later slice.
- **First DnD/effect in the codebase:** SSR safety hinges on the deferred-import recipe; verify in `npm run preview` (workerd), not just `npm run dev`.
- **PostgREST seat embed** assumes the `seats_select` RLS policy scopes the nested select correctly — confirm in Phase 2.

## Success Criteria (Summary)

- Assign/move/unassign (drag and click) work and persist across a hard reload; the max-1-guest/seat invariant cannot be broken via the UI.
- Two conflicting guests on adjacent seats — including on a 2-seat table — always flag both seats red and appear in the list; non-adjacent placement stays clear.
- Each table renders as a numbered ring, with all interactions and validation intact.
