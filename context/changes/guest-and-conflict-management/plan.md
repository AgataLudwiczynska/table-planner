# S-02: Guest & Conflict Management — Implementation Plan

## Overview

Second domain slice. Inside the existing `/wedding` workspace, an authenticated operator can manage the wedding's **guests** (add / edit / delete — first name, last name, optional side, optional group) and define **binary conflict pairs** ("nie obok siebie") between two guests (add / list / remove). The workspace becomes tabbed: **Stoły** (S-01) / **Goście** / **Konflikty**.

This slice introduces the project's **first post-F-01 migration** — two new owner-scoped tables (`guests`, `guest_conflicts`) — and copies every layer above the DB from S-01: the `ServiceResult` pattern, the central `API_ERRORS` catalog, thin endpoints via `apiSuccess`/`apiFailure`, the `ROUTES` registry, `useApiMutation`, and the light-themed React island.

Covers FR-010, FR-011, FR-012, FR-014, FR-015, FR-016.

## Current State Analysis

- **Data layer (F-01) covers only weddings/tables/seats.** `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql` created `weddings` (owned via `user_id`), `tables` (FK `wedding_id`), `seats` (FK `table_id`), with owner-only RLS. **No `guests` or `guest_conflicts` tables exist** (`grep` of `src/db/database.types.ts` for `guests`/`conflicts` returns 0). S-02 must add them.
- **RLS + hardening pattern is established and must be copied** (`lessons.md` → "RLS migrations"): every new table does `alter table ... enable row level security`, `revoke all on <table> from anon`, and per-operation policies wrapping `auth.uid()` as `(select auth.uid())`. Owner-chain policies subquery the FK back to `weddings.user_id`; FK columns get an index (RLS evaluates the owner-chain per row). See the F-01 migration `tables_*` / `seats_select` policies as the exact template.
- **The domain-API pattern is fully in place** (from S-01, recorded in that plan's "Addendum — Established patterns"):
  - `src/lib/errors.ts` — single `API_ERRORS` map (`code → { status, message }`, Polish); `ApiErrorCode` is its key type.
  - `src/lib/services/result.ts` — `success(data)` / `failure(code)`; services return `ServiceResult<T>`, never throw for expected failures.
  - `src/lib/api.ts` — `apiSuccess(data, status?)`, `apiError`, `apiErrorFrom(code)`, `apiFailure(serviceFailure)`.
  - Endpoint flow: `createClient` null-check → `locals.user` check → parse JSON (try/catch) → `zod` `safeParse` → call service → `apiFailure` / `apiSuccess`. `src/pages/api/tables.ts` is the canonical example.
  - `src/lib/routes.ts` — `ROUTES` map; new paths added here, referenced everywhere instead of literals.
- **UI scaffolding:** `src/components/wedding/WeddingWorkspace.tsx` is the single client island (rename + add-table + table list), light "wedding" palette, uses generic `FormField`/`ServerError` (`src/components/ui/`) with an injected `FormFieldTheme`, and `useApiMutation` for fetches. `src/pages/wedding.astro` server-loads the wedding + tables and passes them as initial props. shadcn has only `button.tsx` (no dialog, no select, no command/combobox).
- **`zod` is present** (added in S-01). No dependency changes needed.
- **UI copy is Polish** (CLAUDE.md); all user-facing strings and the enum values are Polish.
- **No test runner** — S-01 verified via `astro check` + lint + manual `npm run preview`.
- **Follow-ups register** (`context/foundation/follow-ups.md`): no OPEN item targets S-02. (F1 is S-01/S-04; F2/F3 are future.) Nothing to pull in.

## Desired End State

An authenticated operator on `/wedding` sees three tabs:

1. **Stoły** — unchanged S-01 surface (rename wedding, add tables, table list).
2. **Goście** — an "add guest" form (first name + last name required; side and group optional dropdowns) that doubles as the **edit** form when a row's "Edytuj" is clicked; a list of guests showing name + side/group; each row has Edytuj / Usuń. Deleting a guest **asks for confirmation** (it also removes that guest's conflicts).
3. **Konflikty** — two **searchable** guest pickers (Gość A / Gość B) + "Dodaj konflikt"; a list of all defined conflicts showing both guests' names; each row has an **instant** "Usuń" (no confirm). Adding a self-pair or an already-defined pair is rejected with an inline Polish message.

