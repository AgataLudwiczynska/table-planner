# Test Rollout Phase 1 — Vitest Bootstrap + Adjacency Guardrail — Plan Brief

> Full plan: `context/changes/testing-bootstrap-adjacency-core/plan.md`
> Research: `context/changes/testing-bootstrap-adjacency-core/research.md`

## What & Why

Stand up the project's test runner (Vitest — there are **0 test files today**) and lock
**Risk #1** from the test plan: two "nie obok" guests sit adjacent but no red flag appears —
the `false-negatives = 0` guardrail silently fails. That guardrail is a single pure module
(`src/lib/adjacency.ts`) with no automated coverage and no runtime backstop; a bug in it is
invisible until an operator eyeballs the ring.

## Starting Point

`src/lib/adjacency.ts` (`validateTable` + `validateAllTables`) is the entire guardrail —
client-only, re-derived on every render, no server or SQL re-implementation. Toolchain is
clean-slate: Vite is pinned `^7.3.2`, no Vitest, no config, no `test` script, and the `@/*`
alias must be replicated for the runner.

## Desired End State

`npm test` runs a Vitest suite that fails the moment the adjacency guardrail could miss a
flag — covering the ring wrap edge, the 2-seat degenerate collapse, partial occupancy, order
independence, and cross-table independence, all with expectations derived **by hand from ring
geometry**. Lint and `astro check` stay green; the test-plan cookbook §6.1 documents the
pattern; follow-up F6 is closed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Phase 1 test layers | Unit-only; DB `check`-constraint test deferred to Phase 2 | Violation logic is pure with no DB dependency; Phase 2 already stands up local Supabase | Plan |
| Client vs server adjacency parity | Not tested — confirmed moot | Research found one implementation; there is nothing to drift | Research |
| Test globals | Explicit `import { describe, it, expect } from 'vitest'` | Cleanest under strict type-aware ESLint; zero tsconfig types wiring | Plan |
| Vitest config | Standalone `defineConfig` (`vitest/config`) + `@` alias | `getViteConfig()` fails at startup under the cloudflare adapter; pure type-only module needs only the alias (reverses plan-review F2) | Plan |
| Suite structure | Primarily `validateAllTables`; `validateTable` for n=1/n=2/wrap | Tests the public contract while keeping geometry-edge maps readable | Plan |
| Oracle source | Expected violations derived by-hand from ring geometry | Deriving them from the implementation would encode a bug as the expectation | Research |

## Scope

**In scope:** Vitest install + standalone alias config + `test`/`test:run` scripts;
oracle-disciplined unit suite over `adjacency.ts`; CLAUDE.md commands, test-plan §6.1
cookbook, F6 closure.

**Out of scope:** any DB/integration test (→ Phase 2), DOM/component/DnD tests, Cloudflare
Workers pool, CI gate enforcement (→ Phase 4), any change to `adjacency.ts` itself.

## Architecture / Approach

Additive tooling only — no runtime code changes. Three phases: (1) make the runner exist and
prove the `@/*` alias resolves with a throwaway smoke test; (2) replace it with the real
oracle-disciplined suite; (3) document and do bookkeeping. The load-bearing discipline: every
expected `Violation` set is a hand-derived literal from the ring-edge table, never a snapshot
of the function's own output.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vitest bootstrap | Runner, config, scripts, alias proven via smoke test | Alias not resolving (Vitest 4.x × Vite 7 peer confirmed; pin exact `4.1.11`) |
| 2. Adjacency unit suite | Oracle-disciplined cases for wrap / 2-seat / order / cross-table | Oracle problem — expectations copied from the impl instead of by-hand |
| 3. Docs & bookkeeping | CLAUDE.md, test-plan §6.1, F6 closed | Deferral to Phase 2 left undocumented |

**Prerequisites:** none — clean additive change on the current branch.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Vitest pinned exact `4.1.11` (advisory floor; supply-chain rationale in the Addendum)
  resolves cleanly against the `vite: ^7.3.2` override; its Vite peer declares Vite 7
  (confirmed 2026-08-29; see `tooling-vitest-setup.md` → *Addendum*).
- Assumes the smoke test and suite pass `strictTypeChecked` ESLint with no config change; a
  minimal test-file override is added only if a strict rule genuinely misfires.

## Success Criteria (Summary)

- `npm test` runs and the adjacency suite fails if the wrap edge, 2-seat collapse, or order
  independence regresses.
- Lint + `astro check` green on all new files; test-plan §6.1 filled; F6 marked DONE.
