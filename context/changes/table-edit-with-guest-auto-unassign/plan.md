# Table Edit with Guest Auto-Unassign (S-04) — Implementation Plan

## Overview

Let the operator **edit a table** (rename + change seat count) and **delete a table**. When the seat count is reduced, the client shows a confirmation dialog warning that assigned guests may be removed ("Zmniejszenie stołu może spowodować, że przypisani do niego goście zostaną z niego usunięci." with "Anuluj" / "Zmień mimo to") — shown on every shrink, regardless of whether a removed seat is currently occupied. On confirmation the resize is **atomic**: the table changes size, guests on the highest-numbered removed seats return to the unassigned panel, and the neighbour-conflict violations tied to them disappear. Deleting a table (with confirmation) unassigns all of its guests. Implements roadmap slice S-04 (PRD US-02, FR-008, FR-009).

## Current State Analysis

- **Seats are a separate table.** `seats(table_id, seat_number)` with `UNIQUE (table_id, seat_number)`; `tables` also carries a denormalized `seat_count`. A guest's position lives in `assignments.seat_id → seats.id`. (`supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql:18-32`, `20260822194500_assignments_and_rls.sql:8-16`.)
- **Auto-unassign is a DB cascade, not application code.** `assignments.seat_id` is `ON DELETE CASCADE`; deleting a seat row removes its assignment automatically. Deleting a table cascades tables→seats→assignments. (`20260822194500_...:12`, `20260812201915_...:29`.)
- **Conflict violations are computed client-side, never stored.** `validateAllTables(tables, assignments, conflicts)` is re-derived every render (`src/lib/adjacency.ts:43-47`, called at `src/components/wedding/AssignmentBoard.tsx:37`). Nothing to "clear" in the DB — once assignments vanish, violations recompute away.
- **RLS blocks direct seat writes.** `seats` has a SELECT-only policy; `tables` has no INSERT policy. So adding/removing seat rows from the client is denied — seat mutations must go through a `SECURITY DEFINER` RPC. `tables` UPDATE/DELETE and `assignments` full CRUD are allowed for the owner. (`20260812201915_...:70-104`.)
- **Only one RPC exists:** `create_table_with_seats(p_wedding_id, p_name, p_seat_count) returns uuid`, `SECURITY DEFINER SET search_path = public`, ownership guard first, `revoke execute … from public, anon; grant … to authenticated` (`20260812201915_...:111-147`). No update/resize/delete RPC, no transactional unassign.
- **Service/API/types gaps.** `table.service.ts` has only `listTables`/`createTable` (`src/lib/services/table.service.ts:21,33`). `src/pages/api/tables.ts` has only `POST` (`:24`). `src/types.ts` has `CreateTableInput` but no update/delete input types (`:81`). `src/lib/errors.ts` has `forbidden`/`invalid_seat_count` but no `table_not_found` (`:2-22`).
- **UI: tables are read-only today.** `WeddingWorkspace.tsx` is one client island with 4 tabs; the "Stoły" tab lists tables as read-only `<li>` rows (`src/components/wedding/WeddingWorkspace.tsx:249-262`) with no edit/delete controls. The add-table form lives at `:196-242`. The closest edit precedent is the inline shared create/edit form in `GuestsTab.tsx:66-105` (`method: isEdit ? "PATCH" : "POST"`).
- **No dialog primitive.** Only four files in `src/components/ui/` (`button.tsx`, `FormField.tsx`, `ServerError.tsx`, `LibBadge.astro`); the sole confirm flow is native `window.confirm` (`GuestsTab.tsx:109-112`). `@radix-ui/react-alert-dialog` is not installed; only `@radix-ui/react-slot` is.
- **State sync is optimistic local patching, no refetch.** Each mutation returns the updated row and a callback patches `useState` arrays in `WeddingWorkspace` (`:119-143`). The unassigned panel and violations are derived (`AssignmentBoard.tsx:34,37`), so removing assignments from state makes guests reappear and violations drop automatically.

## Desired End State