All data persists in Postgres under owner-only RLS. Verification: a fresh account adds guests, edits one, defines a conflict between two, sees it listed, removes it, deletes a guest and watches their conflicts disappear; a second account sees none of it. `astro check` + `npm run lint` pass; the documented SQL check confirms `(A,B)` and `(B,A)` cannot coexist.

### Key Discoveries:

- Conflict rows must use a **canonical order** (`guest_a_id < guest_b_id`) enforced by `check` **plus** `unique(guest_a_id, guest_b_id)` — otherwise `(A,B)` and `(B,A)` both insert and S-03's violation count doubles (roadmap S-02 risk note; `context/foundation/roadmap.md:102`).
- UUIDs compare **lexicographically** in Postgres, so `guest_a_id < guest_b_id` is a valid total order for the canonical check. The service must order the two ids the same way (string compare) before insert so the `check` never rejects a legitimate pair.
- FR-012's "unassigns from any seat" is a **no-op in S-02** — the `assignments` table doesn't exist until S-03. Guest delete here only cascades `guest_conflicts` (via `on delete cascade`). S-03's assignment FK will handle the seat side automatically.
- FR-013 (always-visible unassigned panel) is **S-03's** ref, not S-02's — no assignment/panel surface in this slice.
- Both `side` and `group` are **optional** (nullable), per FR-010 ("wartość może też pozostać niewypełniona"). `group` is a **reserved SQL word** — the column must be quoted (`"group"`) in DDL and referenced carefully; consider this when writing the migration and any raw filters (PostgREST handles it, but the migration DDL must quote it).
- **Guest display names are unique within a wedding.** `guests` gets `unique (wedding_id, first_name, last_name)`, so the Konflikty picker maps a typed/selected name back to exactly one guest id (closes the duplicate-name ambiguity in FR-014). When two real guests share a name, the operator disambiguates by editing the name (e.g. `Kowalska (ciocia)`); a colliding add/edit is rejected with `guest_name_exists`. Uniqueness is on the exact trimmed strings (zod already trims); case-variants count as distinct — acceptable at ≤150 guests.
- The Cloudflare/Supabase runtime is only exercised under `npm run preview`, not `npm run dev` (CLAUDE.md) — manual verification uses `preview`.

## What We're NOT Doing

- No seat assignment, no unassigned panel, no adjacency validation, no graphical ring (all S-03).
- No table edit/resize/delete (S-04), no progress counter (S-05).
- No conflict severity tiers ("hard/soft") — MVP is binary (FR-014).
- No `assignments` table and no "unassign on guest delete" logic — deferred to S-03 (guest delete only cascades conflicts here).
- No native Postgres enum types — `side`/`group` are `text` + `CHECK` (decision: easy evolution over exact DB-generated unions).
- No new shadcn primitives (dialog / select / command). The guest delete confirm is a lightweight inline/native confirm; the searchable guest picker uses a native filterable control or a minimal in-island combobox — no heavy dependency.
- No `zod` addition (already present), no auth changes, no test runner (manual + `astro check` + lint, matching S-01).
- No multi-wedding UX — one wedding per user; guests/conflicts resolve their wedding server-side exactly as tables do.

## Implementation Approach

Standard database-change ordering: **schema/migration → services → API → client**. Phase 1 lays the DB (the only genuinely new-shaped work). Phases 2–4 copy S-01's proven layers with new entities. Endpoints stay thin (validate → service → uniform envelope); services own all Supabase access and the conflict-integrity logic; the page server-loads initial data; a single tabbed React island hosts all interactivity. Each phase is independently verifiable by `astro check` + lint, with manual `preview` checks at the phase that produces user-visible behavior.

