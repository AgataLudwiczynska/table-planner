<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-01 Wedding Shell with Tables

- **Plan**: context/changes/wedding-shell-with-tables/plan.md
- **Mode**: Deep
- **Date**: 2026-08-15
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

10/10 paths verified (1 contradiction: `src/types.ts` already exists — see F2), RPC error codes confirmed (`not_owner`/`42501`, `seat_count_must_be_positive`/`22023`), RPC `returns uuid` confirmed (migration :115), `/dashboard` blast radius = `middleware.ts` + `Topbar.astro` only (both in plan), brief↔plan consistent (both stale on `src/types.ts`). Progress↔Phase mechanical contract passes. Lessons prior (RLS `(select auth.uid())` / revoke-anon) N/A — no migration in this slice.

## Findings

### F1 — weddingId handling unresolved & self-inconsistent; a success criterion tests an unreachable path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment / Plan Completeness
- **Location**: Phase 2 items 1–2; Critical Implementation Details; Success Criteria 2.4
- **Detail**: PATCH /api/wedding takes body `{ name }` only (weddingId resolved server-side, Phase 2 item 1), but POST /api/tables leaves it open ("Body `{ weddingId, name, seatCount }` or resolve server-side — pick one"). The two endpoints are inconsistent and the choice is punted to the implementer. Knock-on if create-table resolves server-side (the plan's own recommendation, matching rename): (a) a client can't supply a foreign id, so the `not_owner`→403 mapping is unreachable dead code; (b) Success Criterion 2.4 / manual 2.4 ("403 on a foreign wedding id") can never be exercised — the implementer would try to verify a path the design forbids.
- **Fix**: Commit to server-side weddingId resolution for POST /api/tables (matching PATCH). Drop the "or supply weddingId" branch. Replace the "403 on foreign wedding" success criterion with a real checkable case (e.g. 401 when unauthenticated). Keep `not_owner`→403 as defensive but mark it normally unreachable — same footing as the existing `seat_count_must_be_positive` note.
  - Strength: Removes trust-the-client id, matches rename, makes every success criterion verifiable.
  - Tradeoff: create-table endpoint now needs the wedding lookup too (one extra select or a shared `resolveWedding` helper).
  - Confidence: HIGH — rename already establishes the server-side pattern.
  - Blind spot: None significant.
- **Decision**: FIXED — server-side weddingId resolution for POST /api/tables; Success 2.4 → 401 unauthenticated; not_owner→403 marked normally-unreachable.

### F2 — Plan says src/types.ts doesn't exist; it does

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State (line 21); Phase 1 item 2 (and plan-brief.md)
- **Detail**: Both plan ("`src/types.ts` ... do not exist yet") and plan-brief ("no `src/types.ts`") are stale. The file exists and already defines `Wedding`/`Table`/`Seat` row-type aliases plus a comment "Future slices: add domain DTOs here." Phase 1 item 2 says to "Create the shared types module (first shared types in the repo)" — an implementer following it literally may Write-overwrite the file and lose the existing aliases, or stall on the mismatch.
- **Fix**: Change "create" → "extend" the existing `src/types.ts`; add DTOs/commands/`ApiResult` alongside the current Row aliases. Note the service can map from those Row types (snake_case `seat_count`) to the camelCase DTOs. Update the stale line in plan-brief too.
- **Decision**: FIXED — reworded Current State + Phase 1 item 2 to "extend existing src/types.ts"; corrected the stale plan-brief line.

### F3 — Auth FormField/ServerError are theme-coupled; "reuse" likely means "generalize"

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 4 items 2–3
- **Detail**: FormField mandates an `icon` prop, hard-codes auth glassmorphism (blue/purple, white text, `pl-10` icon slot), and types `value` as string — awkward for a domain workspace and a seat-count number input. Plan marks the shared extraction "optional (if cleaner)," but a drop-in reuse without the auth styling won't look right. Realistic outcome: the extraction is required, not optional.
- **Fix**: Frame Phase 4 item 3 as expected work if the workspace isn't styled like auth: make `icon` optional and decouple the auth-specific classes when relocating to `src/components/ui/`.
- **Decision**: FIXED — reframed Phase 4 item 3 from "optional move" to "generalize + extract"; documented the icon-required + hard-coded-palette coupling and the required changes.

### F4 — createTable DTO source left implicit (RPC returns uuid, not a row)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 item 5
- **Detail**: RPC `create_table_with_seats ... returns uuid` (migration :115). Phase 1 item 5 says "then returns the created table as a DTO" without saying how. No second select is needed — the DTO can be built from `{ id: <returned uuid>, name, seatCount }` (all known at call time). Stating this avoids an unnecessary follow-up query.
- **Fix**: Specify: build `TableDto` from the RPC's returned uuid plus the validated name/seatCount — no re-select.
- **Decision**: FIXED — Phase 1 item 5 now states the RPC returns uuid only and the DTO is built from that id + validated name/seatCount, no follow-up select.

---

# Re-review #2 — 2026-08-15 (post-fix)

Second pass after F1–F4 were applied. Code unchanged since the prior deep pass; grounding carried forward. All four earlier fixes verified clean. One new low observation, surfaced by the F1 server-side-resolution fix.

- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS (1 observation) |

## Grounding

10/10 paths ✓, RPC `returns uuid` ✓, error codes ✓, `src/types.ts` now accurately described ✓, brief↔plan ✓, Progress↔Phase mechanical contract ✓.

## Findings

### F5 — Mutation endpoints resolve weddingId server-side, but the resolution mechanism is unstated

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 items 1–2; Phase 1 item 4
- **Detail**: After the F1 fix, both `PATCH /api/wedding` and `POST /api/tables` resolve the wedding server-side from the user. But the service exposes `getOrCreateWedding(supabase, userId)` and `renameWedding(supabase, weddingId, name)` — the endpoints hold a `userId` (from locals) while `renameWedding`/`createTable` want a `weddingId`. The intermediate "get the user's wedding id first" step is implicit in both endpoint contracts. The natural path is `getOrCreateWedding(userId)` → `wedding.id` → mutate, which works but means a PATCH/POST can auto-provision a wedding (mildly surprising on a rename).
- **Fix**: State in both endpoint contracts that they resolve the wedding via `getOrCreateWedding(userId)` before the mutation (accept that a first mutation may provision). If provisioning-on-mutate is undesirable, add a lightweight `getWedding(supabase, userId)` read to the wedding service and use that instead.
- **Decision**: FIXED (Option B) — added read-only `getWedding(supabase, userId): Promise<WeddingDto | null>` to the wedding service (Phase 1 item 4); both mutation endpoints now resolve via `getWedding` and return 404 `wedding_not_found` if none; `getOrCreateWedding` is documented as the page-load-only provisioning site, so writes never provision.