From the "Stoły" tab the operator can rename a table, change its seat count, and delete it. Growing seats or a rename-only edit applies immediately. Any shrink pops a confirmation dialog warning that assigned guests may be freed; confirming performs the change atomically. Deleting a table confirms first (warning about freed guests), then removes it. In every case the "Rozsadzanie" board reflects the new seats, freed guests appear in "Nieprzypisani goście", and stale violations vanish — without a page reload. Verify via the roadmap acceptance test: shrink a 10-seat table with 7 assigned down to 5, confirm, and the wedding state is exactly 5 seats, 2 guests unassigned (from seats 6 & 7), 0 related violations.

### Key Discoveries:

- Deleting the top seat rows inside an RPC is enough to auto-unassign — the cascade drops the assignments (`20260822194500_...:12`).
- Violations need no DB work; they are pure client computation (`src/lib/adjacency.ts`).
- The RPC pattern to copy verbatim is `create_table_with_seats` (`20260812201915_...:111-147`), including the ownership-guard-first ordering and the `revoke … from public, anon; grant … to authenticated` grants.
- `createTable` already re-reads the table with the seat embed after the RPC (`table.service.ts:49-52`) — the update path mirrors this to return a full `Table`.

## What We're NOT Doing

- **No integration/e2e tests in this slice.** Risk #4 (atomic resize/auto-unassign) integration coverage is owned by test-plan §3 **Phase 3** ("Assignment invariant + resize atomicity", status `not started`). This slice ships the feature + manual verification only; the DB-backed atomicity assertions land in that dedicated rollout phase. (Decision recorded during planning.)
- No server-side confirmation guard (no `confirmUnassign` flag, no 409 preflight) — the client dialog is the confirmation, consistent with the existing guest-delete flow.
- No table reordering, no per-seat drag to a different table, no bulk edit.
- No real-time/multi-user concerns — solo MVP, single owner per wedding.
- No changes to adjacency/violation logic (Lesson 1 / test-plan §3 Phase 1 owns that).

## Implementation Approach

A single `SECURITY DEFINER` RPC `update_table(p_table_id, p_name, p_seat_count)` performs rename **and** resize atomically in one transaction (chosen over splitting rename into a direct UPDATE, which would make a combined name+seats edit non-atomic). Delete stays a direct `DELETE tables` — RLS already permits it and the cascade is already atomic, so wrapping it in an RPC would add `SECURITY DEFINER` surface for no gain. The client trusts its own dialog; the server enforces ownership (RPC guard + RLS) and validation (zod) but performs any valid, owned request immediately. State is reconciled by returning, from both mutations, the freed guest ids so the client drops the matching assignments and lets the derived panel + violations update themselves.

## Critical Implementation Details

- **Ordering inside the resize RPC (load-bearing):** capture the freed guest ids **before** deleting seats, because the seat delete cascades the assignments away — after the delete the guest→seat link is gone. Sequence: ownership guard → validate `seat_count` → read current `seat_count` into `v_current_count` → capture freed guest ids → update `tables` → delete surplus seats (shrink) or insert new seats (grow). This is the one non-obvious ordering in the plan; contract snippet in Phase 1.
- **seat_count / seats must move together.** The denormalized `tables.seat_count` and the actual `seats` rows must stay consistent or the ring geometry in `adjacency.ts` breaks. The RPC updates both in one transaction; never update `seat_count` without the matching seat-row change.
- **Contiguity invariant.** Only ever delete the highest `seat_number` rows (`> p_seat_count`), preserving the 1..N contiguity that `create_table_with_seats` established via `generate_series`. Grow appends `generate_series(current_max+1, new_count)`.

## Phase 1: DB — `update_table` RPC + migration

### Overview

