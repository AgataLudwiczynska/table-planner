<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Seat Assignment with Real-Time Adjacency Conflict Validation (S-03)

- **Plan**: `context/changes/assignment-with-realtime-conflict-validation/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-22
- **Verdict**: REVISE → SOUND (after triage; all 4 findings fixed in the plan)
- **Findings**: 0 critical, 3 warnings, 1 observation — all FIXED

## Verdicts

| Dimension | Verdict (as reviewed) | After fixes |
|-----------|-----------------------|-------------|
| End-State Alignment | WARNING (F1) | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | WARNING (F2) | PASS |
| Plan Completeness | WARNING (F3, F4) | PASS |

## Grounding

9/9 paths ✓, schema/RLS/upsert claims verified directly (seats schema, `seats_select` RLS at migration:98-104, `createTable` return at table.service.ts:37, upsert/`23505` semantics), brief↔plan ✓, Progress↔Phase well-formed ✓. `docs/reference/contract-surfaces.md` absent → contract-surface check skipped.

## Findings

### F1 — Extending Table with required `seats` breaks the create path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §3 (extend Table) + Phase 2 §1 (enrich listTables)
- **Detail**: The plan extends `Table` to `{ id; name; seatCount; seats: Seat[] }` and updates `listTables`/`toTable`, but says nothing about `createTable`. `table.service.ts:37` returns `success({ id: res.data, name, seatCount })` — a Table literal with no `seats`. (1) Type break: with `seats` required, that return no longer satisfies `ServiceResult<Table>` → `astro check` fails. (2) Functional gap: the return flows through `useApiMutation<Table>` into `setTables([...prev, data])` (WeddingWorkspace.tsx:109), so a table created in-session carries `seats: []` and its seating-tab ring is empty/unassignable until a hard reload — even though the RPC created the seats in the DB.
- **Fix**: In Phase 2, extend `createTable` too — after the RPC returns the new table id, select its seats (`from("seats").select("id, seat_number").eq("table_id", id).order("seat_number")`) and return a fully-formed Table. Add a Phase-2 success criterion: "a table created in-session is immediately seatable without reload."
  - Strength: Closes both the type break and the empty-ring gap; keeps the optimistic `setTables` append intact.
  - Tradeoff: One extra round-trip on table create (negligible).
  - Confidence: HIGH — verified `table.service.ts:37` and WeddingWorkspace.tsx:109 directly.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (createTable re-reads seats with the enriched select; Phase 2 §1 + criterion 2.8)

### F2 — Deleting a seated guest leaves a stale assignment in client state

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 (WeddingWorkspace assignment state)
- **Detail**: Phase 3 adds `assignments` state and assign/move/unassign callbacks, but the existing `onGuestDeleted` (WeddingWorkspace.tsx:121-124) prunes only `guests` and `conflicts`. The DB cascades the assignment row on guest delete, but the client `assignments` array keeps the stale row. Deleting a *seated* guest from the Goście tab leaves a phantom occupied seat on the seating tab (chip lookup returns undefined; × would 404 as `assignment_not_found`) until reload. Same cross-tab-sync pattern the plan already honors for conflicts, not extended to assignments.
- **Fix**: Extend `onGuestDeleted` to also `setAssignments(prev => prev.filter(a => a.guestId !== id))`, mirroring the conflict-pruning line already there.
- **Decision**: FIXED (Phase 3 §1 Contract + criterion 3.11)

### F3 — Seat membership-validation query is under-specified (references a column seats doesn't have)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 (assignment.service assignSeat)
- **Detail**: Key Discoveries correctly notes "seats has no wedding_id" (confirmed: seats = id/seat_number/table_id/created_at). But Phase 2's instruction validates the seat "via the seats → tables chain (`.eq("wedding_id", weddingId)` on the joined table)". Read literally, `from("seats").eq("wedding_id", weddingId)` targets a nonexistent column and errors. The check is necessary — assignments RLS with_check only verifies ownership of the server-supplied `wedding_id`, not that `seat_id` belongs to it.
- **Fix**: Specify one of: (a) embed + filter `from("seats").select("id, tables!inner(wedding_id)").eq("id", seatId).eq("tables.wedding_id", weddingId).maybeSingle()`; or (b) lean on the owner-scoped `seats_select` RLS (migration:98-104) with `from("seats").select("id").eq("id", seatId).maybeSingle()` — a foreign seat returns 0 rows (owner-scope ≡ wedding-scope, one wedding per user).
  - Strength: Removes an instruction that would send the implementer to a broken query; both options backed by verified RLS.
  - Tradeoff: (a) explicit but verbose; (b) terse but couples correctness to the one-wedding-per-user invariant.
  - Confidence: HIGH — verified seats schema and `seats_select` directly.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix (a) (explicit `tables!inner(wedding_id)` embed + filter; Phase 2 §2)

### F4 — Minor loose ends in the endpoint/service contract

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 (error codes), Phase 2 §3 (endpoint)
- **Detail**: (1) POST status left as "pick one" — repo create precedent is 201 (tables.ts:53), but assign/move is an upsert so 200 is more honest; name it. (2) `guest_already_seated` "if needed" never fires — `upsert(onConflict: "guest_id")` turns a re-seat into an UPDATE, never a 23505 on guest_id. (3) `22023 → invalid_guest` copied from `createTable` (RPC raises 22023) but no assignments path raises it. (4) Phase 3 doesn't say where a failed assign surfaces in the board UI.
- **Fix**: Settle POST=200; remove the never-triggered codes/mappings; add one line on in-board error surfacing (reuse the ServerError pattern).
- **Decision**: FIXED — all four: POST=200 (Phase 2 §3), dropped `guest_already_seated` (Phase 1 §4) and `22023` mapping (Phase 2 §2), ServerError surfacing (Phase 3 §2)

---

# Plan Review — Second Pass (post-revision)

- **Plan**: `context/changes/assignment-with-realtime-conflict-validation/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-22
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 0 critical, 2 warnings, 1 observation