## Critical Implementation Details

- **Canonical conflict ordering (service + DB must agree).** The `guest_conflicts` table has `check (guest_a_id < guest_b_id)`. Before inserting, `conflict.service.createConflict` must sort the two incoming ids by string comparison and assign the smaller to `guest_a_id`. If it inserts in the operator's picked order without sorting, a legitimate pair can violate the `check` and surface as a spurious error. The self-pair guard (`a === b`) runs before sorting.
- **Duplicate-pair UX vs. race.** The service pre-checks for an existing canonical pair and returns a friendly `conflict_exists` error; the `unique` constraint is the backstop. A near-simultaneous double insert (negligible for a single operator) would surface the unique-violation SQLSTATE `23505` — map it to the same `conflict_exists` code so the backstop path stays user-friendly, not a raw 500.
- **`group` is a reserved word.** The column is named `guest_group` (Phase 1 contract) to sidestep quoting the reserved word entirely; the DTO field stays `group`, and the service maps `guest_group` → `group`.
- **RLS owner-chain, not a `user_id` on guests.** `guests`/`guest_conflicts` are owned transitively through `wedding_id → weddings.user_id` (guests) and `guest_id → guests.wedding_id → weddings.user_id` (conflicts). Copy F-01's `exists (select 1 from weddings w where ...)` policy shape; index the FK columns.
- **Manual verification runtime.** Endpoints + Supabase only work under workerd — verify with `npm run preview`, not `npm run dev`.

---

## Phase 1: Data Layer — Migration, RLS & Types

### Overview

Add the `guests` and `guest_conflicts` tables with owner-only RLS following the F-01 pattern, the canonical-pair constraint on conflicts, and regenerate the DB types.

### Changes Required:

#### 1. Migration — guests + guest_conflicts + RLS

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_guests_and_conflicts.sql` (new)

**Intent**: Create the two owner-scoped tables and their RLS so guests and conflicts are private to the wedding owner, and so `(A,B)`/`(B,A)` conflict duplicates are impossible.

**Contract**:
- `guests`: `id uuid pk default gen_random_uuid()`, `wedding_id uuid not null references weddings(id) on delete cascade`, `first_name text not null`, `last_name text not null`, `side text` with `check (side is null or side in ('panna_mloda','pan_mlody','wspolne','nieokreslone'))`, group column as `text` with an analogous nullable `check (... in ('rodzina','przyjaciele','wspolpracownicy'))` — name it `guest_group` to avoid quoting the reserved word `group` (the DTO field stays `group`), `created_at timestamptz not null default now()`, plus `unique (wedding_id, first_name, last_name)` so a display name resolves to a single guest id.
- `guest_conflicts`: `id uuid pk`, `wedding_id uuid not null references weddings(id) on delete cascade`, `guest_a_id uuid not null references guests(id) on delete cascade`, `guest_b_id uuid not null references guests(id) on delete cascade`, `created_at`, plus `check (guest_a_id < guest_b_id)` and `unique (guest_a_id, guest_b_id)`. (Carrying `wedding_id` on the conflict row keeps the owner-chain policy a single join and lets the operator's wedding scope both guests; the service must set it and both guests must belong to it — enforced in Phase 2. No DB-level invariant ties this `wedding_id` to the two guests' own `wedding_id`: the service is the sole guarantor (it sets `wedding_id` from the same `weddingId` it validates both guests against, and conflicts are never UPDATEd), the same way it already guarantees the "both guests in wedding" rule.)
- FK indexes: `guests(wedding_id)`, `guest_conflicts(wedding_id)`, `guest_conflicts(guest_a_id)`, `guest_conflicts(guest_b_id)`.
- RLS on both tables: `enable row level security`; `revoke all on guests, guest_conflicts from anon`; per-operation policies `to authenticated` using `(select auth.uid())` via the owner-chain `exists (select 1 from weddings w where w.id = wedding_id and w.user_id = (select auth.uid()))`. `guests` needs SELECT/INSERT/UPDATE/DELETE; `guest_conflicts` needs SELECT/INSERT/DELETE (no UPDATE — a conflict is add/remove only). INSERT policies use `with check` on the same owner-chain.

#### 2. Regenerate DB types

**File**: `src/db/database.types.ts` (regenerated)

**Intent**: Refresh generated types so `guests`/`guest_conflicts` rows are available to the type aliases in Phase 2.

**Contract**: Run `npm run db:types` (after `npx supabase start` / migration applied locally); commit the regenerated file alongside the migration. Do not hand-edit.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local DB: `npx supabase db reset` (or `db push`) succeeds.
- Types regenerate and include the new tables: `npm run db:types` then `grep -c "guests\|guest_conflicts" src/db/database.types.ts` > 0.
- Type checking passes: `npx astro check`.
- Linting passes: `npm run lint`.

#### Manual Verification:

- Canonical constraint holds: inserting `(a,b)` then attempting `(b,a)` (same two ids, swapped) is rejected by the `check`/`unique` — verify via `psql`/Studio.
- Cross-account RLS: as user A create a guest + conflict; as user B, `select` on `guests`/`guest_conflicts` by A's ids returns 0 rows (per `docs/reference/rls-verification-protocol.md`).
- anon is denied: the tables are absent from the anon schema / return no rows unauthenticated.
- Name uniqueness holds: adding a second guest with the same first+last name in the same wedding is rejected by the unique constraint.

---

## Phase 2: Contracts & Services

### Overview

Extend the shared types, add the new error codes, and write the two services that own all Supabase access and the conflict-integrity logic.

### Changes Required:

#### 1. Shared domain types

**File**: `src/types.ts` (extend)

**Intent**: Add DB row aliases and camelCase DTOs/commands for guests and conflicts, matching the existing `Wedding`/`Table` style.

**Contract**: `GuestRow`/`GuestConflictRow` aliases over the generated types. `GuestSide = 'panna_mloda' | 'pan_mlody' | 'wspolne' | 'nieokreslone'`; `GuestGroup = 'rodzina' | 'przyjaciele' | 'wspolpracownicy'`. `Guest { id: string; firstName: string; lastName: string; side: GuestSide | null; group: GuestGroup | null }`. `Conflict { id: string; guestAId: string; guestBId: string }` (names for display are joined in the UI from the guest list; keep the DTO id-only to stay minimal). `CreateGuestInput { firstName: string; lastName: string; side: GuestSide | null; group: GuestGroup | null }` (keys required, value nullable — callers pass explicit `null` for empty so `create`/`update` never send `undefined` to Supabase, which would silently skip the column on update), `UpdateGuestInput` (same shape), `CreateConflictInput { guestAId: string; guestBId: string }`.

#### 2. New error codes

**File**: `src/lib/errors.ts` (extend `API_ERRORS`)

**Intent**: Add the codes the guest/conflict flows need, with Polish messages, so services/endpoints reference the catalog (no ad-hoc strings).

**Contract**: Add `guest_not_found` (404), `guest_name_exists` (409, "Gość o tym imieniu i nazwisku już istnieje w tym weselu. Dodaj rozróżnienie, np. „Kowalska (ciocia)”."), `conflict_exists` (409, "Ten konflikt jest już zdefiniowany."), `conflict_self` (400, "Nie można dodać konfliktu gościa z samym sobą."), `conflict_not_found` (404), and `invalid_guest` (400, for a conflict referencing a guest outside the wedding). Reuse existing `validation_error`, `unauthorized`, `supabase_unconfigured`, `internal_error`, `forbidden`.

#### 3. Guest service

**File**: `src/lib/services/guest.service.ts` (new)

**Intent**: Encapsulate guest reads/writes for a wedding; all access via the passed-in Supabase client so RLS applies. Maps snake_case rows to camelCase DTOs (incl. the `guest_group` column → `group` field).

**Contract**: `listGuests(supabase, weddingId): Promise<ServiceResult<Guest[]>>` ordered by `last_name, first_name` (or `created_at` — pick one, keep stable). `createGuest(supabase, weddingId, input): Promise<ServiceResult<Guest>>` inserts under `wedding_id`, returns the DTO. `updateGuest(supabase, guestId, input): Promise<ServiceResult<Guest>>` updates by id (RLS enforces ownership; empty result → `guest_not_found` (404), consistent with `deleteConflict`). `deleteGuest(supabase, guestId): Promise<ServiceResult<{ id: string }>>` deletes by id (conflicts cascade at the DB); empty → `guest_not_found` (404); other errors per the S-01 convention. Both `createGuest` and `updateGuest` map a unique-violation (SQLSTATE `23505`) → `failure("guest_name_exists")`, mirroring the conflict duplicate backstop.

#### 4. Conflict service

**File**: `src/lib/services/conflict.service.ts` (new)

**Intent**: Encapsulate conflict reads/writes and own the integrity rules (self-pair guard, canonical ordering, duplicate handling).

**Contract**: `listConflicts(supabase, weddingId): Promise<ServiceResult<Conflict[]>>`. `createConflict(supabase, weddingId, guestAId, guestBId): Promise<ServiceResult<Conflict>>` — (1) if `a === b` → `failure("conflict_self")`; (2) sort the two ids by string compare → `(lo, hi)`; (3) verify **both** guests belong to `weddingId` (single select `in (a,b)` on `guests` scoped to the wedding, expect 2 rows) → else `failure("invalid_guest")`; (4) pre-check an existing `(lo, hi)` → `failure("conflict_exists")`; (5) insert `{ wedding_id, guest_a_id: lo, guest_b_id: hi }`; on unique-violation SQLSTATE `23505` also return `failure("conflict_exists")` (race backstop). `deleteConflict(supabase, conflictId): Promise<ServiceResult<{ id: string }>>` — delete by id; empty → `failure("conflict_not_found")`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`.
- Linting passes: `npm run lint`.

