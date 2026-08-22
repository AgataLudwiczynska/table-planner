# S-02: Guest & Conflict Management — Plan Brief

> Full plan: `context/changes/guest-and-conflict-management/plan.md`

## What & Why

Add guest management and binary conflict pairs to the wedding workspace — the data the north-star slice (S-03, real-time adjacency validation) consumes. The operator needs to enter their 100–150 guests and declare which pairs must not sit next to each other before any seating validation can mean anything.

## Starting Point

S-01 shipped a `/wedding` workspace (auto-provisioned wedding, rename, add/list round tables) and, more importantly, the reusable domain stack: `ServiceResult` services, a central `API_ERRORS` catalog, thin zod-validated endpoints with a uniform `{ data | error }` envelope, a `ROUTES` registry, `useApiMutation`, and a light-themed React island. F-01 established the owner-only RLS + FK-index pattern. No `guests`/`guest_conflicts` tables exist yet.

## Desired End State

The `/wedding` island becomes tabbed — **Stoły** (unchanged) / **Goście** / **Konflikty**. Goście: add/edit (one reused form) and delete guests (first/last name required, optional side + group). Konflikty: define a "not next to each other" pair via two searchable guest pickers, list all pairs by name, remove instantly. Everything is owner-private in Postgres; `(A,B)` and `(B,A)` can never both exist.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| UI placement | Tabs in `/wedding` (Stoły/Goście/Konflikty) | A 150-guest list can't stack below tables in one column; tabs add no new routes | Plan |
| side/group model | `text` + `CHECK` (not native enum) | MVP values may still change; text+CHECK evolves with a trivial migration | Plan |
| Guest edit UX | Reuse add-form in edit mode | No new UI primitive; one form to maintain; fastest to ship | Plan |
| Conflict pair picker | Two **searchable** guest selects + Add | Scales to 150 guests without a heavy combobox dependency | Plan |
| Delete UX | Confirm guest (cascades conflicts); instant conflict remove | Guard the destructive action, keep the cheap one frictionless | Plan |
| Conflict integrity | API guard (self/duplicate) + DB `check (a<b)` + `unique` backstop | Friendly errors, never a raw 500; canonical unique is a hard S-03 requirement | Plan |
| Verification | Match S-01 (astro check + lint + manual) + SQL/RLS checks | Consistent, fast, no new tooling; still verifies the tricky invariant | Plan |

## Scope

**In scope:** guests CRUD (FR-010/011/012); conflict define/list/remove (FR-014/015/016); new migration + RLS; tabbed workspace.

**Out of scope:** seat assignment, unassigned panel (FR-013 is S-03), adjacency validation, graphical ring, table edit/delete (S-04), progress counter (S-05), severity tiers, native enums, the `assignments` table / "unassign on delete" (S-03), new shadcn primitives, a test runner.

## Architecture / Approach

Database-change ordering: **migration → services → endpoints → client**. Two new owner-scoped tables copy F-01's RLS shape (owner-chain via `wedding_id → weddings.user_id`, `revoke anon`, `(select auth.uid())`). `guest.service` + `conflict.service` own all Supabase access; `conflict.service` owns the integrity logic (self-pair guard → canonical string-sort of the two ids → both-guests-in-wedding check → duplicate pre-check → insert, with SQLSTATE `23505` as the race backstop). Thin endpoints validate with zod and emit the uniform envelope. The page server-loads guests + conflicts; one tabbed React island hosts all interactivity.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | `guests` + `guest_conflicts` migration, RLS, canonical constraint, regenerated types | RLS policy error = data leak; canonical `check`/`unique` must be exactly right |
| 2. Contracts & services | Types, new error codes, guest + conflict services | Canonical id-ordering in the service must match the DB `check` |
| 3. API endpoints | `/api/guests` (POST/PATCH/DELETE), `/api/conflicts` (POST/DELETE), page load | Mapping duplicate/self/foreign-guest to friendly codes |
| 4. Tabbed UI | Tabs + Goście (add/edit/delete) + Konflikty (searchable pickers, list, remove) | Searchable picker without a heavy dependency; no Stoły regression |

**Prerequisites:** F-01 (done) and S-01 patterns (done). Local Supabase running for the migration + `db:types`.
**Estimated effort:** ~3–4 sessions across 4 phases; the DB + conflict-integrity work is the only non-boilerplate part.

## Open Risks & Assumptions

- `group` is a reserved SQL word — column named `guest_group` to avoid quoting; DTO field stays `group`.
- Canonical ordering relies on lexicographic UUID comparison; the service must string-sort ids the same way the DB `check (guest_a_id < guest_b_id)` expects, or legitimate pairs get rejected.
- FR-012's "unassign on delete" is a no-op here (no `assignments` table until S-03); guest delete only cascades conflicts.
- Searchable-picker approach (native `datalist` vs. minimal in-island combobox) left to the implementer — either satisfies the contract with no new dependency.

## Success Criteria (Summary)

- Operator can add/edit/delete guests and define/list/remove conflict pairs, all persisting across logout/login.
- A conflict between two guests can be created in either pick order but is stored once; self-pairs and duplicates are rejected with a Polish message.
- A second account sees none of the first account's guests or conflicts (RLS verified).