Second review of the plan after the first-pass fixes (F1–F4 above) were baked in. Findings continue the numbering (F5–F7).

## Verdicts

| Dimension | Verdict (as reviewed) | After fixes |
|-----------|-----------------------|-------------|
| End-State Alignment | PASS | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | WARNING (F5, F6, F7) | PASS |
| Plan Completeness | PASS | PASS |

## Grounding

Paths ✓ (all plan-referenced files exist; `result.ts` lives at `src/lib/services/`, plan cites it bare). Symbols ✓ — `ServiceResult`/`failure(code)` (`result.ts`), `getWedding` (`wedding.service.ts:33`), `apiSuccess`/`apiFailure` (`api.ts`), `tables.ts:24-53` sequence, `seats` has no `wedding_id` + `create_table_with_seats` returns only the id (migration confirmed), `seats_select` RLS (migration:98-104). Brief↔plan ✓. Progress↔Phase mechanical contract well-formed ✓ (one `## Progress`, every criteria bullet mapped). `docs/reference/contract-surfaces.md` absent → contract-surface check skipped.

## Findings

### F5 — Acceptance guardrail names an integration test the plan defers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 + Testing Strategy (defers to F6); change.md:20
- **Detail**: change.md:20 locks the guardrail as "validation never stays silent (zero false negatives) — if an integration test finds a missed adjacency, the slice is not done", tying "done" to the test's existence. The plan ships the safety-critical `validateTable` (incl. n===2 collapse, wrap-around) with manual verification only, deferring all automation to F6. The "no test runner yet" reason is real for integration/component tests but thin here: `validateTable` is pure (no Supabase/Astro/DOM), so a Vitest unit test is a dev-dep + one file. The regression window (Phase 4 writes the algorithm, Phase 5 re-derives seat ordering for the SVG ring) is exactly where a wrap-around/2-seat bug slips in, and F6 ("future", no date) gives no cover there.
- **Fix A** (offered): Pull the pure-validator unit test into this slice — minimal Vitest + `adjacency.test.ts` covering the F6 unit cases.
- **Fix B** (offered): Keep manual-only, reconcile the guardrail explicitly and carry the test in F6.
- **Decision**: DEFERRED to follow-up F6 (user chose not to add tests in this slice). The F6 row in `context/foundation/follow-ups.md` was strengthened instead: pure `validateTable` unit test first (no integration harness); explicit edge-case list incl. `n===2` modulo-collapse counted once; Phase 5 SVG ring flagged as prime regression target.

### F6 — Seating board has no widened layout; shell is max-w-2xl (~672px)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3/5 (AssignmentBoard) vs `wedding.astro:45`
- **Detail**: Desired End State describes a two-pane board (unassigned panel left, table rings right), but `wedding.astro:45` wraps the whole island in `mx-auto max-w-2xl` (672px) and every tab renders inside it. A panel + SVG rings (up to 30 seats) inside 672px is cramped and collides with Phase 5 criterion 5.7 ("responsive; no horizontal overflow"). No phase sizes the container, so the implementer hits it only when the board looks wrong on screen.
- **Fix**: Decide the width envelope in Phase 3 — let the seating tab break out of `max-w-2xl` to a wider/full-width container while form tabs stay narrow; reflow panel-above-rings below a breakpoint; fix ring radius + panel width as constants.
- **Decision**: FIXED (plan) — new "Critical Implementation Details" bullet + Phase 3 §5 "Layout width envelope"; responsiveness verified by existing criterion 5.7 (no new Progress entry).

### F7 — DnD binding lifecycle vs. per-assignment re-render not specified

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — `useSeatDnd.ts` / central `monitorForElements`
- **Detail**: `assignments` changes on every drop/click, so anything in the DnD effects' dependency arrays that closes over live state tears down and rebinds `draggable`/`dropTarget`/`monitor` each op. The plan says "accurate dependency arrays" but not the shape that keeps bindings stable: the monitor's commit should read source guestId + target seatId from the drag event data, not from `assignments` (and `assignGuestToSeat`, an idempotent upsert, needn't depend on assignments). Left unresolved, it's stale-closure vs. constant-rebinding — the classic first-useEffect trap.
- **Fix**: Commit from event data only (narrow `source.data`); keep any "latest state" behind a ref so the effect binds once at mount; cleanup = `controller.abort()` + library teardown.
- **Decision**: FIXED (plan) — revisited on 2026-08-22; the "accurate dependency arrays" line was too thin given this is the first `useEffect`/DnD in the codebase (no prior art to copy). Phase 3 §3 now specifies the binding shape: monitor commits from event data only, live occupancy for `canDrop` behind a `useRef`, effect binds once at mount, cleanup = `controller.abort()` + library teardown.

## Triage summary (second pass)

- **Fixed in plan**: F6 (layout width envelope, Phase 3 §5 + Critical Implementation Details); F7 (DnD binding shape baked into Phase 3 §3 — revisited 2026-08-22, reversed from SKIPPED to FIXED).
- **Deferred**: F5 → follow-up F6 (register row strengthened; no tests added this slice).
- **Verdict after triage**: SOUND — no blocking issues; plan ready for `/10x-implement`.