#### Manual Verification:

- Service signatures keep all Supabase access behind the service boundary (spot-check); no raw Supabase calls leak into endpoints/UI.
- `createConflict` canonical-ordering + self-pair + duplicate branches read correctly against the Phase 1 constraint (code review).

---

## Phase 3: API Endpoints

### Overview

Expose the services as thin JSON endpoints with `zod` validation and the uniform error shape; register routes; extend the page load to fetch guests + conflicts.

### Changes Required:

#### 1. Guests endpoint

**File**: `src/pages/api/guests.ts` (new)

**Intent**: `POST` (create), `PATCH` (edit), `DELETE` (remove) for the current user's wedding's guests. Wedding resolved server-side via read-only `getWedding` (never client-supplied), exactly like `POST /api/tables`.

**Contract**: `export const prerender = false;` + `POST`/`PATCH`/`DELETE`. `zod`: `firstName`/`lastName` trimmed non-empty max 100; `side` optional enum of the four values or null; `group` optional enum of the three or null. `PATCH`/`DELETE` bodies include the target `id` (uuid). Standard guards: `createClient` null → `supabase_unconfigured`; no user → `unauthorized`; JSON parse fail → `validation_error`; `getWedding` null → `wedding_not_found`. Success: `POST` → 201 `{ data: Guest }`; `PATCH` → 200 `{ data: Guest }`; `DELETE` → 200 `{ data: { id } }`. Service failures via `apiFailure`.

#### 2. Conflicts endpoint

**File**: `src/pages/api/conflicts.ts` (new)

**Intent**: `POST` (define) and `DELETE` (remove) conflicts for the current user's wedding.

