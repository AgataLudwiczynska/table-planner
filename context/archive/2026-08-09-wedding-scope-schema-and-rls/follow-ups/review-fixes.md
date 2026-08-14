# F-01 review — deferred follow-ups

Items surfaced by `/10x-impl-review` (report: `../reviews/impl-review.md`) that were
intentionally deferred rather than fixed in F-01. Not blockers.

## F1 — Bound `seat_count` upper limit (deferred from F-01)

- **Source finding**: F1, `reviews/impl-review.md` (WARNING / Safety & Quality)
- **Why deferred**: `create_table_with_seats` guards `p_seat_count <= 0` but has no
  ceiling; `generate_series(1, p_seat_count)` would materialize any value passed.
  Real but low-risk (owner-only blast radius). A DB-level fix means a **new one-way
  forward migration + `npm run db:types` + prod push** — not worth that process on
  its own.
- **Where to land it**:
  - **Primary — S-01** (`zod` + first domain endpoint): add an upper bound to the
    create-table input schema (e.g. `seat_count` max ~50, comfortably above the
    ~20-seat PRD max) so the API rejects oversized requests before the RPC runs.
  - **Optional DB-level — S-04** (`resize_table` migration): if a defense-in-depth
    guard inside the RPC is wanted, fold `if p_seat_count > <max> then raise ...`
    into that migration, which already touches this RPC family — avoids a standalone
    migration.
- **Status**: OPEN — carry into S-01 planning.
