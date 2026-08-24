---
date: 2026-08-22T13:18:05+02:00
researcher: Agata Ludwiczyńska
git_commit: 670cdc996231173d9edf78f770567f858b3cc81d
branch: feat/assignment-with-realtime-conflict-validation
repository: table-planner
topic: "Is @atlaskit/pragmatic-drag-and-drop compatible with our codebase, and is S-03 ready to plan against it?"
tags: [research, codebase, s-03, drag-and-drop, assignments, conflict-validation, react-19, astro-ssr]
status: complete
last_updated: 2026-08-22
last_updated_by: Agata Ludwiczyńska
---

# Research: pragmatic-drag-and-drop compatibility + S-03 readiness

**Date**: 2026-08-22T13:18:05+02:00
**Researcher**: Agata Ludwiczyńska
**Git Commit**: 670cdc996231173d9edf78f770567f858b3cc81d
**Branch**: feat/assignment-with-realtime-conflict-validation
**Repository**: table-planner

## Research Question

Review the codebase and decide whether `context/changes/assignment-with-realtime-conflict-validation/pragmatic-drag-and-drop-api-reference.md` (the `@atlaskit/pragmatic-drag-and-drop` element-adapter API surface) is compatible with our stack, in service of implementing **S-03** (`assignment-with-realtime-conflict-validation`) from `context/foundation/roadmap.md`. Scope: DnD compatibility **and** full S-03 readiness mapped against the existing code. Library facts verified against live Context7 docs.

## Summary

**Verdict: compatible.** `@atlaskit/pragmatic-drag-and-drop` fits React 19 + Astro 6 islands + Cloudflare Workers SSR, with **one implementation rule** to follow: attach the adapter inside `useEffect` (ideally via a deferred dynamic `import()`), never at module top-level, so nothing DnD-related executes during server render. The React 19 peerDep concern the reference doc flagged as open **resolves favorably** — the core element adapter has no React peer dependency at all, and the optional companion packages already include React 19 in their supported range.

The rest of S-03 is well-supported by established patterns, with exactly one greenfield persistence gap and one greenfield algorithm:

- **DB:** no `assignments` table exists yet — must be created. The RLS + unique-constraint + revoke-anon + FK-index pattern to copy is fully established across F-01 and S-02. `change.md:25` already locks the design (one row per guest, `unique(guest_id)`, `unique(seat_id)`, upsert-on-move).
- **API/service:** the endpoint → service → `ServiceResult` → error-catalog pattern is uniform across four existing resources and directly reusable; a new `assignment.service.ts` + `/api/assignments.ts` slots straight in.
- **UI mounting:** `WeddingWorkspace.tsx` is a single `client:load` island already holding `tables`/`guests`/`conflicts` in state — adding an assignment board as a new tab gives instant in-memory re-validation for free.
- **Validation:** the ring-adjacency algorithm and its Polish warning copy are entirely greenfield (no geometry/modulo helper exists), but conflict canonical-ordering is already solved in `conflict.service.ts`.

## Detailed Findings

### A. DnD library compatibility (verified against live Context7 docs)

Library ID `/atlassian/pragmatic-drag-and-drop` (High reputation, 643 snippets). Three facts verified:

1. **React 19 / peerDeps — non-issue for what we use.** The **core** package (`@atlaskit/pragmatic-drag-and-drop`, the `/element/adapter` we import) is framework-agnostic and "has no dependency on any view library (e.g., React)". So React 19 never enters the peerDep resolution for the core adapter. The optional companion packages (`react-drop-indicator`, `react-accessibility`) *do* declare a React peer dependency and **already list React 19 in their supported range** (documented as supported-but-not-directly-tested — small residual risk, raise a GitHub issue if hit). The only package that genuinely rejects React 19 is `react-beautiful-dnd-migration`, which our reference doc does **not** use. → The open follow-up in the reference doc (`pragmatic-drag-and-drop-api-reference.md:14`) is resolved: peerDeps will resolve cleanly without `--legacy-peer-deps` for the core adapter.

2. **SSR safety — safe, with a rule.** Atlassian's own React guidance attaches behavior inside `useEffect` (which never runs during SSR), and ships a first-class **deferred-loading recipe**: dynamically `import()` the adapter inside the effect, guarded by an `AbortController`. Because Astro renders `client:load` islands on the Cloudflare server first, the SSR-safe rule is: **do not top-level-import `/element/adapter`** (as the reference doc's snippets currently show at lines 60, 79, 115) — import it dynamically inside the effect, or at minimum keep all `window`/`document` access inside effects/handlers. This guarantees the server pass never touches browser globals.