Add a new migration defining the atomic rename+resize RPC, wired with the same RLS-hardening grants as `create_table_with_seats`, and regenerate the DB types.

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/<UTC timestamp>_table_update_rpc.sql`

**Intent**: Define `public.update_table(p_table_id uuid, p_name text, p_seat_count int)` as `SECURITY DEFINER SET search_path = public`. Atomically: verify ownership (raise `not_owner` / `42501` if the table's wedding isn't owned by `auth.uid()`), validate `p_seat_count` in 1–30 (raise `seat_count_out_of_range` / `22023` otherwise — closes follow-up **F1** with a DB-side upper bound), capture the guest ids about to be freed, update the table's name + seat_count, then delete surplus top seats (shrink) or append new seats (grow). Return the freed guest ids so the API can tell the client which assignments dropped.

**Contract**: `update_table(p_table_id uuid, p_name text, p_seat_count int) returns uuid[]` (freed guest ids; empty array for rename-only / grow). Grants mirror the existing RPC exactly: `revoke execute on function public.update_table(uuid, text, int) from public, anon; grant execute … to authenticated`. Ownership guard uses the `weddings … where id = (select wedding_id from tables where id = p_table_id) and user_id = auth.uid()` chain. Declare `v_current_count int` and `v_freed uuid[]` in the RPC's `declare` block. The read-current-count-then-capture-before-delete ordering is the non-obvious part:

```sql
-- read the current seat_count BEFORE the update (both branches below compare against it)
select seat_count into v_current_count from tables where id = p_table_id;

-- capture freed guests BEFORE deleting seats (the delete cascades assignments away)
select coalesce(array_agg(a.guest_id), '{}')
  into v_freed
  from assignments a
  join seats s on s.id = a.seat_id
 where s.table_id = p_table_id and s.seat_number > p_seat_count;

update tables set name = p_name, seat_count = p_seat_count where id = p_table_id;

if p_seat_count < v_current_count then
  delete from seats where table_id = p_table_id and seat_number > p_seat_count; -- cascade drops assignments
elsif p_seat_count > v_current_count then
  insert into seats (table_id, seat_number)
    select p_table_id, generate_series(v_current_count + 1, p_seat_count);
end if;
```

#### 2. Regenerate DB types

**File**: `src/db/database.types.ts`

**Intent**: Run `npm run db:types` after applying the migration locally so `update_table` appears under `Functions`; commit the generated file alongside the migration. Do not hand-edit.

**Contract**: `Database["public"]["Functions"]["update_table"]` present with `Args: { p_name; p_seat_count; p_table_id }`, `Returns: string[]`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset` (or `db push`)
- Types regenerate without diff surprises: `npm run db:types` then `git diff --stat src/db/database.types.ts`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- In the Supabase SQL editor / psql, calling `update_table` as the owner shrinks/grows seats and returns the freed guest ids; as a non-owner it raises `42501`; `seat_count` of 0 or 31 raises `22023`.
- `revoke`/`grant` verified: `anon` cannot execute the RPC.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Backend — service, types, API endpoints

### Overview

Add `updateTable` (via the RPC) and `deleteTable` (direct DELETE + cascade) to the service, the request-body input types, the new error code, and `PATCH` + `DELETE` handlers on `api/tables.ts` following the established endpoint skeleton.

### Changes Required:

#### 1. Service functions

**File**: `src/lib/services/table.service.ts`

**Intent**: Add `updateTable` — call `supabase.rpc("update_table", …)`, map SQLSTATE `42501`→`forbidden`, `22023`→`invalid_seat_count`, else `internal_error` (mirroring `createTable:44-48`); on success re-read the table with `TABLE_COLUMNS` and return `{ table, unassignedGuestIds }` (freed ids from the RPC result). Add `deleteTable` — first collect the guest ids assigned to the table's seats, then `delete from tables where id = …` (RLS scopes to owner; cascade removes seats+assignments); return `{ tableId, unassignedGuestIds }`. `table_not_found` when the target row is absent.

**Contract**: `updateTable(supabase, tableId, name, seatCount): Promise<ServiceResult<{ table: Table; unassignedGuestIds: string[] }>>`; `deleteTable(supabase, tableId): Promise<ServiceResult<{ tableId: string; unassignedGuestIds: string[] }>>`. Reuse `toTable` / `TABLE_COLUMNS`.

#### 2. Input types + error code

**File**: `src/types.ts`, `src/lib/errors.ts`

**Intent**: Add `UpdateTableInput { tableId; name; seatCount }` and `DeleteTableInput { tableId }` following the `...Input` convention (`types.ts:75-107`). Add `table_not_found: { status: 404, message: "Nie znaleziono stołu." }` to `API_ERRORS`.

**Contract**: New interfaces exported from `src/types.ts`; new key in `API_ERRORS` (`ApiErrorCode` picks it up automatically).