**Contract**: `export const prerender = false;` + `POST`/`DELETE`. `zod`: `POST` body `{ guestAId, guestBId }` both uuid; `DELETE` body `{ id }` uuid. Same guards as above. `POST` calls `createConflict` (which maps `conflict_self`/`invalid_guest`/`conflict_exists`), success → 201 `{ data: Conflict }`. `DELETE` → 200 `{ data: { id } }`.

#### 3. Route registry entries

**File**: `src/lib/routes.ts` (extend `ROUTES`)

**Intent**: Add the two new API paths so the island references `ROUTES.*`, not literals (per `lessons.md`).

**Contract**: `apiGuests: "/api/guests"`, `apiConflicts: "/api/conflicts"`.

#### 4. Page load — fetch guests + conflicts

**File**: `src/pages/wedding.astro` (extend)

**Intent**: Alongside the wedding + tables, server-load the guest and conflict lists and pass them to the island as initial props.

**Contract**: Call `listGuests(supabase, wedding.id)` and `listConflicts(supabase, wedding.id)`; on failure set the existing `loadError` path. Pass `initialGuests: Guest[]` and `initialConflicts: Conflict[]` to `WeddingWorkspace`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`.
- Linting passes: `npm run lint`.

#### Manual Verification:

- Under `npm run preview`: `POST /api/guests` with valid data returns 201 + the guest; empty first/last name → 400 without a DB write; a duplicate name in the same wedding → 409 `guest_name_exists`.
- `PATCH /api/guests` updates the row; `DELETE /api/guests` removes it and its conflicts.
- `POST /api/conflicts`: valid pair → 201; same guest twice → 400 `conflict_self`; an already-defined pair (either order) → 409 `conflict_exists`; a guest id from another wedding → 400 `invalid_guest`.
- Unauthenticated requests to either endpoint → 401.

---

## Phase 4: Tabbed Workspace UI

### Overview

Turn the workspace island into a tabbed layout and add the Goście and Konflikty surfaces, wired to the Phase 3 endpoints via `useApiMutation`, with inline errors in the light wedding palette.

### Changes Required:

#### 1. Tabbed workspace shell

**File**: `src/components/wedding/WeddingWorkspace.tsx` (refactor)

**Intent**: Introduce client-side tabs (**Stoły** / **Goście** / **Konflikty**) inside the existing island. The wedding-name heading stays above the tabs; each tab's content is its own section/subcomponent. The existing rename + add-table + table list move under the Stoły tab unchanged. Accepts the new `initialGuests` / `initialConflicts` props.

**Contract**: A lightweight tab state (`useState` active tab) — no new dependency; buttons styled in the light palette, `cn()` for active state. No prop mutation (React Compiler enforced). Extract per-tab UI into sibling components (`GuestsTab`, `ConflictsTab`) or clearly-separated sections in the same file to keep it readable.

**State ownership**: `WeddingWorkspace` owns the mutable `guests` and `conflicts` arrays via `useState(initialGuests)` / `useState(initialConflicts)` — mirroring how it already owns `tables`/`wedding` — and passes them plus updater callbacks (append / replace-by-id / remove-by-id) down to `GuestsTab` and `ConflictsTab`. The tabs never keep their own copy, so a guest added/edited/deleted in Goście is immediately reflected in the Konflikty picker and conflict list (no reload).

#### 2. Guests tab — add/edit form + list

**File**: `src/components/wedding/GuestsTab.tsx` (new, or a section within the island)

**Intent**: An add-guest form (first name, last name, side dropdown, group dropdown) that switches to **edit mode** when a row's "Edytuj" is clicked (prefilled, submits `PATCH`; a "mode" flag + editing-id in state). Below it, the guest list with side/group shown; each row has Edytuj / Usuń. **Usuń asks for confirmation** (lightweight inline/native confirm), then `DELETE`s and drops the row (and any conflicts referencing that guest) from the shared state owned by `WeddingWorkspace`.

**Contract**: Reuses `FormField`/`ServerError` with the existing light `fieldTheme`. Side/group are `<select>`s (native, with an empty "—" option for null). On create/update success calls the parent's guests updater (append or replace by id); on delete calls the guests remover **and** the conflicts remover to drop any conflict referencing that guest — both operate on the shared state owned by `WeddingWorkspace`. Reads the uniform `{ error: { code, message } }` and renders the Polish `message` inline (incl. `guest_name_exists` on a colliding add/edit). Uses `ROUTES.apiGuests`.

#### 3. Konflikty tab — searchable pair picker + list

**File**: `src/components/wedding/ConflictsTab.tsx` (new, or a section within the island)

**Intent**: Two **searchable** guest pickers (Gość A / Gość B) + "Dodaj konflikt". Below, the list of conflicts, each showing both guests' full names (resolved from the `guests` prop by id), each with an **instant** "Usuń" (no confirm). Client-side, keep "Dodaj konflikt" disabled until **both** inputs resolve to a valid guest `id`, and prevent obviously-invalid submissions (same guest in both, or an already-listed pair) for immediate feedback. An unmatched free-text entry maps to no id and must not submit (optionally show an inline hint); the server remains authoritative for everything that does submit.

**Contract**: The searchable picker is a native filterable control (e.g. an `<input>` bound to a `<datalist>` of guest names→id, or a minimal type-to-filter dropdown built in-island) — **no shadcn command/combobox dependency**. Selecting maps a display name back to a guest `id`; because guest names are unique per wedding (Phase 1), this resolution is unambiguous. On add success calls the parent's conflicts updater (append); on remove calls the remover (drop by id) — the shared state owned by `WeddingWorkspace`. Surfaces `conflict_self` / `conflict_exists` / `invalid_guest` messages inline. Uses `ROUTES.apiConflicts`. Full name display joins `conflict.guestAId`/`guestBId` against the shared `guests` list.

#### 4. Page wiring

**File**: `src/pages/wedding.astro` (extend from Phase 3)

**Intent**: Pass `initialGuests` / `initialConflicts` into `WeddingWorkspace` (already fetched in Phase 3).

**Contract**: `<WeddingWorkspace client:load initialWedding=... initialTables=... initialGuests=... initialConflicts=... />`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`.
- Linting passes: `npm run lint` (React Compiler rule included).

