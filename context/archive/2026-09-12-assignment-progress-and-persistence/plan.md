# Assignment Progress Counter & State Persistence (S-05) Implementation Plan

## Overview

Add an assignment-progress counter "N / M gości przypisanych" (N = guests with a
seat, M = total guests entered into the system) to a fixed spot in the wedding
workspace header, visible on every tab, and explicitly verify that the full
plan state (assignments, conflicts, tables) survives a logout → login round
trip. The counter is a pure derivation over state that already lives in
`WeddingWorkspace`; persistence is already owned by the Postgres schema + RLS
shipped in F-01/S-03. This slice therefore adds a small amount of derived UI
and one unit test, and closes the requirement with a manual persistence smoke.

## Current State Analysis

- `src/pages/wedding.astro:23-44` loads all plan state **server-side** on every
  (post-login) render via a single `Promise.all` (`listTables`, `listGuests`,
  `listConflicts`, `listAssignments`) and passes it to the `WeddingWorkspace`
  island as props. Nothing the UI needs lives only client-side.
- `src/components/wedding/WeddingWorkspace.tsx:45-52` is the single source of
  truth: `useState` for `wedding`, `tables`, `guests`, `conflicts`,
  `assignments`. Every mutation (assign/unassign `:115-120`, table resize/delete
  `:80-94`, guest delete `:103-107`) already updates this state, so a value
  derived from `tables` + `assignments` here recomputes correctly for free.
- The header region is the wedding-name `<div>` at
  `WeddingWorkspace.tsx:123-148`, sitting **above** the tab bar
  (`:150-170`) — the natural, always-visible home for the counter.
- `src/types.ts`: `Guest` (`:49-55`) is one row per guest entered (M source);
  `Assignment` (`:36-40`) is one row per seated guest (N source).
- No HTTP GET-state endpoint exists — the API routes under `src/pages/api/` are
  mutation-only; full state is only ever loaded in `wedding.astro`.
- Test harness: `vitest.config.ts` unit lane is `environment: "node"` with **no
  jsdom / testing-library** — only pure functions are unit-testable. The one
  reference unit test is `src/lib/adjacency.test.ts`.
- **Counter logic does not exist yet** and there is no pure module for it — the
  only comparable inline derivation is `AssignmentBoard.tsx:34`
  (`unassignedGuests`).

## Desired End State

The operator sees "N / M gości przypisanych" in a fixed header slot on all four
tabs. It updates after every assignment, guest add/delete, and table edit. With no
guests it reads "0 / 0". When every entered guest has a seat (N === M and M > 0) it is
visually emphasised (the "150 / 150" completion moment from US-03). The count is
**independent of conflict validation** — two conflicting guests seated adjacent
still count toward N; the violations list grows separately. After logout and
login the operator returns to exactly the same state: same guests on the same
seats, same conflicts, same tables — verified manually against explicit
criteria.

**Verification**: `npm run test:run` (new counter unit test green), `npx astro
check`, `npm run lint`, and a manual logout/login smoke confirming an unchanged
N/M, conflicts, and tables.

### Key Discoveries:

- Counter needs **no new data source, API, or fetch** — it is
  `assignments.length` over `guests.length`, both already in
  `WeddingWorkspace` state (`WeddingWorkspace.tsx:48,50`).
- Persistence is **already implemented** by F-01/S-03 (all state in Postgres
  with owner-scoped RLS; re-loaded server-side in `wedding.astro:27-32`). This
  slice does not touch persistence code — it verifies it.
- Test-plan (`context/foundation/test-plan.md` §2, §3) classifies the
  logout/login round trip as **Risk #6, High × Low → light treatment**. The
  **automated** DB round-trip is owned by **test rollout Phase 3** (§3, wiersz
  104, status *not started*), and a dedicated heavy persistence suite here is a
  named anti-pattern (§2, wiersz 90). S-05 gets the counter unit test + a manual
  persistence smoke.
- No migration in this slice → the "plans with a migration need a prod-apply
  step" lesson does not apply.

## What We're NOT Doing

