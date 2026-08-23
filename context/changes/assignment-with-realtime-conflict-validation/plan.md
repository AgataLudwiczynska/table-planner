# Seat Assignment with Real-Time Adjacency Conflict Validation (S-03) — Implementation Plan

## Overview

S-03 is the product's north-star slice. It adds the ability to assign guests to specific seats — via drag-and-drop and a click fallback — and validates adjacency conflicts in real time: the instant an assignment changes, both seats of any violated "not next to each other" conflict light up red and the pair is added to a violated-conflicts list. There is no "Check" button and no auto-unassign; the operator decides what to do about a flagged conflict.

The slice introduces the first seat-facing surface in the app (seats have never reached the client), the first persisted `assignments`, the first drag-and-drop interaction, and the first pure client-side validation algorithm.

## Current State Analysis

- **Persistence is a clean slate.** No `assignments` table, no `Seat` domain type, no seat service exists (`research.md:62`). Seats live in the DB (created by the F-01 RPC `create_table_with_seats`) with `id`, `table_id`, `seat_number`, but are never sent to the client. `wedding.astro:25-29` loads tables as `{id, name, seatCount}` only.
- **The RLS + constraint pattern to copy is fully established.** F-01 (`20260812201915_wedding_scope_schema_and_rls.sql`) and S-02 (`guest_conflicts`) set the pattern: `enable row level security`; `revoke all … from anon`; per-operation policies `to authenticated`; `auth.uid()` wrapped as `(select auth.uid())`; ownership via `exists (select 1 from weddings …)`; FK indexes for the policy subqueries; canonical-order + unique constraints.
- **Write/service/endpoint/error patterns are uniform and reusable.** `tables.ts:24-53` (endpoint sequence), `conflict.service.ts:22-58` (membership validation + canonical order to mirror for adjacency), `errors.ts`, `result.ts`, `api.ts`, `routes.ts`, `useApiMutation.ts`, `types.ts` naming (`Row` suffix / clean domain / `…Input`).
- **Mounting is settled** (`change.md:32`): `WeddingWorkspace.tsx` is the single `client:load` island, already holding `tables`/`guests`/`conflicts` in `useState` and refreshing them functionally from returned rows (`:109,118`). It renders `GuestsTab`/`ConflictsTab` as children (not islands).
- **Two greenfield pieces:** the adjacency ring algorithm (no geometry/modulo helper exists anywhere — `research.md:101`) and the pragmatic-drag-and-drop binding (no `useRef`/`useEffect`/DOM access exists in `src/components` yet — `research.md:54`).
- **No test runner exists yet** (CLAUDE.md). The `change.md:20` guardrail names an integration test; this slice ships with manual verification and defers automation to follow-up **F6**.

## Desired End State

A new **"Rozsadzanie"** (seating) tab in `WeddingWorkspace`. On the left, an always-visible panel of unassigned guests. On the right, each table rendered as a graphical ring of seats numbered 1..N. The operator assigns a guest to a seat by dragging a chip onto it, or by clicking a guest then clicking a seat. An occupied seat can be vacated with a × button or by dropping its guest back on the panel; a seated guest can be dragged directly onto another empty seat (move). The invariant "max 1 guest/seat, max 1 seat/guest" is enforced at the DB (unique constraints) and in the UI (`canDrop`). After every assignment change, the system re-validates all tables against the conflict set and highlights both seats of each adjacency violation red (+ warning icon), listing the violated pairs. State persists across reload (assignments are read server-side on page load).

**Verification:** assign/move/unassign persist across a hard reload; two conflicting guests placed on adjacent seats of any table (including a 2-seat table) always flag red and appear in the list; a non-adjacent placement of the same pair does not flag; the invariant cannot be violated through the UI.

### Key Discoveries:

- Always key assignments off `seats.id`, never `seat_number` (`research.md:63`); `seat_number` is unique only within a table.
- `seats` has no `wedding_id` (`research.md:64`); denormalize `wedding_id` onto `assignments` so the RLS owner policy stays a single-join `exists`, and have the service validate that both `guest_id` and `seat_id` belong to the wedding before writing (mirrors `conflict.service.ts:33-36`).
- Conflicts are stored canonically ordered with `check (guest_a_id < guest_b_id)` (`guest_conflicts`, S-02); the adjacency validator must order each adjacent pair the same way (`least/greatest`) before matching.
- `on delete cascade` on all three assignment FKs delivers FR-012 (unassign on guest delete) and S-04 seat-removal cleanup for free.
- The DnD adapter must be loaded via a deferred dynamic `import()` inside `useEffect` (SSR-safe on Cloudflare; also bundle-splits the DnD code) — `pragmatic-drag-and-drop-api-reference.md:199-215`.
- Adjacency conflicts are local to a table: a change on table T can only alter T's violation set. `validateTable(table, …)` is therefore the correct pure unit; full re-scan maps it over all tables.

## What We're NOT Doing

- **No swap of two occupied seats** — move-to-empty-seat only (`change.md:24`). Dropping onto an occupied seat is rejected by `canDrop`.
- **No auto-unassign on conflict** — the operator decides (`change.md:14`).
- **No SECURITY DEFINER RPC for assignments** — direct upsert/delete + service membership validation (`change.md:25`), unlike the multi-row `create_table_with_seats`.
- **No automated test suite in this slice** — manual verification only; test runner + adjacency integration test deferred to follow-up **F6**.
- **No optional pragmatic-dnd a11y companion package** — the click fallback + × button cover the non-pointer baseline; the companion package is a possible later polish.
- **No performance target work** (PRD Open Question #1) — full re-scan is trivially within budget at wedding scale.
- **No S-04/S-05 scope** — table resize/delete dialog and progress counter are separate slices.

## Implementation Approach

Five phases, each independently manually verifiable, following the DB → service → API → UI direction and the `change.md:19` speed mitigation (flat seat list first, graphical ring last):

1. **Persistence** — `assignments` table + RLS migration, generated types, domain types, error codes, route entry.
2. **Backend** — enrich `listTables` with nested seats; new `assignment.service.ts` + `/api/assignments.ts`; wire the SSR read.
3. **Flat seating board + interactions** — new tab, unassigned panel, flat numbered seats, DnD + click assign/move, × / panel-drop unassign. No validation yet.
4. **Real-time validation** — pure `validateTable` + `validateAllTables`, red highlight, violated-conflicts list, recomputed on every change.
5. **Graphical SVG ring** — replace the flat seat list with a numbered ring, preserving all behavior.

## Critical Implementation Details

- **Adjacency ring, 2-seat edge case.** For a ring of `n` seats, seat at index `i` neighbors `(i-1+n) % n` and `(i+1) % n`. For `n === 2` both formulas collapse to the same neighbor — the pair must be counted **once**, not twice, and a seat is never its own neighbor. For `n === 1` there are no adjacent pairs. This is the single most guardrail-sensitive line in the slice (`change.md:20`, zero false negatives).
- **DnD adapter is SSR-poison at module scope.** Never top-level-import `@atlaskit/pragmatic-drag-and-drop/element/adapter`. Load it via `await import(...)` inside `useEffect`, guarded by an `AbortController`, per `pragmatic-drag-and-drop-api-reference.md:199-215`. This is also the first `useRef`+`useEffect` in `src/components` — give effects accurate dependency arrays so `react-compiler`/`exhaustive-deps` pass.
- **Seat-occupied race.** `canDrop` blocks occupied seats in the UI, but the DB `unique(seat_id)` is the real guard. The service must translate a `23505` on the `seat_id` constraint to `seat_occupied` and on `guest_id` (when not the upsert target) appropriately — assign/move is `upsert(onConflict: guest_id)`, so a same-guest re-seat updates in place while a different guest hitting an occupied seat surfaces `seat_occupied`.
- **Assignments are their own mutable client state.** Regardless of how they arrive at load, keep an `assignments: Assignment[]` state updated functionally from each mutation's returned row (upsert row) or deletion id — mirroring the `setGuests`/`setConflicts` pattern. Do not fold assignment state into the seats/tables structure.
- **Seating tab needs a wider layout than the shell.** The workspace renders inside `wedding.astro`'s `mx-auto max-w-2xl` wrapper (`:45`), sized for the form-based tabs. The two-pane board (unassigned panel + table rings up to 30 seats) does not fit 672px. Give the seating tab a wider container — lift the width cap so the form tabs self-constrain to `max-w-2xl` while the seating tab uses the full width — and reflow to panel-above-rings below a breakpoint (satisfies criterion 5.7). Decide the ring radius + panel width here, not at render time.

## Phase 1: Persistence — assignments table, RLS, types

### Overview

Create the `assignments` table with the invariant constraints and owner-only RLS, regenerate DB types, and add the domain types, error codes, and route entry the later phases depend on.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_assignments_and_rls.sql`

**Intent**: Persist one assignment row per guest, enforce the max-1-guest/seat and max-1-seat/guest invariants, and scope every operation to the wedding owner — copying the F-01/S-02 RLS pattern exactly.

**Contract**: Table `assignments (id uuid pk default gen_random_uuid(); wedding_id uuid not null references weddings(id) on delete cascade; guest_id uuid not null references guests(id) on delete cascade; seat_id uuid not null references seats(id) on delete cascade; created_at timestamptz not null default now(); unique(guest_id); unique(seat_id))`, plus `create index on assignments (wedding_id)`. RLS: `enable row level security`; `revoke all on assignments from anon`; four per-operation policies `to authenticated` (SELECT/INSERT/UPDATE/DELETE), each gated by `exists (select 1 from weddings w where w.id = wedding_id and w.user_id = (select auth.uid()))`; every `auth.uid()` wrapped as `(select auth.uid())`. INSERT and UPDATE need the ownership check in both `using` (UPDATE) and `with check`. Read `docs/reference/rls-verification-protocol.md` before writing.

#### 2. Generated DB types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate after the migration so the `assignments` Row/Insert types exist. Generated file — do not hand-edit.

**Contract**: `npm run db:types`, then commit the file alongside the migration (CLAUDE.md rule).

#### 3. Domain + input types

**File**: `src/types.ts`

**Intent**: Add the seat and assignment domain shapes, the request-body input, and enrich `Table` with its seats so the board can render rings.

**Contract**: `AssignmentRow` alias from the generated types; `Seat { id: string; seatNumber: number }`; `Assignment { id: string; guestId: string; seatId: string }`; extend `Table` to `{ id; name; seatCount; seats: Seat[] }`; `AssignSeatInput { guestId: string; seatId: string }`. Naming per convention (`Row` suffix / clean domain / `…Input`).

#### 4. Error codes

**File**: `src/lib/errors.ts`

**Intent**: Register the assignment failure codes with Polish messages before any service references them.

**Contract**: Add `seat_not_found` (404), `seat_occupied` (409), `assignment_not_found` (404), and reuse existing `invalid_guest`/`guest_not_found`/`forbidden` where they fit. (No `guest_already_seated` — `upsert(onConflict: "guest_id")` turns a re-seat into an UPDATE, so it never surfaces a `guest_id` conflict.)

#### 5. Route registry

**File**: `src/lib/routes.ts`

**Intent**: Centralize the new endpoint path (lessons.md — no hardcoded literals).

**Contract**: Add `apiAssignments: "/api/assignments"` to `ROUTES`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push` (local)
- Types regenerate without diff drift beyond the new table: `npm run db:types`
- Type-check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- RLS cross-account check per `docs/reference/rls-verification-protocol.md`: as user B, SELECT/INSERT/UPDATE/DELETE on user A's assignment ids returns 0 rows / is rejected.
- `anon` cannot see `assignments` in the API schema (revoke took effect).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Backend — seat read, assignment service + endpoint, SSR wiring

### Overview

Deliver seat identities to the client (nested under tables) and existing assignments (separate array), and stand up the assignment write path following the canonical endpoint→service→ServiceResult flow.

### Changes Required:

#### 1. Enrich table reads with seats (list + create)

**File**: `src/lib/services/table.service.ts`

**Intent**: Include each table's seats (id + number, ordered) so the board can render rings without an extra fetch — on both the list read and the create path, so a table created in-session is immediately seatable.

**Contract**: `listTables` select embeds seats via PostgREST — `select("id, name, seat_count, seats(id, seat_number)")`, seats ordered by `seat_number` ascending; `toTable` maps the embedded rows to `seats: Seat[]`. RLS `seats_select` already scopes the embed to the owner. **`createTable` must also return a fully-formed `Table` with `seats`**: the RPC returns only the new table id, so after it succeeds, re-read that table with the same enriched select scoped to the new id (`.eq("id", newTableId).single()`) and map via `toTable` — do not hand-build `{ id, name, seatCount }` (it omits the now-required `seats` and leaves a freshly created table with an empty ring until reload). The seat rows exist immediately (the RPC commits them before returning), so the read needs no retry.

#### 2. Assignment service

**File**: `src/lib/services/assignment.service.ts`

**Intent**: List assignments for a wedding, and assign/move/unassign with server-side membership validation — mirroring `conflict.service.ts`, no RPC.

**Contract**: `toAssignment(row)` snake→camel mapper. `listAssignments(supabase, weddingId): ServiceResult<Assignment[]>`. `assignSeat(supabase, weddingId, guestId, seatId): ServiceResult<Assignment>` — validate the guest belongs to the wedding (`guests` where `wedding_id` + `id`; 0 rows → `invalid_guest`) and the seat belongs to the wedding via an inner embed on its parent table — `from("seats").select("id, tables!inner(wedding_id)").eq("id", seatId).eq("tables.wedding_id", weddingId).maybeSingle()` (`seats` has no `wedding_id` column, so the filter lives on the embedded `tables`; the owner-scoped `seats_select` RLS is a backstop, not the primary check); 0 rows → `seat_not_found`. Then `upsert({ wedding_id, guest_id, seat_id }, { onConflict: "guest_id" })` and `.select(...).single()`; translate `23505` → `seat_occupied` and `42501` → `forbidden` (guest/seat membership is validated explicitly above, so there is no `22023` path to map). `unassign(supabase, guestId): ServiceResult<{ guestId: string }>` — `delete().eq("guest_id", guestId).select("guest_id").maybeSingle()`, not-found → `assignment_not_found`. Services return `failure(code)`, never throw for expected failures.

#### 3. Assignment endpoint

**File**: `src/pages/api/assignments.ts`

**Intent**: POST assigns/moves a guest to a seat; DELETE unassigns. Resolve the wedding server-side; never trust a client wedding id.

**Contract**: `export const prerender = false`. Follow the `tables.ts:24-53` sequence: supabase null guard → `locals.user` guard → `request.json()` try/catch → zod `safeParse` (schemas in-file: POST `{ guestId: uuid, seatId: uuid }`; DELETE `{ guestId: uuid }`) surfacing `issues[0].message` → `getWedding(supabase, user.id)` → call service → `apiFailure` / `apiSuccess`. POST returns the assignment row with status **200** (assign and move are both upserts — sometimes an UPDATE — so 200 rather than the 201 used by table create). DELETE returns `{ guestId }` (200).

#### 4. SSR wiring

**File**: `src/pages/wedding.astro`

**Intent**: Load existing assignments alongside the enriched tables and pass both into the island.

**Contract**: Add `listAssignments(supabase, wedding.id)` to the `Promise.all` (`:25-29`); pass `initialAssignments={assignments}` to `WeddingWorkspace` (`:68-74`). `tables` now carry `seats` via the enriched `listTables`.

### Success Criteria:

#### Automated Verification:

- Type-check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `POST /api/assignments` with a valid guest+seat persists a row; re-POST for the same guest onto a different empty seat moves it (old seat freed); onto an occupied seat returns `seat_occupied`.
- `DELETE /api/assignments` removes the row; deleting a non-existent one returns `assignment_not_found`.
- A guest or seat id from another wedding is rejected (membership validation), not written.
- `wedding.astro` renders with assignments loaded (verify via network/SSR payload).
- A table created in-session (via `POST /api/tables`) returns with its `seats` populated and is immediately seatable on the board without a reload.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Flat seating board + assignment interactions

### Overview

Add the "Rozsadzanie" tab: unassigned-guests panel plus each table as a flat numbered seat list, with drag-and-drop and click-to-assign, move-to-empty, and unassign. No conflict validation yet — this phase proves assignment mechanics and persistence in isolation.

### Changes Required:

#### 1. Tab registration + assignment state

**File**: `src/components/wedding/WeddingWorkspace.tsx`

**Intent**: Add the seating tab and own the assignments array as mutable state refreshed from mutation results.

**Contract**: Add `{ key: "seating", label: "Rozsadzanie" }` to `TABS` and the `TabKey` union; add `initialAssignments?: Assignment[]` to `Props`; seed `assignments` via `useState`; render `<AssignmentBoard tables={tables} guests={guests} assignments={assignments} onAssignmentsChange={...} conflicts={conflicts} />` under the seating tab. Provide callbacks that functionally update `assignments` (upsert-by-guestId on assign/move; filter-by-guestId on unassign), mirroring `onGuestCreated`/`onGuestDeleted`. Also extend the existing `onGuestDeleted` to prune assignments — `setAssignments((prev) => prev.filter((a) => a.guestId !== id))` — mirroring the conflict-pruning it already does, so a deleted seated guest doesn't leave a phantom occupied seat (the DB cascades the row; reflect it in state).

#### 2. Assignment board

**File**: `src/components/wedding/AssignmentBoard.tsx`

**Intent**: Render the panel + flat seat lists, host the single DnD monitor and the click-selection state machine, and call the shared assign/unassign function from both the DnD and click paths.

**Contract**: Props `{ tables: Table[]; guests: Guest[]; assignments: Assignment[]; conflicts: Conflict[]; onAssigned(a: Assignment): void; onUnassigned(guestId: string): void }`. Derive: `assignmentByGuestId` and `assignmentBySeatId` maps; unassigned guests = guests without an assignment. A single `assignGuestToSeat(guestId, seatId)` calls `useApiMutation` POST `ROUTES.apiAssignments` and lifts the row via `onAssigned`; `unassignGuest(guestId)` DELETEs and calls `onUnassigned`. Click fallback: a `selectedGuestId` state — clicking a guest selects/toggles it, clicking an empty seat while selected assigns then clears selection, Esc clears. Move: dragging/clicking an already-assigned guest onto another empty seat reuses `assignGuestToSeat` (upsert frees the old seat). Unassign: × button on an occupied seat, and the panel is a drop target (dropping a seated guest there unassigns). Surface a failed assign/unassign (e.g. a `seat_occupied` race past `canDrop`, or a network error) to the operator via the shared `ServerError` component driven by `useApiMutation`'s `error` — don't fail silently.

#### 3. DnD binding hook

**File**: `src/components/hooks/useSeatDnd.ts` (or inline effects within the board/seat/chip components)

**Intent**: Encapsulate the SSR-safe deferred-import binding of `draggable` / `dropTargetForElements` / `monitorForElements`.

**Contract**: `useEffect` with an `AbortController` that `await import(".../element/adapter")`, binds the element (guest chip → `draggable` with `getInitialData({ type: "guest", guestId, seatId? })`; seat → `dropTargetForElements` with `getData({ seatId })` + `canDrop` blocking non-guest sources and occupied seats; one central `monitorForElements` committing via `assignGuestToSeat`), and returns the library cleanup wired to `controller.abort()`. Accurate dependency arrays. Binding stability: the central `monitorForElements` commits from event data only — read `guestId`/`seatId` from `source.data` and the drop target's `data`, never from `assignments` state (`assignGuestToSeat` is an idempotent upsert and needn't depend on it). Keep live occupancy for `canDrop` behind a `useRef` updated each render, so the binding effect runs once at mount instead of tearing down and rebinding on every assignment change. Cleanup = `controller.abort()` + the library's own teardown. `source.data` is `Record<string, unknown>` — narrow (`typeof guestId === "string"`) before use.

