---
change_id: assignment-with-realtime-conflict-validation
title: Assign guests to seats with real-time adjacency conflict validation
status: implementing
created: 2026-08-22
updated: 2026-08-23
archived_at: null
---

## Notes

Roadmap slice S-03 (north star) — see `context/foundation/roadmap.md`. Proves the core product hypothesis: real-time adjacency validation only matters if it flags violations instantly on real data.

- **Outcome:** always-visible unassigned-guests panel next to the tables view; assign a guest to a specific seat via drag-and-drop OR click fallback; each table rendered as a graphical ring with seats numbered 1..N; on every assignment change (no "Check" button) the system (a) highlights both seats of an adjacency conflict red + warning icon, (b) adds an entry to the violated-conflicts list. Operator can release a guest back to the panel. Invariant: max 1 guest/seat, max 1 seat/guest — enforced at DB (F-01) and UI. No auto-unassign on conflict — operator decides.
- **Adjacency model:** ring — seat N neighbors N−1 and N+1 modulo seat count. Watch the 2-seat edge case.
- **Prerequisites:** S-01, S-02 (both done).
- **PRD refs:** US-01, FR-013, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022, FR-023.
- **Open impl unknowns (non-blocking):** client vs server validation location (guidance: client for UX immediacy, server as idempotent guardrail — both layers must agree); concrete perf target (PRD Open Question #1 — guidance: incremental re-validation of changed seats + neighbors only).
- **Speed mitigation:** ship validation + highlight on a flat seat list (numbers, no ring) first, then the graphical ring as an iteration within the same slice — both stay in scope.
- **Acceptance guardrail:** "validation never stays silent" (FR-021, zero false negatives) — if an integration test finds a missed adjacency, the slice is not done.

## Planning decisions locked so far (during /10x-plan, before research pause)

- **Move rule:** allow a seated guest to be moved directly onto a different empty seat (frees the old seat). Only swapping two *occupied* seats stays a Non-Goal.
- **Write path:** Direct insert/delete + service-layer membership validation (NOT a SECURITY DEFINER RPC). Model `assignments` as one row per guest (`unique(guest_id)`, `unique(seat_id)`); assign/move = `upsert(onConflict: guest_id)`, unassign = `delete where guest_id`. The service validates seat- and guest-belong-to-wedding before writing, mirroring `conflict.service.ts`; RLS enforces wedding ownership. Rationale: assignment is single-row (unlike the multi-row `create_table_with_seats` RPC), upsert makes move atomic without a transaction, and it reuses the S-02 conflict pattern with less SECURITY DEFINER surface.

## Open questions resolved by /10x-research

> Full findings: `research.md` (2026-08-22).

- **Drag-and-drop tech — RESOLVED:** `@atlaskit/pragmatic-drag-and-drop` (selected in `dnd-review-session.md`, compatibility verified). React 19 non-issue (core adapter has no React peer dep); SSR-safe when bound in `useEffect` via deferred `import()`; ESLint react-compiler tolerates the ref+effect pattern. Click fallback and keyboard a11y stay ours to build.
- **Planning-UI shell / layout — RESOLVED:** add an assignment board as a **new tab inside `WeddingWorkspace.tsx`** (already a single `client:load` island holding tables/guests/conflicts state) — gives instant in-memory re-validation with no extra fetches. SVG ring rendering stays a within-slice iteration per the speed mitigation (flat seat list first, then ring).
