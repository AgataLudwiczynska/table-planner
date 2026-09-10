---
change_id: testing-api-rls-integration
title: API + RLS integration tests (test-plan Phase 2)
status: archived
created: 2026-08-30
updated: 2026-09-10
archived_at: 2026-09-10T19:57:19Z
---

## Notes

Rollout Phase 2 of context/foundation/test-plan.md: "API + RLS integration".

Risks covered: #3 (cross-account read/modify — RLS/IDOR gap), #5 (server trusts client input — malformed/hostile payload causes 500 or partial write instead of clean 4xx), plus the #1 DB-check deferred from Phase 1 (the guest_conflicts `check (guest_a_id < guest_b_id)` canonical-ordering constraint).

Test types planned: integration (local Supabase, two-user fixtures + API contract tests).

Risk response intent:
- #3: prove that as user B, SELECT/INSERT/UPDATE/DELETE against user A's rows returns 0 rows or 42501, and anon returns permission denied, across all owner-scoped tables; challenge "logged-in implies authorized" (IDOR) and that each table inherited the anon-grant revocation.
- #5: prove malformed bodies (missing/wrong-typed fields, out-of-range seat_count, a guest/seat FK from another wedding) get a clean 4xx with no partial write and no guest PII in the error body; challenge "the client validated, therefore the server can trust the payload".
- #1 DB-check: prove the guest_conflicts constraint rejects a non-canonical (B,A) insert (order independence at the DB layer, deferred here because this phase already stands up local Supabase).