#### Manual Verification:

- Under `npm run preview`: switching tabs works; Stoły behaves exactly as before (no regression).
- Add a guest (with and without side/group) → appears in the list; reload confirms persistence.
- Add a second guest with the same first + last name → inline `guest_name_exists` error, nothing created.
- Edit a guest via the reused form → row updates; reload confirms.
- Delete a guest → confirm prompt appears; on confirm the guest and any of their conflicts disappear; reload confirms.
- Define a conflict via the searchable pickers → appears listed with both names; a self-pair or duplicate shows an inline Polish error and creates nothing.
- Remove a conflict → disappears immediately (no confirm); reload confirms.
- Empty required fields show inline errors and create nothing.

---

## Testing Strategy

No automated test runner in this slice (decision: match S-01 — manual + `astro check` + lint). The conflict-integrity logic lives in `conflict.service.ts` so it can be unit-tested later (S-03) without refactoring.

### Manual Testing Steps:

1. Apply the migration locally (`npx supabase db reset`), `npm run db:types`, then `npm run preview`; sign in with a fresh account → `/wedding`.
2. Goście tab: add two guests (one with side+group, one without); edit one; confirm both persist across reload.
3. Konflikty tab: define a conflict between the two guests via the searchable pickers; confirm it lists both names.
4. Try a self-pair and a duplicate (both orders) → inline errors, nothing created.
5. Remove the conflict (instant); delete a guest that has a conflict → confirm prompt, guest + conflict both gone.
6. RLS: as a second account, confirm none of account 1's guests/conflicts are visible (`docs/reference/rls-verification-protocol.md`).
7. SQL canonical check: attempt to insert `(b,a)` for an existing `(a,b)` pair via Studio → rejected.