3. **API surface matches.** `draggable`, `dropTargetForElements`, `monitorForElements`, `combine`, `getInitialData`, `canDrop`, `getData` all confirmed current — the reference doc's API surface is accurate.

### B. React island mounting & data flow (`src/pages/wedding.astro`, `WeddingWorkspace.tsx`)

- `wedding.astro:13-29` fetches all domain data server-side (SSR) via services in a `Promise.all` (`listTables`/`listGuests`/`listConflicts` + `getOrCreateWedding`), then passes them as `initial*` props to a **single island** mounted `client:load` at `wedding.astro:65-77`. No client fetch on mount.
- `WeddingWorkspace.tsx` (default export, ~280 lines) is the **only** `client:*` island on the page. It seeds `useState` from props (`:50-54`), owns a tab state machine (`TABS` at `:14-18`, `role="tablist"` at `:160-180`), and renders `GuestsTab`/`ConflictsTab` as **children of the same island** (not separate islands). Cross-entity consistency is handled in the parent (e.g. deleting a guest prunes referencing conflicts, `:121-124`).
- **Data-refresh pattern (critical for S-03):** mutations go through `useApiMutation` (`src/components/hooks/useApiMutation.ts`, a `useState` fetch wrapper returning the authoritative row or `null`); children lift the returned row to parent callbacks; parent updates its `useState` arrays functionally (e.g. `setGuests((prev) => [...prev, data])`). **No refetch, no page reload.** New state is available synchronously in the client the moment a mutation resolves — exactly what "instant re-validation after each assignment" needs.
- **No `useEffect`/`useRef`/DOM access exists anywhere in `src/components` yet** (grep-confirmed; only `e.currentTarget.blur()` in a handler at `WeddingWorkspace.tsx:147`). pragmatic-drag-and-drop's `useRef` + `useEffect(cleanup)` would be the first in the codebase.
- **ESLint tolerance:** `react-hooks` recommended + `react-compiler/react-compiler: "error"` (`eslint.config.js:56,58`) do **not** block effects/refs — they forbid conditional hooks, prop mutation, impure render. The canonical DnD pattern (ref for element + effect returning the library cleanup, correct deps) is compliant. `exhaustive-deps` will require accurate dependency arrays.
- **No `client:only` anywhere** (only three `client:load` hits: `wedding.astro:69`, `auth/signin.astro:16`, `auth/signup.astro:16`). Plain `client:load` is correct for the board — SSR renders the markup, the effect binds DnD only in the browser.

**Recommended mounting:** add a `"seating"` entry to the `TABS` array and render `<AssignmentBoard tables guests conflicts ... />` inside `WeddingWorkspace` as a new tab. Because the parent already holds `tables`/`guests`/`conflicts` in state, the board re-validates against live in-memory data with zero extra fetches. (A sibling island in `wedding.astro` is possible but duplicates state and loses shared validation.)

### C. Database layer readiness (migrations + generated types)

- **No `assignments` table, no `seat_id`/assignment artifact exists** — grep across `.ts/.tsx/.astro/.sql` found only planning docs. Clean slate.
- **`seats` identity:** PK is `seats.id uuid` (F-01 `seats:27`); `seat_number int` is unique only within a table via `unique (table_id, seat_number)` (`seats:29,31`). **Always key assignments off `seats.id`, never `seat_number`.**
- **`seats` has no `wedding_id`** — ownership is a two-join chain `seats → tables → weddings.user_id` (`seats_select` policy, F-01:98-104). To keep the RLS owner policy a single join (like `guest_conflicts`), **denormalize `wedding_id` onto `assignments`** and have the service validate that both `guest_id` and `seat_id` belong to that wedding before writing (matches `change.md:25`).
- **RLS pattern to copy (both migrations):** `enable row level security`; `revoke all on <tables> from anon`; no anon policies (default-deny); every policy `to authenticated`, per-operation; `auth.uid()` always wrapped as `(select auth.uid())`; ownership via `exists (select 1 from weddings w where w.id = wedding_id and w.user_id = (select auth.uid()))`. This also matches `lessons.md` ("RLS migrations: revoke anon grants + `(select auth.uid())`").
- **Invariant enforcement (S-03 "max 1 guest/seat, max 1 seat/guest"):** two unique constraints on the assignments row:
  ```sql
  create table assignments (
    id uuid primary key default gen_random_uuid(),
    wedding_id uuid not null references weddings (id) on delete cascade,
    guest_id  uuid not null references guests (id)  on delete cascade,
    seat_id   uuid not null references seats (id)   on delete cascade,
    created_at timestamptz not null default now(),
    unique (guest_id),   -- max 1 seat per guest  (also the upsert onConflict target)
    unique (seat_id)     -- max 1 guest per seat
  );
  create index on assignments (wedding_id);
  -- guest_id / seat_id already indexed by their unique constraints
  ```