#### 4. Package dependency

**File**: `package.json`

**Intent**: Add the DnD library.

**Contract**: `npm install @atlaskit/pragmatic-drag-and-drop`. Verify it resolves without `--legacy-peer-deps` (core has no React peer dep — `research.md:43`).

#### 5. Layout width envelope

**File**: `src/pages/wedding.astro` + `src/components/wedding/WeddingWorkspace.tsx`

**Intent**: Give the seating board room the narrow form shell can't provide, without widening the form-based tabs.

**Contract**: Today the whole island sits in `wedding.astro`'s `mx-auto max-w-2xl` wrapper (`:45`). Lift that cap to a wider (or full-width) outer container and move the `max-w-2xl` constraint onto the form-based tab content (tables/guests/conflicts) so only they stay narrow; the seating tab uses the wider width. Below a breakpoint (e.g. `lg`), the unassigned panel reflows above the table rings instead of beside them. Fix the ring radius and panel width as constants here so Phase 5's `TableRing` has a known layout budget. Verified by criterion 5.7 (responsive, no horizontal overflow).

### Success Criteria:

#### Automated Verification:

- Type-check passes: `npx astro check`
- Lint passes (incl. react-compiler): `npm run lint`
- Build passes: `npm run build`
- `npm run preview` boots on workerd without SSR errors touching `window`/`document`.

