# S-01: Wedding Shell with Tables — Implementation Plan

## Overview

First domain slice. An authenticated operator lands in a wedding workspace at `/wedding`, where a wedding is auto-provisioned on first visit, its name can be renamed, and round tables can be added with a seat count (seats 1..N generated atomically by the existing F-01 RPC). The operator sees the list of (empty) tables.

Beyond the user-visible outcome, this slice **establishes the reusable domain patterns** that S-02..S-05 will copy: the JSON API shape (`zod` validation, uniform `{ error: { code, message } }` body), the `src/lib/services/` layer, the shared DTO/command types in `src/types.ts`, and the inline form-error UI convention.

Covers FR-001..FR-007. Also **closes the deferred F-01 follow-up F1** (bound `seat_count` upper limit) at the API layer.

## Current State Analysis

- **Data layer is complete (F-01).** Migration `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql` created `weddings` (owned via `user_id`), `tables` (FK `wedding_id`), `seats` (FK `table_id`, `unique(table_id, seat_number)`), with owner-only RLS on all three. Seats are created **only** through the RPC `public.create_table_with_seats(p_wedding_id uuid, p_name text, p_seat_count int) returns uuid`, which verifies ownership, inserts the table, then `generate_series(1, p_seat_count)` seats. **No new migration is needed for S-01.**
- **RPC error contract** (from the migration): raises `seat_count_must_be_positive` (SQLSTATE `22023`) for `p_seat_count <= 0`, and `not_owner` (SQLSTATE `42501`) when the caller does not own `p_wedding_id`. The RPC has **no upper bound** on seat count — F-01 follow-up F1 (`context/archive/2026-08-09-wedding-scope-schema-and-rls/follow-ups/review-fixes.md`) explicitly defers that ceiling to this slice's `zod` schema.
- **Generated types** (`src/db/database.types.ts`) already include `weddings`/`tables`/`seats` rows and the `create_table_with_seats` function signature. No `db:types` regeneration needed (no migration).
- **`zod` is NOT in `package.json`** — must be added; this is the first domain endpoint.
- **Auth API pattern** (`src/pages/api/auth/*.ts`) uses `formData()` + `redirect(?error=)`. This slice deliberately introduces a **separate** JSON+fetch pattern for domain endpoints; auth endpoints stay as-is (navigation vs in-place update).
- **Supabase client** (`src/lib/supabase.ts`) — `createClient(request.headers, cookies)` returns `null` when env vars are missing; every caller must handle `null`.
- **Middleware** (`src/middleware.ts`) resolves `context.locals.user` and guards `PROTECTED_ROUTES = ["/dashboard"]`.
- **Routing today:** `signin`/`signout` both `redirect("/")`; `/` renders the public `Welcome` landing; `/dashboard` is a generic authenticated stub referenced in exactly two places — `PROTECTED_ROUTES` and a link in `Topbar.astro`.
- **UI scaffolding:** shadcn has only `button.tsx`. Auth React forms exist (`src/components/auth/FormField.tsx`, `ServerError.tsx`, `SubmitButton.tsx`) and define the inline-error convention this slice reuses. `src/types.ts` **already exists** and defines `Wedding`/`Table`/`Seat` row-type aliases over the generated DB types (with a "Future slices: add domain DTOs here" comment) — this slice **extends** it, does not recreate it. `src/lib/services/` does **not** exist yet.
- **UI copy is Polish** (per CLAUDE.md); default wedding name and all user-facing strings are Polish.

## Desired End State

An authenticated operator visiting `/wedding`:

1. Gets a wedding automatically (default name `Nasze wesele`) on first visit; subsequent visits reuse it.
2. Can rename the wedding inline (edit heading, save on blur/Enter) — persisted via `PATCH /api/wedding`.
3. Can add a round table by name + seat count (1–30) via a form — persisted via `POST /api/tables`, which calls the RPC; the new table appears in the list without a full page reload.
4. Sees the list of the wedding's tables (name + seat count), each empty (no assignment UI yet — that is S-03).

Verification: a fresh account logs in, lands on `/wedding` with `Nasze wesele`, renames it, adds two tables (e.g. 10 and 12 seats), both appear; the DB shows one `weddings` row for the user, two `tables` rows, and 10+12 `seats` rows. `astro check` and `npm run lint` pass.

### Key Discoveries:

- RPC already enforces the atomic table+seats invariant (`supabase/migrations/20260812201915_...:111`) — the service just calls it; no client-side seat generation.
- RPC error codes to map: `not_owner`/`42501` and `seat_count_must_be_positive`/`22023` (`...:122`, `...:128`).
- The 1..N seat contract and `unique(table_id, seat_number)` mean S-01 never touches `seats` directly.
- The Cloudflare runtime (Supabase bindings) is only exercised under `npm run preview`, not `npm run dev` (CLAUDE.md) — manual verification uses `preview`.

## What We're NOT Doing

- No new Supabase migration; no `db:types` regeneration.
- No guest/conflict CRUD (S-02), no seat assignment, no adjacency validation, no graphical ring (S-03).
- No table editing/resize/delete (S-04), no progress counter (S-05).
- No multi-wedding UX — one wedding per user (auto-provision + rename) is the MVP assumption.
- No DB-level `seat_count` ceiling — the ceiling lands in the `zod` schema here; the optional defense-in-depth DB guard remains deferred to S-04's `resize_table` migration.
- No changes to the auth endpoints, no CSRF token, no password reset (Non-Goal).
- No test runner — success criteria are `astro check` + lint + manual verification (domain logic isolated in `src/lib/services/` to stay testable later).

## Implementation Approach

Build inside-out: (1) contracts and the service layer, (2) JSON API endpoints over them, (3) the server-rendered route with auto-provision + routing changes, (4) the interactive React workspace that calls the endpoints. Each phase is independently verifiable. Domain logic lives in `src/lib/services/`; endpoints are thin (validate → call service → map result to the uniform JSON shape); the page is server-rendered and hosts a single React island for interactivity.

## Critical Implementation Details