#### 3. API handlers

**File**: `src/pages/api/tables.ts`

**Intent**: Add `PATCH` and `DELETE` following the `POST` skeleton verbatim (`tables.ts:24-54`): `prerender=false`, `createClient` null→503, `user` from locals→401, JSON parse guard, zod `safeParse` with the `seatCount`→`invalid_seat_count` path mapping, `getWedding` resolution. `PATCH` validates `{ tableId: z.uuid, name, seatCount }` (reuse the create schema's name/seatCount rules), calls `updateTable`, returns `apiSuccess({ table, unassignedGuestIds }, 200)`. `DELETE` validates `{ tableId: z.uuid }`, calls `deleteTable`, returns `apiSuccess({ tableId, unassignedGuestIds }, 200)`.

**Contract**: `PATCH /api/tables` body `UpdateTableInput` → `{ data: { table: Table; unassignedGuestIds: string[] } }`; `DELETE /api/tables` body `DeleteTableInput` → `{ data: { tableId: string; unassignedGuestIds: string[] } }`. Ownership is enforced server-side (RPC guard for PATCH; RLS for DELETE) — the client-supplied `tableId` is never trusted beyond validation.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- `curl`/REST: `PATCH /api/tables` renames + resizes and returns the updated table with freed ids; shrinking returns the correct `unassignedGuestIds`; `DELETE /api/tables` removes the table and returns freed ids.
- Malformed body (missing `tableId`, out-of-range `seatCount`, non-uuid) returns a clean 4xx with no partial write (spot-check; the contract test is Phase 3 of the test rollout, Risk #5).
- Another account's `tableId` returns 403/404, never mutates.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Frontend — edit/delete UI + confirmation dialogs

### Overview

First extract the "Stoły" tab into its own `TablesTab.tsx` — mirroring `GuestsTab`/`ConflictsTab` and moving the add-table form + its state — which closes follow-up **F5**. Then, inside that new component, add a reusable alert-dialog primitive, edit/delete controls mirroring the guest inline-edit pattern, the shrink-warning and delete-confirm dialogs with Polish copy; the state callbacks that patch both `tables` and `assignments` stay in `WeddingWorkspace` and are passed to `TablesTab` as props.

### Changes Required:

#### 1. Extract the "Stoły" tab into `TablesTab.tsx`

**File**: `src/components/wedding/TablesTab.tsx` (new), `src/components/wedding/WeddingWorkspace.tsx`

**Intent**: Move the "Stoły" tab out of `WeddingWorkspace` (`:195-264`) into a new `TablesTab.tsx`, mirroring `GuestsTab`/`ConflictsTab`: relocate the add-table form and its state (`tableName`/`seatCount`/`fieldErrors`/`addTable`) into the component; `WeddingWorkspace` keeps the shared `tables`/`assignments` `useState` and passes `tables`, plus `onTableCreated`/`onTableUpdated`/`onTableDeleted` callbacks, down as props (same shape as `GuestsTab`'s props). Pure move first — no behaviour change — so the new edit/delete/dialog logic in steps 3–4 lands in a clean component. Closes follow-up **F5**.

**Contract**: New `TablesTab` component consuming `{ tables, assignments, onTableCreated, onTableUpdated, onTableDeleted }`; `WeddingWorkspace`'s "Stoły" `TabsContent` renders `<TablesTab … />`. No change to the add-table behaviour or the create RPC path.

#### 2. Alert-dialog primitive

**File**: `src/components/ui/alert-dialog.tsx` (+ `package.json` dep)

**Intent**: Install the shadcn alert-dialog (`npx shadcn@latest add alert-dialog`), which adds `@radix-ui/react-alert-dialog`. Gives an accessible dialog (focus-trap, ESC, aria) with freely-labelled action/cancel buttons for the exact PRD copy.

**Contract**: New `AlertDialog*` primitives in `src/components/ui/`; one new Radix dependency in `package.json`.

#### 3. Table edit/delete controls (in `TablesTab.tsx`)

**File**: `src/components/wedding/TablesTab.tsx`

**Intent**: In the extracted `TablesTab`, add "Edytuj" / "Usuń" controls to each table row, mirroring `GuestsTab`'s shared create/edit form toggled by an `editingTableId` (`GuestsTab.tsx:66-105`). Edit reuses the existing add-table form fields (name ≤ 50, seats 1–30) and submits `PATCH /api/tables` when editing. On submit, if the new seat count is below the table's current seat count (any shrink), open the shrink-warning dialog before sending; otherwise (grow or rename-only) send immediately. Delete opens the delete-confirm dialog (warn when the table has assigned guests). Use `useApiMutation` for both calls.

**Contract**: New local state `editingTableId`; the "Stoły" form's `method`/endpoint switches create↔edit. The shrink-warning dialog uses a generic warning (no per-guest count computed) and triggers purely on `newCount < currentSeatCount`.

#### 4. Confirmation dialogs (Polish copy)

**File**: `src/components/wedding/TablesTab.tsx` (or a small `TableConfirmDialogs` helper)

**Intent**: Shrink-warning dialog: title/body "Zmniejszenie stołu może spowodować, że przypisani do niego goście zostaną z niego usunięci.", buttons "Anuluj" (cancel — no change) / "Zmień mimo to" (confirm — send PATCH). Delete-confirm dialog: warn "Usunięcie stołu zwolni N przypisanych gości." with "Anuluj" / "Usuń stół". Add a guest pluralization helper ("gościa/gości") for the delete dialog alongside the existing `seatLabel` (`WeddingWorkspace.tsx:43-45`).

**Contract**: Two `AlertDialog` instances driven by pending-action state; copy in Polish per repo convention.

#### 5. State reconciliation callbacks

**File**: `src/components/wedding/WeddingWorkspace.tsx`

**Intent**: In `WeddingWorkspace` (which retains the `tables`/`assignments` state), add `onTableUpdated(table, unassignedGuestIds)` — replace the table in `tables` state (new seats) and drop assignments whose `guestId ∈ unassignedGuestIds`. Add `onTableDeleted(tableId, unassignedGuestIds)` — remove the table and drop those assignments. Both are passed to `TablesTab` as props (mirroring `onAssigned`/`onUnassigned`). Freed guests reappear in "Nieprzypisani goście" and stale violations vanish automatically (both derived in `AssignmentBoard.tsx:34,37`).

**Contract**: Two new callbacks patching the `tables` and `assignments` `useState` arrays, following the existing `onAssigned`/`onUnassigned` pattern (`:138-143`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (React Compiler rule included): `npm run lint`
- Existing unit suite still green: `npm run test:run`

#### Manual Verification:

- **Roadmap acceptance test**: table with 10 seats, 7 assigned (seats 1–7) → edit to 5 → shrink-warning dialog appears → "Zmień mimo to" → board shows 5 seats, guests from seats 6 & 7 in "Nieprzypisani goście", related violations gone; DB state confirms exactly 5 seats, 2 unassigned, 0 related violations.
- "Anuluj" leaves the table unchanged (still 10 seats, everyone seated).
- Every shrink shows the warning dialog even when no guest is freed (e.g. 10→8 with 7 assigned, or shrinking a table whose removed seats are empty).
- Growing seats adds empty seats, no dialog, no unassign.
- Rename-only edit changes the name, touches nothing else.
- Delete a table with assigned guests → confirm → table gone, its guests back in the unassigned panel.
- **F5 closed**: the "Stoły" tab now lives in `TablesTab.tsx`; add-table + list behaviour is unchanged after the extraction (regression check).
- No page reload needed for any of the above.

**Implementation Note**: Pause for manual confirmation. This is the last phase.

---

## Testing Strategy

### Unit Tests:

- Optional light unit for the pure "freed-guest count" helper (given a table's seats + assignments + new count → N), if extracted as a pure function. Colocate as `src/**/*.test.ts` per test-plan §6.1, deriving expected N by hand (oracle discipline). No Supabase needed.

### Integration Tests:

- **Deferred to test-plan §3 Phase 3** (Risk #4): atomic resize post-state + rollback, cancel-changes-nothing, brittle-seat-order avoidance, against local Supabase. Not in this slice.

### Manual Testing Steps:

1. Run the roadmap acceptance test above (10→5 at 7 assigned).
2. Cancel path leaves state intact.
3. Shrink-to-≥-assigned and grow paths skip the dialog.
4. Delete-with-guests returns them to the unassigned panel.
5. Cross-account `tableId` via REST is rejected.

## Performance Considerations

Negligible — single-wedding scale (≤150 guests). The RPC is one transaction with small `generate_series`/`delete` over a handful of seat rows.

## Migration Notes

- **Prod-apply is a required release step** (Lesson: "Plans with a migration must include a prod-apply step"; Cloudflare Workers Builds does not run migrations). After merge, apply the migration to prod per `docs/reference/deploy-runbook.md`, then verify the RPC exists in prod.
- Migration is additive (new function only) — no data backfill, no schema-breaking change to existing tables.

## References

- Roadmap slice: `context/foundation/roadmap.md` S-04 (`:120-130`)
- PRD: US-02 (`context/foundation/prd.md:73-84`), FR-008/FR-009 (`:118-120`)
- Test plan: Risk #4 + §3 Phase 3 (`context/foundation/test-plan.md:50,88,104`)
- Follow-up F1 (seat_count ceiling): `context/foundation/follow-ups.md`
- RPC pattern to copy: `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql:111-147`
- Service/endpoint patterns: `src/lib/services/table.service.ts:33-53`, `src/pages/api/tables.ts:24-54`
- Inline-edit UI precedent: `src/components/wedding/GuestsTab.tsx:66-112`
- Follow-up F5 (extract TablesTab): `context/foundation/follow-ups.md`; `context/changes/guest-and-conflict-management/follow-ups/extract-tables-tab.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB — update_table RPC + migration

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase (`npx supabase db reset`/`db push`)
- [x] 1.2 Types regenerate cleanly (`npm run db:types`; review `git diff` of `src/db/database.types.ts`)
- [x] 1.3 Type checking passes (`npx astro check`)
- [x] 1.4 Linting passes (`npm run lint`)

#### Manual

- [x] 1.5 RPC shrinks/grows and returns freed guest ids as owner; raises `42501` as non-owner; raises `22023` for seat_count 0/31
- [x] 1.6 `anon` cannot execute the RPC (revoke/grant verified)

### Phase 2: Backend — service, types, API endpoints

#### Automated

- [ ] 2.1 Type checking passes (`npx astro check`)
- [ ] 2.2 Linting passes (`npm run lint`)

#### Manual

- [ ] 2.3 `PATCH /api/tables` renames+resizes, returns updated table + correct `unassignedGuestIds`
- [ ] 2.4 `DELETE /api/tables` removes the table, returns freed ids
- [ ] 2.5 Malformed body → clean 4xx, no partial write
- [ ] 2.6 Cross-account `tableId` → 403/404, no mutation

### Phase 3: Frontend — edit/delete UI + confirmation dialogs

#### Automated

- [ ] 3.1 Type checking passes (`npx astro check`)
- [ ] 3.2 Linting passes incl. React Compiler rule (`npm run lint`)
- [ ] 3.3 Existing unit suite green (`npm run test:run`)

#### Manual

- [ ] 3.4 Roadmap acceptance test (10→5 at 7 assigned) passes end-to-end incl. DB state
- [ ] 3.5 "Anuluj" leaves the table unchanged
- [ ] 3.6 Grow and rename-only paths skip the dialog; every shrink shows the warning dialog
- [ ] 3.7 Rename-only edit touches only the name
- [ ] 3.8 Delete-with-guests returns them to the unassigned panel; no reload needed
- [ ] 3.9 "Stoły" tab extracted to `TablesTab.tsx` with no behaviour change (F5 closed)

### Release

#### Manual

- [ ] R.1 Migration applied to prod per `docs/reference/deploy-runbook.md`; RPC verified present in prod
- [ ] R.2 Mark follow-up **F5** DONE in `context/foundation/follow-ups.md` with this slice's commit
- [ ] R.3 Mark follow-up **F1**'s S-04 DB-guard portion DONE in `context/foundation/follow-ups.md` with this slice's commit (the `22023` seat_count guard in the resize RPC)