#### Manual Verification:

- Drag a guest chip onto an empty seat → assigned and persists across reload.
- Click a guest then an empty seat → same result; clicking the guest again (or Esc) clears selection.
- Drag/click a seated guest onto another empty seat → moves, old seat freed.
- × on an occupied seat and dropping a seated guest on the panel both unassign.
- Occupied seats reject drops (`canDrop`); the invariant cannot be broken via the UI.
- No hydration/SSR errors in `npm run preview`.
- Deleting a seated guest from the Goście tab clears their seat on the board immediately (no phantom occupied seat), without a reload.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Real-time adjacency validation

### Overview

Add the pure ring validator and wire it so that every assignment change recomputes violations across all tables, highlighting both seats of each violated pair and listing them — with no "Check" button.

### Changes Required:

#### 1. Adjacency validator

**File**: `src/lib/adjacency.ts`

**Intent**: Pure, Supabase-free computation of adjacency violations for one table and a mapper over all tables.

**Contract**: `validateTable(table: Table, assignmentBySeatId: Map<string, string>, conflictSet: Set<string>): Violation[]` where a seat's ring position is its order by `seat_number` and neighbors are `(i±1) mod n`; for each adjacent seat pair both occupied, order the two guest ids canonically (`a < b`) and test membership in `conflictSet` (keyed e.g. `` `${lo}|${hi}` ``). Handle `n === 2` (single distinct neighbor, count once) and `n === 1` (no pairs). `validateAllTables(tables, assignments, conflicts): Violation[]` builds the maps/set once and flat-maps `validateTable` over all tables. `Violation` carries the two guest ids, the two seat ids, and the table id (for display + highlight). Add `Violation` to `src/types.ts`.