- **Auto-provision timing & race.** The wedding is provisioned server-side during the `/wedding` page load (select the user's first wedding by `user_id`; if none, insert one with the default name). There is no `unique(user_id)` constraint on `weddings`, so two near-simultaneous first loads could theoretically insert two weddings. For a single-operator MVP this race is negligible; accept it and always select the earliest (`order by created_at`) so the workspace is deterministic. A `unique(user_id)` constraint is a possible future migration, out of scope here.
- **RPC error mapping.** Supabase surfaces the RPC `raise` as an error object whose `code`/`message` carry the SQLSTATE / message string. Map `not_owner` → HTTP 403 `{code:"forbidden"}` (**normally unreachable** — `weddingId` is resolved server-side from the user's own wedding, so the caller always owns it; kept as defensive mapping only), `seat_count_must_be_positive` → HTTP 400 `{code:"invalid_seat_count"}` (also normally unreachable because `zod` rejects first), anything else → HTTP 500 `{code:"internal_error"}`.
- **Manual verification runtime.** Endpoints and Supabase only work under the workerd runtime — verify with `npm run preview`, not `npm run dev`.

## Addendum — Established patterns (as implemented)

> Recorded after Phases 1–2 landed. This is the reusable domain pattern S-02..S-05 copy; it refines the original "services return DTOs directly" wording above.

- **Central error catalog** (`src/lib/errors.ts`): single `API_ERRORS` map of `code → { status, message }` (Polish messages). `ApiErrorCode` is its key type — the one source of truth for every domain error code, status, and user-facing string.
- **Service-result pattern** (`src/lib/services/result.ts`, types in `src/types.ts`): services never throw for expected failures; they return `ServiceResult<T> = { ok: true; data: T } | ({ ok: false } & ServiceFailure)`, built via `success(data)` / `failure(code)` (which pulls status+message from the catalog).
- **Thin endpoints unwrap the result**: `src/lib/api.ts` exposes `apiSuccess(data, status?)`, `apiError(code, message, status)`, `apiErrorFrom(code)` (catalog lookup), and `apiFailure(serviceFailure)`. Endpoint flow: validate (zod) → call service → `if (!result.ok) return apiFailure(result)` → `apiSuccess(result.data)`.

## Phase 1: Scaffolding & Contracts

### Overview

Add `zod`, define shared DTOs/commands, the uniform API error contract, and the service layer that wraps all Supabase access for this slice.

### Changes Required:

#### 1. Add zod dependency

**File**: `package.json`

**Intent**: Add `zod` as a runtime dependency — the first domain endpoint validates input with it.

**Contract**: `zod` in `dependencies`; lockfile updated via install.

#### 2. Shared domain types

**File**: `src/types.ts` (extend existing — already holds `Wedding`/`Table`/`Seat` row-type aliases)

**Intent**: Extend the existing shared types module with the DTOs the API returns and the command shapes it accepts, plus the uniform API result envelope. Keep the current Row aliases (the service maps a snake_case Row like `seat_count` to the camelCase DTO `seatCount`). DTOs are camelCase.

**Contract**: `Wedding { id: string; name: string }`; `Table { id: string; name: string; seatCount: number }`; `RenameWeddingInput { name: string }`; `CreateTableInput { name: string; seatCount: number }`; `ApiError { error: { code: string; message: string } }`; a discriminated `ApiResult<T> = { data: T } | ApiError`.

#### 3. API response helpers

**File**: `src/lib/api.ts` (new)

**Intent**: Small helpers to build the uniform JSON success/error responses so every domain endpoint (this slice and S-02..S-05) emits the same shape. Centralizes the `{ error: { code, message } }` contract and status codes.

**Contract**: `apiSuccess(data, status?)` and `apiError(code, message, status)` returning `Response` with `content-type: application/json`. Polish user-facing `message` strings.

#### 4. Wedding service

**File**: `src/lib/services/wedding.service.ts` (new)

**Intent**: Encapsulate wedding reads/writes. Provides get-or-create (auto-provision, page-load only), a read-only lookup (for the mutation endpoints, so a write never provisions), and rename. All access goes through the passed-in Supabase client so RLS applies.

**Contract**: `getOrCreateWedding(supabase, userId): Promise<Wedding>` — selects earliest wedding for the user, inserts `{ user_id, name: "Nasze wesele" }` if none, returns the DTO. **Called only by the `/wedding` page load** (the single provisioning site). `getWedding(supabase, userId): Promise<Wedding | null>` — **read-only**; selects the earliest wedding for the user (`order by created_at`), returns `null` if none. **Called by the mutation endpoints** so a PATCH/POST never creates a wedding as a side effect. `renameWedding(supabase, weddingId, name): Promise<Wedding>` — updates `name`, returns the DTO (RLS enforces ownership; an empty update result means not-owner/not-found → surfaced as error).

#### 5. Table service

**File**: `src/lib/services/table.service.ts` (new)

**Intent**: Encapsulate table reads and creation. Creation delegates to the F-01 RPC (never inserts `tables`/`seats` directly). Reads list the wedding's tables for display.

**Contract**: `listTables(supabase, weddingId): Promise<Table[]>` ordered by `created_at`. `createTable(supabase, weddingId, name, seatCount): Promise<Table>` — calls `rpc("create_table_with_seats", { p_wedding_id, p_name, p_seat_count })`. The RPC `returns uuid` (the new table id only, not a row), so build the `Table` from that returned id plus the already-validated `name`/`seatCount` — **no follow-up select needed**. Distinguishes RPC error codes (`not_owner`, `seat_count_must_be_positive`) so the endpoint can map them — see Critical Implementation Details.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- `zod` resolves: build/sync does not error on the import

#### Manual Verification:

- Service function signatures read naturally and keep all Supabase access behind the service boundary (spot-check).

---

## Phase 2: API Endpoints

### Overview

Expose the services as JSON endpoints with `zod` validation and the uniform error shape. This is the canonical domain-API pattern for the project.

### Changes Required:

#### 1. Rename-wedding endpoint

**File**: `src/pages/api/wedding.ts` (new)

**Intent**: `PATCH` accepts a JSON body to rename the current user's wedding. Validates with `zod`, resolves the user's wedding server-side via the read-only `getWedding`, calls `renameWedding`, returns the updated `Wedding`.

**Contract**: `export const prerender = false;` and `export const PATCH`. Body `{ name }` validated by `zod` (trimmed, non-empty, max 100). Resolves the wedding via `getWedding(userId)` (read-only — never provisions); if it returns `null` → 404 `{code:"wedding_not_found"}` (unreachable through the normal flow, since the `/wedding` page provisions on load). Handles `createClient(...) === null` → 503 `{code:"supabase_unconfigured"}`; missing user → 401 `{code:"unauthorized"}`. Success → `{ data: Wedding }`.

#### 2. Create-table endpoint

**File**: `src/pages/api/tables.ts` (new)

**Intent**: `POST` accepts a JSON body to create a round table under the current user's wedding. Validates with `zod` (including the seat-count ceiling that closes follow-up F1), calls `createTable`, maps RPC errors, returns the new `Table`.

**Contract**: `export const prerender = false;` and `export const POST`. Body `{ name, seatCount }` only — `weddingId` is resolved **server-side** via the read-only `getWedding(userId)` (same as `PATCH /api/wedding`; never provisions, never trusts a client-supplied id, and the MVP has one wedding per user); if it returns `null` → 404 `{code:"wedding_not_found"}` (unreachable through the normal flow). `zod`: `name` trimmed non-empty max 50; `seatCount` integer `min(1).max(30)`. Handles `createClient(...) === null` → 503 `{code:"supabase_unconfigured"}`; missing user → 401 `{code:"unauthorized"}`. RPC error mapping per Critical Implementation Details (with server-side resolution, `not_owner` is normally unreachable — kept only as defensive mapping). Success → 201 `{ data: Table }`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Under `npm run preview`, `PATCH /api/wedding` with a valid name returns `{ data: { name } }`; empty name returns 400 with `{ error: { code, message } }`.
- `POST /api/tables` with `seatCount` 10 returns 201 and creates 10 seats; `seatCount` 31 or 0 returns 400 without touching the DB; an unauthenticated request returns 401.

---

## Phase 3: Route, Auto-Provision & Middleware

### Overview

Move the authenticated workspace to `/wedding`, auto-provision the wedding on load, and fix entry routing so login lands in the app.

### Changes Required:

#### 1. Wedding page (server render + provision)

**File**: `src/pages/wedding.astro` (new; replaces `src/pages/dashboard.astro`)

**Intent**: Server-rendered workspace page. Reads `locals.user`, calls `getOrCreateWedding` and `listTables`, and passes the wedding + tables to the React island as initial props. Replaces the old dashboard stub content.

**Contract**: Renders `Layout` + the workspace island with `initialWedding: Wedding` and `initialTables: Table[]`. Handles unconfigured Supabase gracefully (middleware already redirects unauthenticated users).

#### 2. Delete old dashboard page

**File**: `src/pages/dashboard.astro` (delete)

**Intent**: Remove the superseded stub; its route is replaced by `/wedding`.

**Contract**: File removed; no remaining references (see items 3–5).

#### 3. Protected routes

**File**: `src/middleware.ts`

**Intent**: Protect `/wedding` instead of `/dashboard`, and redirect an already-authenticated user hitting `/` straight to `/wedding` (the public landing stays for anonymous visitors).

**Contract**: `PROTECTED_ROUTES = ["/wedding"]`; add a rule: if `locals.user` and `context.url.pathname === "/"` → `redirect("/wedding")`.

#### 4. Post-auth redirects

**File**: `src/pages/api/auth/signin.ts` (and confirm `signout.ts`)

**Intent**: Land the operator in the app after login; keep sign-out on the public landing.

**Contract**: `signin` success → `redirect("/wedding")`. `signout` stays `redirect("/")`.

#### 5. Topbar link

**File**: `src/components/Topbar.astro`

**Intent**: Point the workspace link at the new route.

**Contract**: `href="/dashboard"` → `href="/wedding"` (update label if it says "Dashboard").

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- No lingering references: `grep -rn "/dashboard" src/` returns nothing

#### Manual Verification:

- Fresh account: sign in → lands on `/wedding` showing `Nasze wesele` and an empty table list; the DB has exactly one wedding row for the user.
- Visiting `/` while logged in redirects to `/wedding`; visiting `/` while logged out shows the landing.
- Visiting `/wedding` while logged out redirects to `/auth/signin`.

---

## Phase 4: Interactive Workspace UI

### Overview

The React island that renames the wedding and adds/lists tables, wired to the endpoints via `fetch`, with inline errors.

### Changes Required:

#### 1. shadcn inputs

**File**: `src/components/ui/` (add `input`, `label` via `npx shadcn@latest add input label`)

**Intent**: Provide the form primitives the workspace needs (text input, number input, labels), consistent with the existing shadcn "new-york" setup.

**Contract**: New `input.tsx` / `label.tsx` under `src/components/ui/`.

#### 2. Wedding workspace island

**File**: `src/components/wedding/WeddingWorkspace.tsx` (new)

**Intent**: Client component receiving `initialWedding` + `initialTables`. Renders an editable wedding-name heading (save on blur/Enter → `PATCH /api/wedding`), an "add table" form (name + seat count 1–30 → `POST /api/tables`), and the table list. On success it updates local state so the new table appears without reload. Shows validation and API errors inline (mirroring the auth `FormField`/`ServerError` convention).

**Contract**: Uses `cn()` for classes; no prop mutation (React Compiler enforced). Reuses/generalizes `FormField`/`ServerError` from `src/components/auth/` (extract to a shared location if cleaner). Reads the uniform `{ error: { code, message } }` on non-OK responses and renders the Polish `message`.

#### 3. Generalize + extract shared form components

**File**: `src/components/ui/FormField.tsx`, `src/components/ui/ServerError.tsx` (move + generalize)

**Intent**: Expect this if the workspace isn't styled exactly like the auth screens. The current `src/components/auth/FormField.tsx` is coupled to the auth look: `icon` is a **required** prop, and the classes hard-code the dark glassmorphism palette (`bg-white/10`, `text-white`, `placeholder-white/40`, `focus:ring-purple-400`, `pl-10` icon slot). A drop-in reuse on a differently-styled workspace (e.g. light background, or the seat-count number input with no icon) will look wrong. Generalize before reusing: make `icon` optional (drop the `pl-10` slot when absent) and decouple the auth-specific palette from the base field styling, then relocate to `src/components/ui/`.

**Contract**: `icon` optional; auth-specific palette no longer baked into the base component. Components relocated to `src/components/ui/`; both auth forms + workspace import from the shared path; auth forms render unchanged.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint` (React Compiler rule included)

#### Manual Verification:

- Under `npm run preview`: rename the wedding inline → reload shows the new name.
- Add a table (name + 12 seats) → it appears in the list immediately; reload confirms persistence and 12 seats in the DB.
- Submitting an empty table name or seat count 0/31 shows an inline error and creates nothing.
- No regressions in the auth sign-in/sign-up forms after any shared-component extraction.

---

## Testing Strategy

No automated test runner in this slice (decision: manual + `astro check` + lint). Domain logic is isolated in `src/lib/services/` so it can be unit-tested later (S-03) without refactoring.

### Manual Testing Steps:

1. `npm run preview`; sign in with a fresh account → land on `/wedding` with `Nasze wesele`.
2. Rename inline; reload → name persisted.
3. Add tables (e.g. 10 and 12 seats) → both listed; DB shows 10+12 seats.
4. Try invalid seat counts (0, 31) and empty names → inline errors, nothing created.
5. Log out → `/`; visit `/wedding` → redirected to sign-in.
6. Log back in → `/wedding` shows the same wedding and tables (persistence).

## Performance Considerations

Negligible at `target_scale: small`. FK indexes for RLS owner-chain checks already exist (F-01). The seat-count ceiling (≤30) bounds `seats` rows per table.

## Migration Notes

None — no schema change. F-01's schema, RLS, and RPC cover this slice. The seat-count ceiling is enforced in the `zod` schema only (closes follow-up F1 at the API layer); the optional DB-level guard stays deferred to S-04.

## References

- Roadmap slice S-01: `context/foundation/roadmap.md`
- PRD FR-001..FR-007: `context/foundation/prd.md`
- F-01 migration (schema/RLS/RPC): `supabase/migrations/20260812201915_wedding_scope_schema_and_rls.sql`
- Deferred follow-up F1 (seat_count ceiling): `context/archive/2026-08-09-wedding-scope-schema-and-rls/follow-ups/review-fixes.md`
- Lesson (RLS pattern, informs error-code awareness): `context/foundation/lessons.md`
- Existing auth form convention: `src/components/auth/FormField.tsx`, `src/components/auth/ServerError.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Scaffolding & Contracts

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — 780af9f
- [x] 1.2 Linting passes: `npm run lint` — 780af9f
- [x] 1.3 `zod` resolves on import — 780af9f

#### Manual

- [x] 1.4 Service boundary keeps all Supabase access behind services (spot-check) — 780af9f

### Phase 2: API Endpoints

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — 198379e
- [x] 2.2 Linting passes: `npm run lint` — 198379e

#### Manual

- [x] 2.3 `PATCH /api/wedding` valid/empty name behaves per contract (preview) — 198379e
- [x] 2.4 `POST /api/tables` creates N seats; rejects seatCount 0/31; 401 when unauthenticated — 198379e

### Phase 3: Route, Auto-Provision & Middleware

#### Automated

- [x] 3.1 Type checking passes: `npx astro check`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 `grep -rn "/dashboard" src/` returns nothing

#### Manual

- [x] 3.4 Fresh login lands on `/wedding` with auto-provisioned `Nasze wesele`
- [x] 3.5 Logged-in `/` → `/wedding`; logged-out `/` → landing
- [x] 3.6 Logged-out `/wedding` → sign-in

### Phase 4: Interactive Workspace UI

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes: `npm run lint`

#### Manual

- [ ] 4.3 Inline rename persists across reload (preview)
- [ ] 4.4 Add table appears immediately and persists with correct seat count
- [ ] 4.5 Invalid name/seat count shows inline error, creates nothing
- [ ] 4.6 No regression in auth forms after shared-component extraction