- `on delete cascade` on all three FKs delivers "unassign on guest delete" (FR-012) and S-04 seat-removal cleanup for free.
- **Conflict canonical ordering** (feeds validation): `guest_conflicts` stores pairs with `check (guest_a_id < guest_b_id)` + `unique (guest_a_id, guest_b_id)` (S-02:28-29). Adjacency validation must order the two adjacent guest ids (`least/greatest`) before matching against `conflicts`.
- **After the migration:** run `npm run db:types` and commit `src/db/database.types.ts` (CLAUDE.md rule). Read `docs/reference/rls-verification-protocol.md` before writing the migration.

### D. API + service + validation pattern (reusable skeleton)

- **Routing model:** every domain resource is one flat file in `src/pages/api/`, one handler per HTTP verb, target `id` in the **JSON body** (no `[id].ts` dynamic routes, no GET endpoints). Reads are server-side in `wedding.astro`, not fetched.
- **Invariant endpoint sequence** (canonical: `tables.ts:24-53`): `export const prerender = false` → `createClient(...)` + null guard (`apiErrorFrom("supabase_unconfigured")`) → `locals.user` guard (`apiErrorFrom("unauthorized")`) → `await request.json()` in try/catch (`apiError("validation_error", "Nieprawidłowe dane.", 400)`) → zod `safeParse` surfacing only `issues[0].message` → for wedding-scoped creates resolve the wedding server-side via `getWedding` (never trust a client wedding id) → call service → `apiFailure(result)` / `apiSuccess(data, status)`.
- **Zod schemas live in the endpoint file** (not the service, not shared). Services take already-parsed typed inputs and return `ServiceResult<T>`.
- **Service pattern:** private `toX(row)` snake→camel mapper, query, translate errors (`23505`→uniqueness, `42501`→forbidden, `22023`→invalid), `.maybeSingle()` + not-found check, `success(toX(...))`. Services never throw for expected failures — they `failure("code")`, and every code must exist in `src/lib/errors.ts` first.
- **Envelope:** success `{ data }`, error `{ error: { code, message } }` (`src/lib/api.ts`). `ServiceFailure` maps 1:1 to the HTTP error via `apiFailure` — no re-mapping.
- **Route registry:** add `apiAssignments: "/api/assignments"` to `ROUTES` in `src/lib/routes.ts` (`lessons.md`: no hardcoded path literals).
- **New error codes** to register in `errors.ts` (Polish messages): e.g. `seat_not_found`, `seat_occupied`, `guest_already_seated`, `assignment_not_found`.

> Divergence to note: one research agent sketched an assignment skeleton assuming a `guest_id` column added to `seats`. **We do not do that** — `change.md:25` locks a separate `assignments` table with upsert-on-move. The endpoint/service *pattern* above still applies verbatim; only the table and query change.

### E. Types & validation home (`src/types.ts`, `src/lib/`)

- **Naming convention** (matches memory): `Row` suffix for raw DB rows (`SeatRow`, `GuestRow`, `GuestConflictRow`, aliased from generated types), clean camelCase for domain/API shapes (`Table`, `Guest`, `Conflict`), `...Input` for request bodies. No `Dto`/`Command`.
- Existing shapes: `Table { id, name, seatCount }` (`types.ts:21-25`), `Guest { id, firstName, lastName, side, group }` (`:34-40`), `Conflict { id, guestAId, guestBId }` (`:43-47`). **No `Seat` domain type and no seat service exist** — seats are never sent to the client today; S-03 introduces the first seat-facing surface.
- New types to add: an `Assignment` domain shape and an `AssignSeatInput` / `AssignGuestInput` request body.
- **Adjacency validation is greenfield** — no geometry/modulo/ring/adjacency helper anywhere in `src/` (grep-confirmed; only CSS `--ring` tokens). It's a **pure function** (no Supabase) → belongs in `src/lib/` (e.g. new `src/lib/adjacency.ts`), not `src/lib/services/` (those take a `SupabaseClient`).
- **UI copy is Polish** (confirmed across `ConflictsTab.tsx`, `GuestsTab.tsx`, `errors.ts`, `utils.ts` `pl-PL`) — S-03 conflict-warning strings must be Polish, and the code/docs themselves English per the repo convention.