#### 2. Validation wiring + highlight + list

**File**: `src/components/wedding/AssignmentBoard.tsx`

**Intent**: Recompute violations from current props on every render (they change whenever assignments change) and drive seat highlighting + the violated-conflicts list.

**Contract**: Derive `violations = validateAllTables(tables, assignments, conflicts)` (React Compiler memoizes); build a `violatingSeatIds` set for O(1) per-seat lookup. A seat in that set renders red + a warning icon (`lucide-react`). A violated-conflicts list region (Polish copy) shows each violation as the two guest names + table name/seat numbers. No effect, no round-trip — pure derivation over the already-loaded `conflicts` + live `assignments`.

### Success Criteria:

#### Automated Verification:

- Type-check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Two conflicting guests on adjacent seats flag both seats red + appear in the list, instantly on drop/click (no button).
- The same pair on non-adjacent seats does not flag.
- 2-seat table: two conflicting guests flag exactly once (no double-count, no self-neighbor).
- Moving/unassigning a guest updates highlights and the list immediately.
- Guardrail spot-check: no adjacency configuration leaves validation silent (manual pass over ring wrap-around, first/last seat adjacency).

**Implementation Note**: Pause for manual confirmation before proceeding. (Automated guardrail test is deferred to follow-up F6.)

---

