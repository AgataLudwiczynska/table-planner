---
change_id: testing-bootstrap-adjacency-core
title: Test rollout Phase 1 — bootstrap the runner and cover adjacency-conflict detection
status: impl_reviewed
created: 2026-08-25
updated: 2026-08-29
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md`: "Bootstrap + adjacency core".

**Risks covered:** #1 — two "nie obok" guests sit adjacent but no red flag appears (the false-negatives = 0 guardrail silently fails).

**Test types planned:** unit + integration. This phase also stands up the test runner (Vitest — none exists yet; 0 test files today).

**Risk response intent (from §2 Risk Response Guidance):**
- **Prove:** a conflict pair placed at ring seats N and N±1 — including the wrap (seat 1 ↔ seat max) and the 2-seat degenerate table — is reported as a violation; non-adjacent placement is not. Both the pure ring-adjacency function and the violation computation over assignment state must be covered.
- **Challenge:** "the 4-seat happy case highlights, therefore adjacency is correct"; canonical conflict-pair order (A,B) = (B,A); and whether client and server share one adjacency function or two implementations that can drift.
- **Avoid:** the oracle problem — deriving expected violations from the implementation instead of by-hand ring geometry; and happy-path-only coverage that skips the wrap and 2-seat cases.