## Code References

- `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql:26-32,98-104` — `seats` schema (no `wedding_id`) + two-join RLS
- `supabase/migrations/20260819172911_guests_and_conflicts.sql:22-30` — `guest_conflicts` canonical-order check + unique
- `src/pages/wedding.astro:13-29,65-77` — SSR data fetch + `client:load` island mount
- `src/components/wedding/WeddingWorkspace.tsx:14-18,50-54,121-130` — tab machine, prop-seeded state, functional-update refresh
- `src/components/hooks/useApiMutation.ts` — fetch wrapper returning authoritative row / null
- `src/pages/api/tables.ts:24-53` — canonical endpoint sequence
- `src/lib/services/result.ts`, `src/lib/api.ts`, `src/lib/errors.ts`, `src/lib/routes.ts:9-12` — Result/envelope/error-catalog/route registry
- `src/lib/services/conflict.service.ts:28-46` — canonical-order + duplicate handling to reuse for adjacency lookups
- `src/types.ts:5-47,52-99` — naming convention + existing shapes + envelope types
- `src/lib/utils.ts`, `src/db/database.types.ts:121-149` — `cn()`/`formatDate()`; `seats.Row` confirming no `guest_id`
- `eslint.config.js:56,58` — react-hooks recommended + react-compiler error (tolerates effects/refs)

## Architecture Insights

- The app is **SSR-read, API-write, in-memory-refresh**: pages load data server-side into a `client:load` island; mutations POST/PATCH/DELETE and update island state from the returned row. S-03's real-time validator fits this perfectly — validation is a pure client computation over already-loaded `conflicts` + the freshly-returned assignment, no round-trip for the UI reaction.
- **Two-layer validation** (per `change.md:18`): client computes adjacency instantly for UX; server enforces the invariant at commit (DB unique constraints + service membership checks) as the guardrail. Both must agree on the ring model.
- The persistence design deliberately avoids a SECURITY DEFINER RPC (unlike `create_table_with_seats`): single-row assignment + `upsert(onConflict: guest_id)` makes "move to empty seat" atomic without a transaction, reusing the `conflict.service.ts` membership-validation pattern with less definer surface (`change.md:25`).

## Historical Context (from prior changes)

- `context/foundation/lessons.md` — "RLS migrations: revoke anon grants + `(select auth.uid())`" and "Centralize app paths in a route registry" both directly constrain the S-03 migration and the new `apiAssignments` route.
- `context/archive/2026-08-17-guest-and-conflict-management/` (S-02) — established the canonical-order conflict pattern and the guest/conflict services this slice validates against.
- `change.md:22-25` — planning decisions already locked during a paused `/10x-plan`: move-to-empty-seat allowed (swap of two occupied seats stays Non-Goal); separate `assignments` table with upsert-on-move.
- `pragmatic-drag-and-drop-api-reference.md` — companion to `dnd-review-session.md`, which already selected the library; this research **verifies** that selection rather than re-opening it. (The `change.md:29` "@dnd-kit vs native vs hand-rolled" question is therefore already answered by the review session — pragmatic-drag-and-drop won.)

## Related Research

- `context/changes/assignment-with-realtime-conflict-validation/dnd-review-session.md` — library selection rationale
- `context/changes/assignment-with-realtime-conflict-validation/pragmatic-drag-and-drop-api-reference.md` — API surface (verdict section appended by this research)

## Open Questions

- **Deferred vs static import of the adapter.** Verdict recommends dynamic `import()` inside `useEffect` for guaranteed SSR safety; a plain top-level import *may* also be safe if the module has no import-time `window` access, but the deferred recipe is the documented, guaranteed-safe path. Decide at plan time (bundle-splitting is a bonus of deferred).
- **`client:load` vs `client:visible`** for the board — `client:load` matches convention; `client:visible` defers the DnD bundle until scroll. Minor; pick during planning.
- **Perf target** (PRD Open Question #1) stays an impl-level unknown — guidance: incremental re-validation of changed seats + their two neighbors only.
- **2-seat ring edge case** — with 2 seats, N−1 and N+1 modulo 2 collapse to the same neighbor; validation must not double-count. Must be covered by the "validation never stays silent" acceptance test.
- **Keyboard a11y / touch** for DnD — the click fallback (owned by us, not the library) covers the baseline; whether to add pragmatic-drag-and-drop's optional a11y companion package is a plan-time call (it's one of the React-peer-dep packages, already React-19-ranged).