## Phase 5: Graphical SVG ring rendering

### Overview

Replace the flat numbered seat list with each table rendered as a graphical ring of seats numbered 1..N around a circle, preserving all DnD, click, move, unassign, validation, and highlight behavior.

### Changes Required:

#### 1. Ring seat layout

**File**: `src/components/wedding/TableRing.tsx` (extracted from the flat list in `AssignmentBoard`)

**Intent**: Position seats evenly around a circle and render each as the same drop-target/draggable element the flat list used, so behavior is unchanged.

**Contract**: Given `table.seats` (ordered), place seat `i` at angle `(2π · i / n) − π/2` (seat 1 at top) on a circle of a fixed radius; each seat keeps its `seatId`, number label, occupant chip, × control, red-highlight state, and the same `useSeatDnd` binding. Panel, monitor, click-selection, and validation stay in `AssignmentBoard`; only the per-table seat presentation changes from list to ring.

### Success Criteria:

#### Automated Verification:

- Type-check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Each table shows a ring with seats 1..N positioned around the circle; seat 1 is visually distinguishable.
- All Phase 3 interactions (DnD, click, move, unassign) work identically on the ring.
- All Phase 4 validation/highlighting works identically on the ring, including the 2-seat and wrap-around cases.
- Layout is responsive and does not overflow horizontally on small screens.

