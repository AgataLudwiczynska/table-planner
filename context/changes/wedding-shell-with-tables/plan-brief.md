# S-01: Wedding Shell with Tables — Plan Brief

> Full plan: `context/changes/wedding-shell-with-tables/plan.md`

## What & Why

First domain slice of TablePlanner. An authenticated operator gets a wedding (auto-provisioned), can rename it, and can add round tables with a seat count — seats 1..N generated atomically by the F-01 RPC. Beyond the feature, this slice sets the reusable domain patterns (JSON API + `zod` + uniform error shape, service layer, shared DTOs, inline form errors) that S-02..S-05 copy. Covers FR-001..FR-007.

## Starting Point

F-01 already shipped the full data layer: `weddings`/`tables`/`seats` tables, owner-only RLS, and the `create_table_with_seats` RPC (with `not_owner`/`seat_count_must_be_positive` errors, but **no** upper seat bound). Auth (email/password), middleware, and the Supabase SSR client exist. There is no domain API, no `zod` dependency, and no `src/lib/services/` (only a generic `/dashboard` stub). `src/types.ts` already exists with `Wedding`/`Table`/`Seat` row-type aliases — this slice extends it with DTOs. UI copy is Polish.

## Desired End State

Logging in lands the operator on `/wedding` with a wedding named `Nasze wesele`. They rename it inline, add round tables (name + 1–30 seats) that appear immediately without a page reload, and see the list of empty tables. State persists across logout/login. No new migration.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wedding model | Auto-provision + rename (one per user) | `target_scale: small`; avoids create-wedding UX; roadmap recommendation | Roadmap / Plan |
| Domain API style | JSON endpoints + React `fetch`, `zod`, `{error:{code,message}}` | Matches CLAUDE.md; S-03 real-time needs JSON anyway — set the pattern once | Plan |
| Auth endpoints | Left unchanged (form-post + redirect) | Navigation vs in-place update; no shared code to unify | Plan |
| App route | Rename `/dashboard` → `/wedding`; signin → `/wedding`; logged-in `/` → `/wedding` | Clean domain namespace; single obvious entry without a double redirect | Plan |
| Seat-count limit | `zod` integer 1–30 (closes F-01 follow-up F1) | Fat-finger guard between the product max (~20) and the follow-up's ~50 ceiling | Follow-up F1 / Plan |
| Error UI | Inline field errors + form banner (reuse `FormField`/`ServerError`) | Precise, consistent with existing auth forms | Plan |
| Page UX | Single React island: editable heading + add-table form + list | Fewest clicks; one workspace ready to grow into S-03 | Plan |
| Testing | Manual + `astro check` + lint; logic isolated in `src/lib/services/` | Speed under the 2026-09-10 deadline; heavy logic (adjacency) arrives in S-03 | Plan |

## Scope

**In scope:** auto-provision wedding, rename wedding, add round table (RPC), list tables, `/wedding` route + entry routing, `zod`, DTO/service/error-shape foundations, seat-count ceiling.

**Out of scope:** guests/conflicts (S-02); assignment/adjacency/ring (S-03); table edit/resize/delete (S-04); progress counter (S-05); new migration; multi-wedding UX; DB-level seat ceiling; test runner; auth changes.

## Architecture / Approach

Inside-out and thin-endpoint: `src/lib/services/{wedding,table}.service.ts` own all Supabase/RPC access; `src/pages/api/{wedding,tables}.ts` validate with `zod` and map results to `{ data }` / `{ error: { code, message } }` via `src/lib/api.ts`; `src/pages/wedding.astro` server-renders and provisions on load, hydrating a single `WeddingWorkspace` React island that talks to the endpoints via `fetch`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scaffolding & contracts | `zod`, `src/types.ts`, `src/lib/api.ts`, service layer | Over-designing the shared shape too early |
| 2. API endpoints | `PATCH /api/wedding`, `POST /api/tables` | Correct RPC error-code mapping |
| 3. Route, provision & middleware | `/wedding` page, auto-provision, entry routing | Auto-provision race (no `unique(user_id)`) |
| 4. Interactive UI | React workspace: rename + add/list tables | React Compiler / no prop mutation; reuse of auth form components |

**Prerequisites:** F-01 done (it is). Supabase running locally; verify under `npm run preview` (workerd), not `npm run dev`.
**Estimated effort:** ~2–3 after-hours sessions across the 4 phases.

## Open Risks & Assumptions

- **Auto-provision race:** no `unique(user_id)` on `weddings`; two simultaneous first loads could create two rows. Negligible for a single operator — mitigated by always selecting the earliest wedding. A `unique(user_id)` migration is possible future work.
- **Assumption:** one wedding per user for the whole MVP.
- **Deferred:** DB-level seat ceiling stays for S-04; S-01 enforces it only in `zod`.

## Success Criteria (Summary)

- Fresh login → `/wedding` with `Nasze wesele`, renameable inline, persisted.
- Adding a table with N (1–30) seats creates exactly N seats and shows immediately; invalid input is rejected inline with nothing created.
- State survives logout/login; `astro check` + lint pass.
