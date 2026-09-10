# API + RLS Integration Tests (test-plan Phase 2) — Plan Brief

> Full plan: `context/changes/testing-api-rls-integration/plan.md`
> Research: `context/changes/testing-api-rls-integration/research.md`

## What & Why

Rollout Phase 2 of the test plan: stand up the project's **first integration test harness** and use it to prove three protections that are currently untested — no cross-account data leak (RLS/IDOR, risk #3), the server rejects hostile payloads cleanly (risk #5), and the `guest_conflicts` canonical-ordering CHECK holds at the DB layer (#1-DB, follow-up F9, deferred from Phase 1).

## Starting Point

There is zero shared test infrastructure — one pure-unit test file, no fixtures, no `globalSetup`, no CI, no Supabase test scripts. The standalone `vitest.config.ts` is deliberately Astro-free, so importing any API route or `src/lib/supabase.ts` in-process fails on `astro:env/server`. The security model (server-resolved `wedding_id` + RLS backstop) is sound but has no automated coverage; four RLS-only mutations rely entirely on RLS.

## Desired End State

`npm run test:integration` (against a locally running Supabase, with `npm run preview` up) proves the risk-weighted cross-account matrix, the `guest_conflicts` `(B,A)` rejection, and the payload contract; a faster `npm run test:integration:db` runs just the direct-Postgres layer (no preview build) for iterating on the RLS matrix. The fast unit run stays Astro-free and Supabase-free. The cookbook documents how to add integration and API-contract tests.

## Key Decisions Made

| Decision                       | Choice                                                              | Why (1 sentence)                                                              | Source   |
| ------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------- |
| Impersonation                  | Two real anon-key JWT sessions; service-role for setup + DB-check   | Exercises the real `auth.uid()` path — most faithful for a security test.    | Plan     |
| Config shape                   | Separate `vitest.integration.config.ts` (`fileParallelism: false`); two scripts — `test:integration` (full, needs preview) + `test:integration:db` (fast, Supabase-only) | Keeps the fast unit run Astro-free; isolates the fragile Vitest config; a DB-only lane avoids a preview build while iterating. | Plan     |
| Boot strategy                  | Assert running + host guard + `db reset` + programmatic A/B seed     | Lean, deterministic, local-only; Docker lifecycle stays with the developer.   | Plan     |
| Contract-test server           | `npm run preview` (workerd), developer-managed                      | Faithful to the prod runtime; stale-build footgun documented, not automated.  | Plan     |
| Seed strategy                  | Programmatic (Auth admin API), connection from `supabase status`    | Avoids fragile Auth-user-in-SQL; CI-portable; nothing secret in git.          | Plan     |
| RLS matrix breadth             | Risk-weighted (per research crib sheet)                             | Full coverage where regression is real; no padding of structural-denial cells.| Plan     |
| `guest_conflicts.wedding_id`   | Out of scope → new follow-up                                        | Service-invariant gap, not RLS/payload; needs a migration this phase avoids.   | Plan     |

## Scope

**In scope:** integration harness (config, globalSetup, seed, JWT sessions, fixtures); risk-weighted RLS/IDOR matrix across six tables; `guest_conflicts` `(B,A)` DB-check (F9 → DONE); HTTP payload contract tests (#5); cookbook §6.2/§6.3.

**Out of scope:** any migration (so no prod-apply gate); the `guest_conflicts.wedding_id` smell (follow-up); the optional S-04 `seatCount` DB guard (F1); CI wiring; auth-flow/UI/static-page/shadcn tests (§7); starting Supabase or building the app inside `globalSetup`.

## Architecture / Approach

Two seams, two layers. **Direct-Postgres** (`@supabase/supabase-js` with per-user JWTs) for RLS/constraint facts — cheapest, most faithful. **HTTP `fetch`** against `npm run preview` (cookie-jar auth) for payload-contract facts — the only way, since routes can't be imported in-process. A second Vitest config with its own `globalSetup` reads connection details from `supabase status -o json`, guards against non-local destructive ops, resets the DB, and programmatically seeds two users.

## Phases at a Glance

| Phase                                            | What it delivers                                              | Key risk                                                        |
| ------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------- |
| 1. Integration Harness Foundation                | Second config, globalSetup, two-user seed, smoke test        | Harness is net-new — config fragility, seed/isolation design    |
| 2. RLS/IDOR Matrix + guest_conflicts DB-Check    | Risk-weighted cross-account matrix; `(B,A)` `23514`; F9 DONE | Test isolation on a shared DB; missing a meaningful matrix cell  |
| 3. API Payload Contract Tests (#5)               | Hostile payload → clean 4xx, no partial write, no PII        | Stale preview build silently testing old code                   |

**Prerequisites:** local Supabase running (`npx supabase start`); for Phase 3, a fresh `npm run build && npm run preview`.
**Estimated effort:** ~2-3 sessions across 3 phases; Phase 1 (harness) is the bulk of the work.

## Open Risks & Assumptions

- The harness depends on `enable_confirmations = false` in `supabase/config.toml` for programmatic sign-in — a documented coupling that breaks silently if the config changes.
- The stale-build footgun (preview serving old code) is mitigated by documentation only, not automation, per the accepted decision.
- Test isolation on the shared seeded DB is handled by design: each write-spec cleans up its own rows (idempotent service-role `DELETE`) and the integration config runs without file parallelism (`fileParallelism: false`), so residue never corrupts a later "0 rows" assertion regardless of file order.

## Success Criteria (Summary)

- As user B and as anon, every cross-account read/write against user A's data is refused across all six owner-scoped tables; the four RLS-only mutations are covered hardest.
- A non-canonical `guest_conflicts` `(B,A)` insert is rejected by the DB (`23514`); F9 closes.
- Malformed/hostile HTTP payloads return a clean 4xx with no partial write and no guest PII, and a client-supplied `wedding_id` is ignored.