**Implementation Note**: Final phase — after manual confirmation, the slice is ready for impl review.

---

## Testing Strategy

No automated runner exists yet; this slice verifies manually and defers automation to follow-up **F6** (Vitest + the `validateTable` "never stays silent" integration test, including the 2-seat collapse). When the runner lands, F6 must add:

### Unit Tests (deferred, F6):

- `validateTable`: adjacent conflicting pair flags; non-adjacent does not; first/last seat wrap-around adjacency; `n === 2` counts once; `n === 1` yields nothing; empty/partial occupancy.
- `validateAllTables`: violations aggregate across multiple tables; a change on one table does not affect another's result.

### Manual Testing Steps (this slice):

1. Create a table with N seats; open "Rozsadzanie".
2. Assign guests by drag and by click; move a seated guest; unassign via × and via panel drop.
3. Define a conflict pair; seat them adjacent → both seats red + listed; non-adjacent → clear.
4. Repeat step 3 on a 2-seat table.
5. Hard-reload → assignments and resulting validation reappear.
6. Attempt to drop onto an occupied seat → rejected.

## Performance Considerations

Full re-scan (`validateAllTables`) on each change is a few hundred O(1) set lookups at wedding scale (≤30 seats/table), recomputed on a human-paced drag/click — sub-millisecond, unobservable. The validator is factored as pure per-table `validateTable`, so scoping to only changed tables is a one-line future optimization if scale ever demands it (PRD Open Question #1 stays deferred). The DnD adapter is deferred-imported, so its bundle loads lazily and never runs during SSR.

## Migration Notes

`assignments` is additive (new table, no changes to existing rows). `on delete cascade` on all three FKs means guest deletion (S-02) and future seat/table removal (S-04) clean up assignments automatically. Migrations are one-way (CLAUDE.md) — push during a low-traffic window.

## References

- Research: `context/changes/assignment-with-realtime-conflict-validation/research.md`
- DnD API surface: `context/changes/assignment-with-realtime-conflict-validation/pragmatic-drag-and-drop-api-reference.md`
- Library selection: `context/changes/assignment-with-realtime-conflict-validation/dnd-review-session.md`
- Locked decisions: `context/changes/assignment-with-realtime-conflict-validation/change.md:22-33`
- RLS pattern to copy: `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql:43-104`
- Canonical-order + membership pattern: `src/lib/services/conflict.service.ts:22-58`
- Endpoint sequence: `src/pages/api/tables.ts:24-53`
- Island + refresh pattern: `src/components/wedding/WeddingWorkspace.tsx:50-130`
- Deferred follow-up: `context/foundation/follow-ups.md` (F6)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Persistence — assignments table, RLS, types

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push` — d44192c
- [x] 1.2 Types regenerate without drift beyond the new table: `npm run db:types` — d44192c
- [x] 1.3 Type-check passes: `npx astro check` — d44192c
- [x] 1.4 Lint passes: `npm run lint` — d44192c

#### Manual

- [x] 1.5 RLS cross-account check: user B cannot read/write user A's assignments — d44192c
- [x] 1.6 `anon` cannot see `assignments` in the API schema — d44192c

### Phase 2: Backend — seat read, assignment service + endpoint, SSR wiring

#### Automated

- [x] 2.1 Type-check passes: `npx astro check`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Build passes: `npm run build`

#### Manual

- [x] 2.4 POST assigns; re-POST moves (old seat freed); occupied seat → `seat_occupied`
- [x] 2.5 DELETE unassigns; missing → `assignment_not_found`
- [x] 2.6 Cross-wedding guest/seat id rejected by membership validation
- [x] 2.7 `wedding.astro` renders with assignments loaded
- [x] 2.8 A table created in-session returns with `seats`; immediately seatable without reload

### Phase 3: Flat seating board + assignment interactions

#### Automated

- [ ] 3.1 Type-check passes: `npx astro check`
- [ ] 3.2 Lint passes (incl. react-compiler): `npm run lint`
- [ ] 3.3 Build passes: `npm run build`
- [ ] 3.4 `npm run preview` boots on workerd without SSR `window`/`document` errors

#### Manual

- [ ] 3.5 Drag assign persists across reload
- [ ] 3.6 Click assign works; re-click/Esc clears selection
- [ ] 3.7 Move (drag/click) frees the old seat
- [ ] 3.8 × and panel-drop both unassign
- [ ] 3.9 Occupied seats reject drops; invariant holds via UI
- [ ] 3.10 No hydration/SSR errors in preview
- [ ] 3.11 Deleting a seated guest clears their seat on the board immediately (no phantom, no reload)

### Phase 4: Real-time adjacency validation

#### Automated

- [ ] 4.1 Type-check passes: `npx astro check`
- [ ] 4.2 Lint passes: `npm run lint`
- [ ] 4.3 Build passes: `npm run build`

#### Manual

- [ ] 4.4 Adjacent conflicting pair flags both seats red + list, instantly
- [ ] 4.5 Non-adjacent pair does not flag
- [ ] 4.6 2-seat table flags exactly once
- [ ] 4.7 Move/unassign updates highlights + list immediately
- [ ] 4.8 Guardrail spot-check: no configuration leaves validation silent (wrap-around)

### Phase 5: Graphical SVG ring rendering

#### Automated

- [ ] 5.1 Type-check passes: `npx astro check`
- [ ] 5.2 Lint passes: `npm run lint`
- [ ] 5.3 Build passes: `npm run build`

#### Manual

- [ ] 5.4 Ring shows seats 1..N positioned around the circle; seat 1 distinguishable
- [ ] 5.5 All Phase 3 interactions work on the ring
- [ ] 5.6 All Phase 4 validation/highlight works on the ring (2-seat + wrap-around)
- [ ] 5.7 Responsive; no horizontal overflow on small screens
