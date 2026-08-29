---
date: 2026-08-29T09:23:25+0200
researcher: Agata Ludwiczyńska
git_commit: ea5d137f5085708aa1188e3fb41259472efd99ca
branch: test/add-test-coverage
repository: table-planner
topic: "Test rollout Phase 1 — ground the adjacency-conflict guardrail (Risk #1) and the Vitest bootstrap"
tags: [research, codebase, adjacency, conflict-validation, vitest, testing]
status: complete
last_updated: 2026-08-29
last_updated_by: Agata Ludwiczyńska
---

# Research: Test rollout Phase 1 — adjacency-conflict guardrail + Vitest bootstrap

**Date**: 2026-08-29T09:23:25+0200
**Researcher**: Agata Ludwiczyńska
**Git Commit**: ea5d137f5085708aa1188e3fb41259472efd99ca
**Branch**: test/add-test-coverage
**Repository**: table-planner

## Research Question

Phase 1 of the test rollout (`context/foundation/test-plan.md` §3) stands up the test
runner (Vitest) and locks Risk #1: *two "nie obok" guests sit adjacent but no red flag
appears — the guardrail silently fails (false-negative).* Per §2 Risk Response Guidance,
research must ground, against current code:

1. the **ring-wrap formula** (seat 1 ↔ seat max) and the **2-seat degenerate** table;
2. **conflict-pair canonical ordering** — is `(A,B)` guaranteed to equal `(B,A)`?;
3. **where adjacency is computed** — client, server, or both — and whether one shared
   function or two implementations that can drift;
4. how a **violation maps back to two seats**;
5. the **toolchain facts** needed to stand up Vitest (0 test files today).

## Summary

**One pure client-side function is the entire guardrail, and it currently has zero
automated coverage.** Adjacency + conflict-violation computation lives in a single
Supabase-free module, `src/lib/adjacency.ts`, called from exactly one place
(`AssignmentBoard.tsx`). There is **no** server-side or SQL re-implementation, so the
challenger question "do client and server adjacency implementations drift?" resolves to
**no — there is only one implementation** (the server enforces only the one-guest-per-seat
*invariant*, never the adjacency/conflict rule). This makes the risk sharper, not softer:
the zero-false-negative guardrail (`prd.md:55`, FR-021) rests entirely on this untested
pure function, protected today only by manual verification (deferred as follow-up **F6**).

Key groundings for building a by-hand oracle:

- **Ring wrap**: `seatB = seats[(i + 1) % seatCount]` — the last seat wraps to the first.
- **2-seat degenerate**: handled explicitly — `edgeCount = seatCount === 2 ? 1 : seatCount`
  caps iterations so the single edge is counted once (not twice).
- **Canonical pairing**: enforced at *three* layers — DB `check (guest_a_id < guest_b_id)`
  + `unique`, service-side sort before insert, and a defensive `pairKey(a,b)` in the
  validator that normalizes lookups. `(A,B) == (B,A)` is guaranteed.
- **Violation shape** carries both seat ids and both guest ids, so the two-seat mapping is
  direct, no re-lookup.
- **Vitest**: greenfield (0 tests). Vitest 3.x line (pinned `vite: ^7.3.2`), needs the
  `@/*` → `./src/*` alias; `adjacency.ts` imports only *types*, so it unit-tests with no
  Astro/Cloudflare boot.

## Detailed Findings

### 1. The adjacency / violation function — `src/lib/adjacency.ts` (single source of truth)

The module exports two pure functions and one private key helper. There is **no**
boolean `isAdjacent(a,b,n)` helper — adjacency is expressed implicitly by iterating ring
edges.

`validateTable` — the per-table ring core (`src/lib/adjacency.ts:13-40`):

```ts
export function validateTable(
  table: Table,
  assignmentBySeatId: Map<string, string>,
  conflictSet: Set<string>,
): Violation[] {
  const seats = table.seats;
  const seatCount = seats.length;
  if (seatCount < 2) return [];
  const violations: Violation[] = [];
  // A 2-seat ring has a single edge (0–1); the general loop would visit it twice, so cap iterations at 1.
  const edgeCount = seatCount === 2 ? 1 : seatCount;
  for (let i = 0; i < edgeCount; i++) {
    const seatA = seats[i];
    const seatB = seats[(i + 1) % seatCount];
    const guestA = assignmentBySeatId.get(seatA.id);
    const guestB = assignmentBySeatId.get(seatB.id);
    if (!guestA || !guestB) continue;
    if (!conflictSet.has(pairKey(guestA, guestB))) continue;
    violations.push({
      tableId: table.id, guestAId: guestA, guestBId: guestB,
      seatAId: seatA.id, seatBId: seatB.id,
    });
  }
  return violations;
}
```

