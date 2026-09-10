# Plan deltas from the secure-integration-testing research note

> Gap analysis: `secure-integration-testing-research.md` vs. the current
> `plan.md`. Answers "what changes should plan.md take on" for Phase 2
> (`testing-api-rls-integration`). Cross-references `research.md`.
>
> Date: 2026-09-06 · Branch: test/add-test-coverage

## Bottom line

The plan is already ~90% aligned with the security note — most of it reached
the plan indirectly through `research.md` (real-JWT impersonation, the
blast-radius guard, `fileParallelism: false`, SQLSTATE oracle discipline, the
`23514` DB-check). The note adds a small number of genuinely new deltas, one
substantive enough to change how assertions are written, plus it exposes one
internal inconsistency already in the plan.

**Must-fix: P1 and P3.** The rest is tightening. No phase restructure needed —
all edits sit inside the existing three phases.

---

## Priority 1 — substantive (changes the assertions)

### P1. Sharpen the cross-account UPDATE/DELETE oracle → re-read as owner

- **Note §2** (the note's most important point): an RLS-blocked UPDATE/DELETE
  returns `error: null` *and* 0 rows affected. The real oracle is to re-read the
  row **as user A** and assert it was not mutated.
- **Plan today** (line 170) handles the "error is null" trap by chaining
  `.select()` and asserting `[]` = 0 rows affected. Correct *for this schema*,
  but it has a blind spot the note closes: PostgREST's `RETURNING` is itself
  filtered by the SELECT policy. If a future migration makes the write policy
  more permissive than the SELECT policy, a real mutation by B could still
  return `[]` from `.update().select()` (B can't read the row back) — a false
  pass. These are regression tests whose job is to catch exactly that drift, so
  re-read-as-owner is strictly more robust.
- **Change**: for the four RLS-only mutations (highest-value IDOR surface), make
  re-read-as-owner post-state verification the primary oracle; keep
  `.select()`-length as complementary. Update Phase 2 #3 Contract (line 170).

### P2. Add cross-wedding-FK-in-payload cells to Phase 3 (#3 × #5 overlap)

- **Note §6**: a `guest_id`/`seat_id` from *another* wedding, submitted in an
  otherwise-valid authenticated request, must be rejected 4xx — IDOR-via-payload.
- **Plan today** (Phase 3 #3, lines 239–244) covers PATCH/DELETE with A's id as B
  → 404 and `wedding_id` ignored, but not the POST case: as user B,
  `POST /api/assignments` (or `/api/conflicts`) referencing **A's**
  `seat_id`/`guest_id` inside B's own valid request. Research §Area 1 (F3)
  flagged the assignment service's seat-membership check (seats→tables join) for
  exactly this.
- **Change**: add a cross-wedding-FK-in-POST cell to `api-idor.test.ts`.

---

## Priority 2 — resolve inconsistencies / tighten service-role discipline

### P3. Resolve the DB-check insert client ambiguity (plan contradicts itself)

- Implementation Approach (line 51) reserves service_role for "seed/teardown
  **and the owner-side DB-check insert**," but Phase 2 #5 (line 186) says the
  insert is "**done as owner**" so RLS passes first and CHECK fires.
- Note §7 suggests a service client; research.md argues for the owner's real JWT.
  Owner-JWT is better here — it proves the CHECK fires on the real insert path a
  buggy service could take, and honors "minimize service-role reach."
- **Change**: pick owner's real JWT explicitly; remove "the owner-side DB-check
  insert" from the service_role reservation (line 51). Record the deliberate
  divergence from note §7 with rationale.

### P4. Narrow service-role reach (per-spec cleanup vs. "globalSetup only")

- **Note §3** wants service-role confined to `globalSetup`/teardown. Plan
  (line 62) spreads it into per-spec `afterAll`/`afterEach` service-role DELETE,
  and fixtures (lines 101–103) expose `createServiceClient()` to every spec.
- Defensible (local throwaway key; most matrix writes are denied → minimal
  residue), but the plan should say so explicitly and add the note's hard rule:
  **the service-role client must never appear in an RLS/IDOR `expect()`.**
- **Change**: add that rule to Critical Implementation Details / Oracle
  discipline; decide and document per-spec cleanup vs. centralized teardown.

### P5. Clarify the smoke-test service-role exception

- **Note §1**: the service-role client may never appear in an `expect()`. The
  smoke test (line 111) asserts service-role reads both weddings.
- Legitimate as a **harness self-check**, not a security assertion — but the
  contradiction should be made explicit.
- **Change**: annotate that service-role assertions are permitted only as a
  harness proof, never in the security matrix.

---

## Priority 3 — minor hardening / bookkeeping

- **P6.** Add `::1` (IPv6 localhost) to the destructive-op host allowlist
  (line 60 lists only `127.0.0.1`/`localhost`; note §4.2 includes `::1`).
- **P7.** Add `secure-integration-testing-research.md` to plan **References**
  (currently absent, lines 307–315); fold its "five rules" into Oracle
  discipline (lines 287–289).
- **P8.** *(optional)* One line each: pgTAP considered-and-deferred (note §5);
  CI-uses-throwaway-keys forward pointer on the CI out-of-scope bullet (note §8).

---

## Already fully covered (no change needed)

Real-JWT impersonation (line 51); blast-radius guard parsing
`supabase status -o json` (line 60); `fileParallelism: false` (line 62);
anon-denial asserted specifically as `42501`, which correctly distinguishes a
forgotten `revoke ... from anon` (0 rows) from real denial (line 162); the
`23514`/`23505` DB-check (line 186); no-PII-in-error (Phase 3 #4);
`wedding_id`-ignored (Phase 3 #3). All five of research.md's Open Questions are
already resolved in the plan.