## Performance Considerations

Negligible at `target_scale: small` (≤150 guests). FK indexes on `wedding_id` and the two guest FKs keep RLS owner-chain checks and conflict lookups off seq scans. The searchable picker filters ≤150 names client-side — trivial.

## Migration Notes

One new migration (`guests` + `guest_conflicts` + RLS). Migrations are one-way (CLAUDE.md) — apply during a low-traffic window if pushing to a live DB. `npm run db:types` + commit the regenerated `src/db/database.types.ts` alongside the migration SQL. No data backfill (new tables).

## References

- Roadmap slice S-02: `context/foundation/roadmap.md:93` (and risk note `:102` — canonical pair)
- PRD FR-010..FR-016: `context/foundation/prd.md:122`
- Established domain patterns (services/endpoints/errors/routes/UI): `context/changes/wedding-shell-with-tables/plan.md` ("Addendum — Established patterns")
- F-01 migration (RLS + policy template to copy): `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql`
- Lesson (RLS hardening + `(select auth.uid())`): `context/foundation/lessons.md`
- Lesson (route registry): `context/foundation/lessons.md`
- RLS cross-account verification protocol: `docs/reference/rls-verification-protocol.md`
- Canonical endpoint example: `src/pages/api/tables.ts`; service example: `src/lib/services/table.service.ts`; island example: `src/components/wedding/WeddingWorkspace.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data Layer — Migration, RLS & Types

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local DB (`npx supabase db reset`/`db push`) — 1c15a5e
- [x] 1.2 Types regenerate & include new tables (`npm run db:types`; `grep -c "guests\|guest_conflicts" src/db/database.types.ts` > 0) — 1c15a5e
- [x] 1.3 Type checking passes: `npx astro check` — 1c15a5e
- [x] 1.4 Linting passes: `npm run lint` — 1c15a5e

#### Manual

- [x] 1.5 Canonical constraint holds: `(b,a)` rejected after `(a,b)` — 1c15a5e
- [x] 1.6 Cross-account RLS returns 0 rows for another user's guests/conflicts — 1c15a5e
- [x] 1.7 anon denied on both tables — 1c15a5e
- [x] 1.8 Duplicate (wedding_id, first_name, last_name) rejected by unique constraint — 1c15a5e

### Phase 2: Contracts & Services

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — d9aedfc
- [x] 2.2 Linting passes: `npm run lint` — d9aedfc

#### Manual

- [x] 2.3 All Supabase access stays behind the service boundary (spot-check) — d9aedfc
- [x] 2.4 `createConflict` self-pair / canonical-order / duplicate branches correct (code review) — d9aedfc

### Phase 3: API Endpoints

#### Automated

- [x] 3.1 Type checking passes: `npx astro check`
- [x] 3.2 Linting passes: `npm run lint`

#### Manual

- [x] 3.3 `POST /api/guests` valid → 201; empty name → 400 without a write (preview)
- [x] 3.4 `PATCH` updates; `DELETE` removes guest + cascades conflicts
- [x] 3.5 `POST /api/conflicts`: valid → 201; self → 400; duplicate (either order) → 409; foreign guest → 400
- [x] 3.6 Unauthenticated requests → 401

### Phase 4: Tabbed Workspace UI

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes: `npm run lint`

#### Manual

- [ ] 4.3 Tabs switch; Stoły tab unchanged (no regression)
- [ ] 4.4 Add guest (with/without side+group) appears and persists
- [ ] 4.5 Edit guest via reused form updates and persists
- [ ] 4.6 Delete guest shows confirm; guest + their conflicts disappear
- [ ] 4.7 Define conflict via searchable pickers; self-pair/duplicate show inline error, create nothing
- [ ] 4.8 Remove conflict is instant (no confirm) and persists
- [ ] 4.9 Empty required guest fields show inline errors and create nothing
- [ ] 4.10 Adding a guest with a duplicate first+last name shows inline `guest_name_exists`, nothing created