The private canonical key (`src/lib/adjacency.ts:4-6`):

```ts
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
```

`validateAllTables` — the intended entry point (`src/lib/adjacency.ts:43-47`):

```ts
export function validateAllTables(tables: Table[], assignments: Assignment[], conflicts: Conflict[]): Violation[] {
  const assignmentBySeatId = new Map(assignments.map((a) => [a.seatId, a.guestId]));
  const conflictSet = new Set(conflicts.map((c) => pairKey(c.guestAId, c.guestBId)));
  return tables.flatMap((table) => validateTable(table, assignmentBySeatId, conflictSet));
}
```

**Ring order comes from the data layer, not the seat number directly.** Adjacency is over
the `table.seats` *array index order*. Seats are pre-sorted ascending by `seat_number` by
the server query (`src/lib/services/table.service.ts:27`):
`.order("seat_number", { ascending: true, referencedTable: "seats" })`, selected via
`TABLE_COLUMNS = "id, name, seat_count, seats(id, seat_number)"` (`table.service.ts:6`) and
mapped to `{ id, seatNumber }` (`table.service.ts:17`). So array index `i` ⇔ the i-th
smallest `seat_number`. **A unit test must construct `table.seats` in ascending
`seat_number` order to mirror production** (or the ring geometry won't match).

### 2. Ring-wrap and the 2-seat degenerate case — the guardrail-sensitive lines

- **Wrap**: `seats[(i + 1) % seatCount]` (`adjacency.ts:26`). For the general case
  `edgeCount === seatCount`, so at `i === seatCount-1`, seatB index is `0` — last seat
  adjacent to first (seat 1 ↔ seat N).
- **2-seat**: `edgeCount = seatCount === 2 ? 1 : seatCount` (`adjacency.ts:23`). With N=2 the
  general loop would emit (0,1) at i=0 and (1,0) at i=1 — the same pair twice. Capping to 1
  edge counts it once.
- **N < 2 guard**: `if (seatCount < 2) return [];` (`adjacency.ts:20`) — 0/1 seat yields no
  edges.

**By-hand oracle rules (derived from the literal code, not the implementation output):**

| Seat count N | Edges (0-based index pairs) | Notes |
|---|---|---|
| N < 2 | none | empty result |
| N = 2 | `(0,1)` only | counted once — the double-count guard |
| N ≥ 3 | `(i, (i+1) mod N)` for i = 0..N-1 | N edges **including** the wrap edge `(N-1, 0)` |

A violation fires for an edge only when **both** seats are occupied **and** the occupying
guest pair is in `conflictSet` (compared order-independently via `pairKey`).

### 3. Client vs server — CLIENT ONLY (challenger question resolved)

- **Sole caller**: `src/components/wedding/AssignmentBoard.tsx:7`
  (`import { validateAllTables } from "@/lib/adjacency";`) and
  `AssignmentBoard.tsx:37` (`const violations = validateAllTables(tables, assignments, conflicts);`).
  Comment at `AssignmentBoard.tsx:36`: *"Pure re-derivation on every render…"* — this is
  what "real-time" means (the pure function re-runs synchronously each React render as the
  operator drags; optimistic local state feeds fresh props in).
- **Server does NOT compute adjacency.** `src/pages/api/assignments.ts` imports only
  `assignSeat` / `unassign` from `assignment.service.ts` — no `adjacency`/`validate`/conflict
  import. The service enforces guest+seat membership and relies on DB `unique(seat_id)` /
  `unique(guest_id)` for the **invariant** (≤1 guest/seat, ≤1 seat/guest) — it never
  re-checks the conflict rule.
- **SQL / migrations do NOT compute adjacency.** The three migrations define schema + RLS
  only; no function, trigger, or view computes neighbors or violations.

**Conclusion for the plan**: the folded-in candidate risk "client vs server adjacency
divergence" (test-plan §2) is *confirmed moot* — there is one implementation. The plan
should NOT spend effort testing server/client parity for adjacency; it should instead treat
`adjacency.ts` as the single point whose failure is invisible until an operator eyeballs the
ring.

### 4. Violation → two-seats mapping and the surfaced red flag

`Violation` shape (`src/types.ts:64-71`):

```ts
export interface Violation {
  tableId: string;
  guestAId: string;
  guestBId: string;
  seatAId: string;
  seatBId: string;
}
```

Each violation carries **both** seat ids and **both** guest ids — mapping back to the two
offending seats is direct, no re-lookup. Note: `guestAId`/`guestBId` here are in **adjacency
order** (seat `i` vs seat `i+1`), *not* canonical UUID order — a test asserting the flagged
pair should compare as an unordered set, not positionally.

How it surfaces in the UI (`AssignmentBoard.tsx`):
- `:38` — `violatingSeatIds = new Set(violations.flatMap((v) => [v.seatAId, v.seatBId]))`.
- `:119-138` — red banner *"Naruszone konflikty sąsiedztwa (N)"* listing each pair.
- `:149` — `violatingSeatIds` passed to `<TableRing>` to paint the offending seats red.

### 5. Conflict-pair storage & canonical ordering (three enforcement layers)

Table `guest_conflicts` (`supabase/migrations/20260819172911_guests_and_conflicts.sql:22-30`):

```sql
create table guest_conflicts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings (id) on delete cascade,
  guest_a_id uuid not null references guests (id) on delete cascade,
  guest_b_id uuid not null references guests (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (guest_a_id < guest_b_id),
  unique (guest_a_id, guest_b_id)
);
```

1. **DB**: `check (guest_a_id < guest_b_id)` + `unique (guest_a_id, guest_b_id)` — makes
   `(A,B)`/`(B,A)` impossible (UUIDs compare lexicographically in Postgres).
2. **Service**: `src/lib/services/conflict.service.ts:31` sorts before insert —
   `const [lo, hi] = guestAId < guestBId ? [guestAId, guestBId] : [guestBId, guestAId];`.
3. **Validator**: `pairKey` normalizes both the stored conflict *and* the seated pair, so
   lookup is order-agnostic regardless.

**Test-design consequence**: a conflict stored as `(A,B)` must still fire when the guests are
seated in the opposite adjacency order — assert a violation in *both* seatings. This is a
place a naive re-implementation would silently miss a flag.

### 6. Vitest bootstrap — greenfield, and what the runner must reconcile

- **Zero existing tests / config**: no `*.test.*` / `*.spec.*`, no `__tests__`, no
  `vitest.config.*` / `vite.config.*`, no `test` script, no `vitest`/`jsdom`/`happy-dom`/
  `@testing-library/*` in `package.json`.
- **Vite pin**: `package.json:63-65` — `"overrides": { "vite": "^7.3.2" }`. Vitest **3.x**
  is the compatible line (supports Vite 7); anything older risks a duplicate-Vite / peer
  conflict. Verify current Vitest × Vite 7 × Astro 6 guidance via Context7 at plan time.
- **Alias**: `tsconfig.json:9-11` — `"@/*": ["./src/*"]` with `baseUrl: "."`. The runner must
  replicate this (dedicated `vitest.config.ts` `resolve.alias`, `vite-tsconfig-paths`, or
  Astro's `getViteConfig()` helper). `adjacency.ts` imports `@/types` (type-only), so the
  alias is the *only* thing it needs resolved.
- **No Astro/Cloudflare boot needed for the target**: `adjacency.ts` imports only
  `import type { … } from "@/types"` — erased at compile. It is pure ESM. Only
  `src/lib/supabase.ts` and `src/lib/config-status.ts` import `astro:env/server` (a virtual
  module that fails under plain Vitest); every other `src/lib/**` file — including all
  `services/*` (which import `SupabaseClient` as a *type*) — is plain-testable once the alias
  is set. **Phase 1's unit target sits entirely in the pure zone.**
- **Astro config**: `astro.config.mjs` is `output: "server"`, adapter `cloudflare()`, Vite
  pass-through only `plugins: [tailwindcss()]` — no `resolve.alias` there to inherit.
- **Lint on test files**: `eslint.config.js` applies `strictTypeChecked` +
  `stylisticTypeChecked` with `projectService: true` to all `.ts`/`.tsx` (no test override
  yet). Test files match `tsconfig` `"**/*"` so they're type-checked; they'll be run through
  `eslint --fix` on commit (lint-staged glob `*.{ts,tsx,astro}`, `package.json:66-73`). Plan
  should decide whether test globals (`describe`/`it`/`expect`) come from Vitest's
  `globals: true` (+ an ESLint/tsconfig types entry) or explicit imports to stay clean under
  strict lint.

### 7. Fixture shapes for the unit oracle (exact type contracts)

The domain shapes a `validateAllTables` fixture must construct, quoted verbatim from
`src/types.ts` (camelCase domain shapes, not the snake_case `*Row` aliases):

```ts
interface Seat        { id: string; seatNumber: number; }                                 // types.ts:22-25
interface Table       { id: string; name: string; seatCount: number; seats: Seat[]; }      // types.ts:28-33
interface Assignment  { id: string; guestId: string; seatId: string; }                     // types.ts:36-40
interface Conflict    { id: string; guestAId: string; guestBId: string; }                  // types.ts:58-62
interface Violation   { tableId; guestAId; guestBId; seatAId; seatBId; }                    // types.ts:65-71 (all string)
```

**Fixture gotchas for the plan:**
- **`Assignment` has three fields**, not two — `{ id, guestId, seatId }`. `validateAllTables`
  only reads `seatId`/`guestId` (`adjacency.ts:44`), but a *typed* fixture must still supply
  `id`; either populate it or build via a typed factory. (Earlier prose in §1 abbreviates it
  to `{ seatId, guestId }` — that is the function's *read set*, not the full type.)
- **`Table.seatCount` is independent of `seats.length`** in the type — the validator trusts
  `seats.length`, never `seatCount`. A faithful fixture keeps them consistent, but a
  deliberate-mismatch case (`seatCount: 8`, `seats.length: 2`) is a cheap way to prove the
  function ignores `seatCount`.
- **`Violation` field order is adjacency order, not canonical UUID order** (see §4) — assert
  the flagged pair as an unordered `{guestAId, guestBId}` set.
- Seats in the fixture **must be ascending by `seatNumber`** to mirror the server sort
  (§1) — array index is the ring order.

## Code References

- `src/lib/adjacency.ts:4-6` — private `pairKey` canonical unordered-pair key.
- `src/lib/adjacency.ts:13-40` — `validateTable`: ring loop, wrap, 2-seat guard, violation push.
- `src/lib/adjacency.ts:43-47` — `validateAllTables`: builds lookups, maps over tables (entry point).
- `src/lib/services/table.service.ts:6,17,27` — seats selected + sorted ascending by `seat_number` (establishes ring order).
- `src/components/wedding/AssignmentBoard.tsx:7,36-40,119-138,149` — sole caller; violation → red banner + red seats.
- `src/pages/api/assignments.ts` — server assignment path; no adjacency/conflict import (invariant only).
- `src/lib/services/conflict.service.ts:31,42-43,50` — service-side canonical ordering + duplicate detection.
- `src/types.ts:58-62,64-71` — `Conflict` and `Violation` domain shapes.
- `supabase/migrations/20260819172911_guests_and_conflicts.sql:22-30` — `guest_conflicts` table, `check` + `unique`.
- `package.json:63-65` — `vite: ^7.3.2` override (sets Vitest 3.x line).
- `tsconfig.json:9-11` — `@/*` → `./src/*` alias the runner must replicate.
- `astro.config.mjs` — `output: "server"`, cloudflare adapter, inline Vite config.
- `eslint.config.js` — `strictTypeChecked` + `stylisticTypeChecked`, `projectService: true`.
- `src/lib/supabase.ts:3`, `src/lib/config-status.ts:1` — the only `astro:env/server` importers (NOT in Phase 1 scope).

## Architecture Insights

- **Single point of failure by design.** Conflict validation is a pure, side-effect-free
  re-derivation on every render — elegant for UX immediacy (FR-021 "no Validate button"),
  but it means the zero-false-negative guardrail has exactly one code owner and no runtime
  backstop. A unit test on `validateAllTables`/`validateTable` is the cheapest and
  highest-signal protection possible — precisely the cost×signal call the test plan §1 makes.
- **Data-layer coupling.** The ring geometry is only correct because `table.service.ts`
  sorts seats by `seat_number`. The pure function trusts array order. A test that fabricates
  seats out of order would pass against a wrong oracle — so the oracle must fix seat order
  the way production does.
- **Oracle discipline.** Expected violations must be derived by-hand from ring geometry
  (the table above), never by running the implementation. The wrap edge and the 2-seat
  collapse are the two spots where a re-implementation silently drops a flag — both must be
  positive *and* the plan should include non-adjacent negatives to prove no false-positive
  explosion masks a real check.

## Historical Context (from prior changes)

- **PRD guardrail** (`context/foundation/prd.md:55`): *"Walidacja konfliktów nigdy nie
  milczy… False negatives = 0. False positives… akceptowalne."* — asymmetric tolerance:
  a missed flag is the fatal bug; a spurious flag is acceptable. This shapes the test
  emphasis toward positive (must-flag) cases.
- **FR-020** (`prd.md:147`) ring adjacency `N-1/N+1 modulo seat count`; **FR-021**
  (`prd.md:148`) immediate highlight, no Validate button; **FR-022** (`prd.md:150`) red on
  both seats + violated-pairs list. (There is no FR-023 about conflicts — FR-023 is SVG ring
  rendering.)
- **S-02** (`context/archive/2026-08-17-guest-and-conflict-management/plan.md:39-40,64,88`)
  established canonical ordering *specifically so S-03's violation count wouldn't double* —
  the ordering decision and the adjacency count are historically linked.
- **S-03** (`context/archive/2026-08-22-assignment-with-realtime-conflict-validation/`):
  `plan.md:55,272,280` and `research.md:81,121,141` document the ring model, the 2-seat
  collapse as *"the single most guardrail-sensitive line"*, and that validation is *"pure
  derivation… no round-trip."* `plan-review.md:108` (F5) explicitly flagged shipping this
  safety-critical logic with **manual verification only** as the risk window this phase now
  closes.
- **Follow-up F6** (`context/foundation/follow-ups.md:27`, status OPEN) is this exact task:
  *"Stand up a test runner (Vitest) and cover the adjacency validator… Do the pure
  `validateTable` unit test first… adjacent flags / non-adjacent doesn't / first↔last
  wrap-around / n===2 modulo-collapse counted once / n===1 empty / partial occupancy, plus
  `validateAllTables` cross-table independence."* The plan should mark F6 DONE when it lands.
- **F1** (`follow-ups.md:22`): `seat_count` is bounded 1–30 in the S-01 API Zod schema —
  so the ring test range is realistically 1..30; the 2-seat and a large-N (e.g. 30) ring are
  the meaningful edges.

## Related Research

- `context/archive/2026-08-22-assignment-with-realtime-conflict-validation/research.md` —
  original exploration of the assignment + validation slice (ring model, 2-seat edge).
- `context/foundation/test-plan.md` §2 (Risk #1 row + Risk Response Guidance) — the brief
  this research grounds.

## Open Questions

1. **Test layering for Phase 1.** The brief says "unit + integration." The unit layer is
   unambiguous (`validateAllTables`/`validateTable`, by-hand oracle). Is a DB-backed
   *integration* test warranted here, or does it belong to Phase 2/3? The violation logic
   is pure and has no DB dependency; the only DB-side fact worth asserting is that
   `guest_conflicts` really rejects a non-canonical `(B,A)` insert (the `check` constraint).
   Recommend the plan decide: keep Phase 1 unit-only on the pure function, and let the
   canonical-order constraint be asserted in Phase 2's Supabase integration suite — or add
   one thin constraint test here. (Decision for `/10x-plan`.)
2. **`validateTable` vs `validateAllTables` as the unit under test.** `pairKey` is not
   exported, so a test calling `validateTable` directly must build `conflictSet` itself
   (replicating the `a<b` keying) or go through `validateAllTables`. Recommend testing
   primarily through `validateAllTables` (the real entry point, oracle-friendly inputs:
   tables/assignments/conflicts) and dropping to `validateTable` only for the pure geometry
   edges (n=1, n=2, wrap) where hand-built maps are clearer. (Decision for `/10x-plan`.)
3. **Test globals policy** under strict type-aware ESLint — `globals: true` + a types entry,
   or explicit imports. Minor, but the plan should pick one to keep the first test file lint-
   clean. (Decision for `/10x-plan`; verify current Vitest setup via Context7.)

> **Version update (2026-08-29):** the "Vitest 3.x line" wording in §6 and the Summary is
> superseded — the pinned target is now `vitest@4.1.11` (exact pin; resolves plan-review F1).
> Full rationale (Vite 7 peer range, Node floor, advisory floor incl. the `@vitest/mocker`
> traversal fix, exact-pin supply-chain hygiene) lives in `tooling-vitest-setup.md`
> → *Addendum — version decision*.
