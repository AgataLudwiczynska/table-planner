<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Vitest Bootstrap + Adjacency-Conflict Guardrail

- **Plan**: context/changes/testing-bootstrap-adjacency-core/plan.md
- **Mode**: Deep
- **Date**: 2026-08-29
- **Verdict**: SOUND (post-triage — F1 resolved, F2 risk accepted, F3 fixed; REVISE at review time)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

8/8 paths ✓ (`vitest.config.ts` absent = expected new file). Symbols ✓: `validateTable`/`validateAllTables` at `adjacency.ts:13-47`, wrap edge `:26`, 2-seat collapse `:23`, `pairKey` not exported. brief↔plan ✓. Progress↔Phase ✓ (single `## Progress`, every phase/criterion has a matching checkbox). `getViteConfig` present in astro 6.4.8; vite 7.3.3 (override `^7.3.2`); vitest absent; F6 OPEN at `follow-ups.md:27`; §6.1 TBD and "No test suite" caveat both present; `tsconfig` includes `**/*`. No migration in this plan.

## Findings

### F1 — Plan pins Vitest "3.x line"; 4.x is current and is the line that declares Vite 7 support

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots / Plan Completeness
- **Location**: Phase 1 §1 (Vitest dependency); plan-brief "Key Decisions"
- **Detail**: Plan targets "vitest (3.x line, compatible with the pinned vite ^7.3.2)". Registry: vitest latest = 4.1.11, whose vite peer is `^6.0.0 || ^7.0.0 || ^8.0.0` — the 4.x line explicitly supports Vite 7. Vitest 3.x's Vite-7 support is asserted, not established; a bare `^3` risks resolving an early 3.x peering vite `^5||^6`, conflicting with the ^7.3.2 override. The plan's remedy is also backwards ("a peer conflict signals a wrong Vitest major — do not force"): against Vite 7 the fix is a newer line, not a lower one.
- **Fix A ⭐ Recommended**: Target `vitest@^4` (current line, peers vite ^7)
  - Strength: 4.x is the maintained line and lists vite 7 in peers — the exact compatibility the plan wants to guarantee.
  - Tradeoff: Verify the getViteConfig()/vitest-4 template shape (minor).
  - Confidence: HIGH — peer range read from the registry.
  - Blind spot: Install not run; 4.x node-engine floor unchecked (Node 22.14 almost certainly fine).
- **Fix B**: Keep 3.x but pin the exact minor that added Vite 7 support
  - Strength: Stays on the line the plan already reasoned about.
  - Tradeoff: Must confirm which 3.x minor first peers vite ^7; adopts an older line than latest on day one.
  - Confidence: MED — 3.x's vite peer not confirmed in this pass.
  - Blind spot: Same install not run.
- **Decision**: RESOLVED (Fix A) — verified via Context7 + GitHub Advisory Database (2026-08-29): pinned `vitest@4.1.11` (exact; 4.x peer range declares vite ^7; Node floor 20 ≤ 22.14; `4.1.11` is the advisory floor). Plan + brief wording updated; full rationale in `tooling-vitest-setup.md` → *Addendum — version decision*.

### F2 — getViteConfig() boots the full Astro/Cloudflare config for a pure-node suite

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 1 §3 (Vitest configuration); Manual criterion 1.7
- **Detail**: `adjacency.ts` imports only types, so the suite is pure ESM. `getViteConfig()` resolves the whole Astro Vite pipeline — Cloudflare adapter, astro:env, Tailwind — at test startup, and the plan then lists manual risk 1.7 "no spurious Vite/Astro boot errors" (the risk that config introduces). A ~3-line `vitest.config.ts` with `resolve.alias { '@': .../src }` covers this phase with zero Astro boot and removes risk 1.7. The plan's rationale is Phase 2/3 future-proofing (DOM/astro:env), but those are explicitly out of scope now and re-adopting getViteConfig later is cheap.
- **Fix A ⭐ Recommended**: Minimal alias-only `vitest.config.ts` for this phase; adopt getViteConfig when a later phase needs astro:env/DOM
  - Strength: Zero Astro boot; deletes manual risk 1.7; matches the repo's "add abstraction when needed" pattern.
  - Tradeoff: A later DOM/astro:env phase reintroduces getViteConfig.
  - Confidence: MED — depends on how soon a Phase-2 config need lands.
  - Blind spot: Phase 2's exact config needs not confirmed.
- **Fix B**: Keep `getViteConfig()` (as planned)
  - Strength: Matches the official with-vitest template; no re-work when DOM/astro:env tests arrive; alias/Tailwind resolve for free.
  - Tradeoff: Boots the Cloudflare-adapter config for a pure-fn test; keeps risk 1.7 live.
  - Confidence: HIGH — documented, working Astro approach.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (Fix B) — keep getViteConfig() as planned; matches the official with-vitest template and avoids re-work when Phase 2/3 add DOM/astro:env tests. Plan unchanged.

### F3 — Order-independence unit test framed as "substituting for" the deferred DB check test

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 (order-independence bullet); "What We're NOT Doing"
- **Detail**: Phase 2 says the (A,B)/(B,A) case "substitutes at the unit layer for the deferred DB check test." Two different mechanisms: the validator's `pairKey` canonicalization vs. the DB `check (guest_a_id < guest_b_id)` rejecting a non-canonical insert. The unit test cannot prove the DB constraint. Elsewhere the plan correctly defers the DB fact to rollout Phase 2, so this wording could let a reader think the DB behavior is already covered.
- **Fix**: Soften to "proves the guardrail is order-independent; the DB check-constraint assertion remains separately owed in rollout Phase 2" — drop the "substitutes" framing.
- **Decision**: FIXED — plan.md Phase 2 §2 order-independence bullet reworded; "substitutes"/"stands in" framing removed, DB check-constraint noted as separately owed in rollout Phase 2.
