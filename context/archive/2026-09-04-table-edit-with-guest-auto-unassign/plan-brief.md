# Table Edit with Guest Auto-Unassign (S-04) — Plan Brief

> Full plan: `context/changes/table-edit-with-guest-auto-unassign/plan.md`

## What & Why

Let the operator edit a table (rename + change seat count) and delete a table. When a resize drops the seat count below the guests currently assigned to that table, a confirmation dialog warns that N guests will be freed; on confirmation the change is **atomic** — the table resizes, guests on the highest removed seats return to the unassigned panel, and their neighbour-conflict violations disappear. Implements roadmap S-04 / PRD US-02, FR-008, FR-009.

## Starting Point

Tables exist and can be created/listed, guests can be assigned to seats, and neighbour-conflict violations are computed live on the board. But tables are **read-only** in the UI, there is no edit/resize/delete path at any layer (no RPC, no service method, no API verb, no UI control), and no dialog primitive exists.

## Desired End State

From the "Stoły" tab the operator renames, resizes, and deletes tables. Grow / shrink-to-≥-assigned apply instantly; shrink-below-assigned and delete confirm first. After any change the board, the unassigned panel, and the violations list all reflect reality without a reload.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Atomicity boundary | One `SECURITY DEFINER` RPC `update_table` (rename+resize); delete = direct `DELETE` + cascade | RLS blocks direct seat writes, and folding rename in keeps a combined edit atomic; delete needs no RPC | Plan |
| Server destructive guard | Trust the client dialog (no `confirmUnassign`, no 409 preflight) | Consistent with the existing guest-delete flow; server still enforces ownership + zod | Plan |
| Auto-unassign mechanism | DB `ON DELETE CASCADE` on `assignments.seat_id` | Deleting top seats inside the RPC drops their assignments automatically — no app code | Plan |
| Clearing violations | Nothing to clear — violations are client-computed, not stored | `validateAllTables` recomputes from state each render | Plan |
| Confirmation dialog | Install shadcn `alert-dialog` | Sanctioned path (CLAUDE.md); accessible + custom PRD button labels | Plan |
| Edit/delete UI location | "Stoły" tab, inline edit mirroring `GuestsTab` | Consistent with guest UX; keeps the seating board clean | Plan |
| Test scope | Feature-only now; Risk #4 integration tests deferred to test-plan §3 Phase 3 | Clean rollout sequencing; harness is stood up by Phase 2 | Plan |

## Scope

**In scope:** rename, resize (grow + shrink), delete; shrink-warning + delete-confirm dialogs; atomic resize RPC; PATCH/DELETE endpoints; state reconciliation; prod-migration apply.

**Out of scope:** integration/e2e tests (Phase 3 of test rollout); server-side confirm guard; table reordering; cross-table seat moves; real-time/multi-user.

## Architecture / Approach

Client edit form → `PATCH /api/tables` → `updateTable` service → `update_table` RPC (ownership guard → capture freed guests → update table → delete/insert seats; cascade unassigns). Delete → `DELETE /api/tables` → `deleteTable` service → direct `DELETE` (RLS + cascade). Both return the freed guest ids; the client patches `tables` + `assignments` state, and the derived unassigned panel + violations update themselves.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB — RPC + migration | Atomic `update_table` RPC, grants, regenerated types | Capture-freed-guests-before-cascade ordering; RLS/anon grants |
| 2. Backend — service/types/API | `updateTable`/`deleteTable`, input types, error code, PATCH+DELETE | SQLSTATE→code mapping; correct freed-id return shape |
| 3. Frontend — UI + dialogs | Edit/delete controls, confirm dialogs, state reconciliation | Dialog trigger logic; patching both tables + assignments |

**Prerequisites:** S-03 done (assignments + adjacency in place — it is); local Supabase for Phase 1.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Client computes freed-guest count N from local state; assumes optimistic assignment state is accurate (it is kept in sync by existing callbacks).
- Risk #4 (High) rides without automated coverage until test-plan §3 Phase 3 — tracked there, not lost.
- New `SECURITY DEFINER` RPC must replicate the anon/public revoke exactly or it leaks to `anon`.

## Success Criteria (Summary)

- Shrink 10→5 with 7 assigned → confirm → exactly 5 seats, 2 guests unassigned (seats 6 & 7), 0 related violations, no reload.
- Cancel changes nothing; grow / shrink-to-≥-assigned skip the dialog; rename-only touches only the name.
- Delete returns the table's guests to the unassigned panel.