- **No** dedicated automated persistence integration suite in this slice — the
  automated logout/login round trip belongs to test rollout Phase 3 (Risk #6),
  which builds it alongside #2/#4 to avoid duplication.
- **No** new "summary view" — US-03's "widok podsumowania pokazujący wszystkie
  stoły z pełnymi miejscami" is already satisfied by the existing
  `AssignmentBoard` table rings; the roadmap S-05 outcome names only the counter
  + persistence.
- **No** schema change, migration, service, or API endpoint.
- **No** counter on a per-table basis, no percentage, no "seats remaining" — a
  single wedding-wide "N / M" as specified.
- **No** coupling of the counter to conflicts/violations (progress stays
  independent of validation per PRD).

## Implementation Approach

Extract a tiny pure helper `computeProgress(guests, assignments)` →
`{ assigned, total, isComplete }` into `src/lib/assignment-progress.ts`, unit
test it against hand-derived literals (the node-only lane needs a pure
function), then render a small counter in the `WeddingWorkspace` header row
above the tabs, wired to the existing central `guests`/`assignments` state so it
is reactive to every mutation for free. Finally, verify persistence manually
with an explicit logout/login smoke against the US-03 acceptance criteria.

## Phase 1: Progress Counter

### Overview

A pure progress-derivation helper with unit coverage, surfaced as an
always-visible header counter with a completion state and a "0 / 0" empty state.

### Changes Required:

#### 1. Pure progress helper

**File**: `src/lib/assignment-progress.ts` (new)

**Intent**: Derive the wedding-wide progress numbers in one place so both the UI
and the unit test share a single source of truth, and so the "progress is
independent of conflict validation" guarantee is expressed in testable logic
rather than buried in JSX.

**Contract**: `computeProgress(guests: Guest[], assignments: Assignment[]):
{ assigned: number; total: number; isComplete: boolean }`. `assigned =
assignments.length`; `total = guests.length`; `isComplete = total > 0
&& assigned === total`. Pure, no dependency on `Conflict`/`Violation` — that
independence is the load-bearing invariant. Keep the file single-purpose and
export only `computeProgress` (lessons: small single-purpose files).

#### 2. Counter unit test

**File**: `src/lib/assignment-progress.test.ts` (new)

**Intent**: Lock the derivation and its edges following the `adjacency.test.ts`
pattern (§6.1): node env, explicit `import { describe, it, expect }`, camelCase
fixtures from `src/types.ts`, hand-derived literal expectations (oracle
discipline — never snapshot the function's own output).

**Contract**: Cases — no guests → `{0, 0, false}`; guests entered but none
seated → `assigned 0`, `total = guests.length`, `isComplete false`; partial
seating → assigned < total, `isComplete false`; full (assigned === total,
total > 0) → `isComplete true`; **progress independent of conflicts**:
assignments that include a conflicting pair still count toward `assigned` (build
assignments that would violate a conflict and assert `assigned` is unchanged /
`isComplete` can be true). Use realistic names in fixtures (lessons: realistic
test data).

#### 3. Header counter UI

**File**: `src/components/wedding/WeddingWorkspace.tsx`

**Intent**: Show "N / M gości przypisanych" in the header row (with the wedding
name, above the tab bar at `:123-170`) so it is visible on all four tabs,
computed from the existing `guests`/`assignments` state via `computeProgress`.
Emphasise the completion state when `isComplete`.

**Contract**: Call `computeProgress(guests, assignments)` in the component body;
render the label as `{assigned} / {total} gości przypisanych` in a fixed header
slot (e.g. wrap the name block + counter in a `flex items-baseline
justify-between` row). Apply an emphasis class only when `isComplete` (e.g. a
green/bold token via `cn()`), plain otherwise. Empty wedding (no guests) shows
"0 / 0" (no conditional hiding). No new props — derive from existing state. UI copy in
Polish. Keep it inline in the header or as a tiny local presentational piece;
do not thread new state.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:run`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Counter is visible in the header on all four tabs (Stoły / Goście /
      Konflikty / Rozsadzanie)
- N increments on assignment and decrements on unassign / table shrink+delete;
      M increments when a guest is added and decreases when a guest is deleted
      (deleting a seated guest drops both N and M)
- With no guests the counter reads "0 / 0"
- When every entered guest has a seat (N === M, M > 0) the counter is visually
      emphasised; it is not emphasised at "0 / 0"
- Seating a conflicting pair on adjacent seats still counts toward N (e.g.
      reaches "M / M") while the violations list grows separately — progress is
      independent of validation

**Implementation Note**: After Phase 1 automated verification passes, pause for
manual confirmation before Phase 2.

---

## Phase 2: Persistence Verification

### Overview

No code. An explicit manual logout → login smoke proving the full plan state
persists, closing US-03's acceptance criteria and the roadmap S-05 risk
(skipping the explicit round-trip check). The automated version is owned by test
rollout Phase 3.

### Changes Required:

#### 1. Manual persistence smoke (no code)

**File**: — (verification only; documented in this plan's Testing Strategy)

**Intent**: Prove that assignments, conflicts, and tables are identical after a
session boundary, since nothing is stored client-side and everything is
re-loaded server-side in `wedding.astro`.

**Contract**: The manual steps in Testing Strategy below. If any state differs
after login, stop and file it — do not close the phase.

### Success Criteria:

#### Automated Verification:

- Existing suite still green (no regressions): `npm run lint` and
      `npm run test:run`

#### Manual Verification:

- Set up a wedding with ≥2 tables, several guests, ≥1 conflict pair, and
      several assignments (including one seated conflicting pair); record N/M,
      the conflict count K, and the table layout
- Log out ("Wyloguj się") and log back in as the same operator
- After login: N assigned equals N before, each guest on the same seat; the
      counter shows the same "N / M"
- After login: the same K conflicts are present, and the same violations (if
      any) are flagged on the seating board
- After login: all tables are unchanged (names, seat counts, seat numbering)

**Implementation Note**: The **automated** logout/login DB round-trip is Risk #6
and is owned by test rollout Phase 3 (`context/foundation/test-plan.md` §3);
this phase deliberately does not duplicate it.

---

## Testing Strategy

### Unit Tests:

- `src/lib/assignment-progress.test.ts` — `computeProgress` edges and the
  progress-independent-of-validation invariant (see Phase 1 §2). Follows
  `adjacency.test.ts` / test-plan §6.1; run with `npm run test:run`.

### Integration Tests:

- None in this slice. The automated logout/login DB round trip (Risk #6) is
  owned by test rollout Phase 3 per `context/foundation/test-plan.md` §2–§3.

### Manual Testing Steps:

1. Create a wedding; add 2 tables (e.g. 4 and 6 seats → M = 10), 5 guests, and 1
   conflict pair.
2. Assign several guests; confirm the header counter tracks each assignment
   (e.g. "3 / 10 gości przypisanych").
3. Seat the conflicting pair on adjacent seats; confirm the counter still counts
   them (progress independent of validation) while the violation is flagged.
4. Fill every seat; confirm the counter reads "10 / 10" and is emphasised.
5. Log out via "Wyloguj się", then log back in as the same operator.
6. Verify: same N/M, same guests on same seats, same conflict(s) and
   violation(s), all tables unchanged.

## Performance Considerations

`computeProgress` only reads the length of two lists (`guests` and
`assignments`) — a constant-cost operation that does not depend on how many
guests there are, recomputed on each render. Negligible at wedding scale; no
memoization needed.

## Migration Notes

None. This slice ships no migration and no schema change; persistence is already
provided by F-01/S-03.

## References

- Roadmap slice: `context/foundation/roadmap.md` → S-05
  (`assignment-progress-and-persistence`)
- PRD: US-03 (`context/foundation/prd.md:82-97`), FR-024, NFR "Trwałość stanu
  planu"
- Test plan: `context/foundation/test-plan.md` §2 (Risk #6), §3 (Phase 3 owns
  the automated round trip), §6.1 (unit-test cookbook)
- Prior slice this builds on: S-03
  `context/archive/2026-08-22-assignment-with-realtime-conflict-validation/`
- Header region: `src/components/wedding/WeddingWorkspace.tsx:123-170`;
  reference unit test: `src/lib/adjacency.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Progress Counter

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:run` — faeb6e7
- [x] 1.2 Type checking passes: `npx astro check` — faeb6e7
- [x] 1.3 Linting passes: `npm run lint` — faeb6e7
- [x] 1.4 Production build succeeds: `npm run build` — faeb6e7

#### Manual

- [x] 1.5 Counter visible in the header on all four tabs — faeb6e7
- [x] 1.6 N tracks assign / unassign / table shrink+delete; M tracks guest add / delete — faeb6e7
- [x] 1.7 With no guests the counter reads "0 / 0" — faeb6e7
- [x] 1.8 Counter emphasised when N === M and M > 0; not emphasised at "0 / 0" — faeb6e7
- [x] 1.9 Seating a conflicting pair still counts toward N while violations list grows separately — faeb6e7

### Phase 2: Persistence Verification

#### Automated

- [x] 2.1 Existing suite still green: `npm run lint` and `npm run test:run` — a50b674

#### Manual

- [x] 2.2 Seed wedding (≥2 tables, several guests, ≥1 conflict, several assignments incl. a seated conflicting pair); record N/M, K, layout — a50b674
- [x] 2.3 Log out and log back in as the same operator — a50b674
- [x] 2.4 After login: same N/M, each guest on the same seat — a50b674
- [x] 2.5 After login: same K conflicts and same flagged violations — a50b674
- [x] 2.6 After login: all tables unchanged (names, seat counts, seat numbering) — a50b674
