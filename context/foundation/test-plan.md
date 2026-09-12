# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-12 (Phase 2 complete)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic check that already catches the
   regression. This validator is deterministic — a pure ring-adjacency
   function tested as a unit outranks any browser test for the core
   guardrail.
2. **User concerns are first-class evidence.** Risks anchored in "the
   operator is worried about X, and the failure would surface somewhere in
   `<area>`" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the ground
   truth.

Hot-spot scope used for likelihood weighting: `src/` (sole source root),
excluding generated `src/db/database.types.ts`. History is thin (5
src-commits/30d, squashed feature merges), so churn is weak likelihood
evidence and is corroborated by the Phase 2 interview.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                        | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Two "nie obok" guests sit adjacent but no red flag appears — the guardrail silently fails (false-negative)     | High   | High       | PRD FR-021/FR-022 guardrail "walidacja nigdy nie milczy, false-negatives = 0"; interview Q1; interview Q3 (adjacency = low-confidence); hot-spot `src/lib/services/` (7 commits/30d) |
| 2   | Drag-and-drop drops a guest on the wrong seat, fails to commit, or double-seats someone (invariant break)      | High   | Medium     | interview Q1 + Q3; PRD FR-017/FR-019; hot-spot `src/components/wedding/` (7 commits/30d)                                                                                             |
| 3   | Another account (or anon) reads or modifies someone else's wedding — RLS / IDOR gap                            | High   | Medium     | PRD Privacy guardrail + Access Control; lessons.md "revoke anon grants"; interview Q3 (RLS low-confidence)                                                                           |
| 4   | Table resize / auto-unassign leaves inconsistent state (partial write, orphaned assignment)                    | High   | Medium     | PRD US-02 / FR-008; roadmap S-04 (upcoming → raises likelihood); lessons.md "atomic transactions"                                                                                    |
| 5   | Server trusts client input — malformed or hostile payload causes a 500 or partial write instead of a clean 4xx | Medium | Medium     | Abuse lens (untrusted input); Zod present; follow-ups.md F-01 unbounded `seat_count`; hot-spot `src/pages/api/` (6 commits/30d)                                                      |
| 6   | Plan not durable across logout/login — assignments, conflicts, or tables come back wrong                       | High   | Low        | PRD US-03 + NFR persistence; roadmap S-05 (self-described low-risk, "mainly verification")                                                                                           |

**Impact × Likelihood rubric.** Score both axes on a coarse High / Medium /
Low scale so two readers agree on the same row.

| Rating | Impact                                                                                  | Likelihood                                                           |
| ------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| High   | user loses access, data, or trust in the guardrail; failure is silent or hard to notice | area is core and low-confidence, or we have already been burned here |
| Medium | feature degrades, a workaround exists                                                   | touched occasionally, plausible source of bugs                       |
| Low    | cosmetic or easily reverted                                                             | stable code, rarely touched                                          |

Order rows by impact × likelihood. Protect High × High first. Risk #6 is
High × Low: per the rubric it earns a **light** treatment — persistence is
asserted incidentally by the DB round-trip in the #2–#4 integration tests
plus one smoke — not a dedicated heavy suite.

**Abuse / security lens.** The product has auth and accepts user input (no
payments). Two abuse rows are included: authorization/IDOR (#3 — does the
endpoint verify _this wedding belongs to you_, not merely _you are logged
in_?) and untrusted-input parity (#5 — the server must not trust the
client). Resource abuse (rate-limit bypass, email floods) is out of scope —
small-scale solo MVP with no email-sending flow; see §7.

**Folded during the challenger pass.** A candidate risk "client vs server
adjacency divergence" was dropped as a standalone row — it is speculative
until research confirms two adjacency implementations actually exist. It is
folded into Risk #1's "Must challenge / Context to ground" (does the server
re-implement adjacency, or does both paths share one pure function?).

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                             | Must challenge                                                                                                                                                                  | Context `/10x-research` must ground                                                                                                                                     | Likely cheapest layer                                                                                                           | Anti-pattern to avoid                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | Ring places a conflict pair at seats N and N±1 (including the wrap seat 1 ↔ seat max, and the 2-seat degenerate table) → violation reported; non-adjacent placement → not reported                      | "the 4-seat happy case highlights, therefore adjacency is correct"; canonical pair order (A,B) = (B,A); whether client and server share one adjacency function or two can drift | ring-wrap formula; conflict-pair canonical ordering; where adjacency is computed (client vs server) and whether they share code; how a violation maps back to two seats | unit (pure ring fn) + integration (violation calc over assignment state)                                                        | **Oracle problem** — deriving expected violations from the implementation instead of by-hand ring geometry; happy-path-only (skipping wrap + 2-seat) |
| #2   | Assign to empty seat, assign onto an occupied seat, click-fallback path, and unassign each produce exactly one intended assignment; the invariant (≤1 guest/seat, ≤1 seat/guest) is never broken        | "the drop event fired, therefore the correct seat was persisted"; optimistic UI equals server truth                                                                             | assignment entry point (service/API); how seat identity is resolved on drop; where the invariant is enforced (DB constraint vs app)                                     | integration on assignment service/API for the logic; e2e reserved for real pointer DnD only                                     | e2e where integration suffices; over-mocking the DnD library                                                                                         |
| #3   | As user B, SELECT/INSERT/UPDATE/DELETE against user A's rows returns 0 rows or `42501`; anon returns permission denied — across all owner-scoped tables                                                 | "logged-in implies authorized" (IDOR); that each new table inherited the anon-grant revocation                                                                                  | RLS policies per table; owner-scoping in service queries; whether the API re-checks ownership or relies solely on RLS                                                   | integration against local Supabase with two users (automate the existing `docs/reference/rls-verification-protocol.md` runbook) | testing only the owner happy path (that is not a security test)                                                                                      |
| #4   | Shrinking 10→5 seats with 7 assigned atomically yields 5 seats, 2 guests unassigned (highest-numbered), related violations recomputed; cancel changes nothing; a mid-operation failure rolls back fully | "the final seat count looks right, therefore state is consistent"; that the confirm dialog only matters when the new count drops below assigned                                 | whether resize + unassign is one transaction / Postgres function; operation ordering; how violations recompute                                                          | integration against the DB (assert post-state + rollback)                                                                       | happy-path-only (skipping cancel + partial-failure); brittle seat-order assumption                                                                   |
| #5   | Malformed bodies (missing / wrong-typed fields, out-of-range `seat_count`, a guest/seat FK from another wedding) get a clean 4xx with no partial write and no guest PII in the error body               | "the client validated, therefore the server can trust the payload"                                                                                                              | per-endpoint Zod schemas; error translation shape; what bounds exist on `seat_count`                                                                                    | integration (contract) on the API endpoints                                                                                     | asserting the exact error string copied from the error helper (oracle problem)                                                                       |
| #6   | After logout → login, assignments, conflicts, and tables are identical to the pre-logout state                                                                                                          | "it's just Postgres, so there is nothing to test"                                                                                                                               | which state is persisted vs derived; session boundary                                                                                                                   | covered by the #2–#4 integration DB round-trips + one manual/e2e smoke                                                          | a dedicated heavy suite duplicating #2–#4                                                                                                            |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

> These rollout phases are tracked as issues in Linear (project `TablePlanner MVP`, milestone `M4: Quality gates green`). See `context/foundation/tasks-linear.md` for the mapping.

| #   | Phase name                              | Goal (one line)                                                                                                         | Risks covered                                 | Test types         | Status        | Change folder                                     |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------ | ------------- | ------------------------------------------------- |
| 1   | Bootstrap + adjacency core              | Stand up the runner; lock the guardrail so ring adjacency (wrap + 2-seat) and conflict-violation computation never miss | #1                                            | unit + integration | complete      | context/archive/2026-08-25-testing-bootstrap-adjacency-core/ |
| 2   | API + RLS integration                   | No cross-account leak; the server rejects hostile input cleanly                                                         | #3, #5 (+ #1 DB-check, deferred from Phase 1) | integration        | complete      | context/archive/2026-08-30-testing-api-rls-integration/      |
| 3   | Assignment invariant + resize atomicity | Invariant always holds; S-04 resize/auto-unassign is atomic; state round-trips                                          | #2 (logic), #4, #6                            | integration        | not started   | —                                                 |
| 4   | Critical-path e2e + quality gates       | One e2e proves the north-star flow including real drag-and-drop; wire lint + typecheck + tests as required CI gates     | #2 (pointer DnD)                              | e2e + gates        | not started   | —                                                 |

**Status vocabulary** (fixed — parser literals):

| Value           | Meaning                                                             |
| --------------- | ------------------------------------------------------------------- |
| `not started`   | No change folder for this rollout phase yet.                        |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched`    | `research.md` exists in the change folder.                          |
| `planned`       | `plan.md` exists with a `## Progress` section.                      |
| `implementing`  | Progress section has at least one `[x]` and at least one `[ ]`.     |
| `complete`      | Progress section is fully `[x]`.                                    |

Order rationale: cheapest-highest-value first (pure logic, no infrastructure),
then DB-backed integration, then the expensive pointer-level e2e last. There
is deliberately **no AI-native phase** — this is a deterministic validator;
the only defensible AI-native candidate (selective multimodal review of the
SVG ring, FR-023) is optional and the operator explicitly deprioritized
visual tests (interview Q5). It is recorded in §5 as optional and in §7.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date. Recommendations are grounded in the local manifest plus the
MCP/tools exposed in the current session.

| Layer                | Tool                                             | Version                   | Notes                                                                                                                                 |
| -------------------- | ------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration   | Vitest                                           | none yet — see §3 Phase 1 | Fits the existing Vite/Astro toolchain; no separate runner to reconcile.                                                              |
| integration (DB)     | local Supabase (`npx supabase start`)            | present                   | Two-user fixtures for RLS/IDOR; asserts real Postgres + RLS behavior.                                                                 |
| e2e                  | Playwright                                       | none yet — see §3 Phase 4 | Reserved for the north-star flow incl. real pointer drag-and-drop.                                                                    |
| accessibility        | none                                             | —                         | Not in scope for MVP (see §7).                                                                                                        |
| (optional) AI-native | multimodal SVG-ring review — checked: 2026-08-25 | n/a                       | When NOT to use: any regression a deterministic unit/integration test catches — i.e. the conflict-flag logic. Optional, low priority. |

**Stack grounding tools (current session):**

- Docs: Context7 — available; use for current Vitest / Playwright / Supabase-testing setup APIs when Phase 1/4 wires the runner; checked: 2026-08-25
- Search: Exa.ai — available; use to confirm current Astro + Vitest integration guidance and Cloudflare Workers test patterns; checked: 2026-08-25
- Runtime/browser: no Playwright MCP this session — `claude-in-chrome` skill available as a fallback e2e driver; checked: 2026-08-25
- Provider/platform: Supabase (local CLI) for RLS integration; GitHub `gh` CLI + Cloudflare Workers Builds for gate wiring; Linear for issue tracking; checked: 2026-08-25

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                                     | Where                | Required?                                               | Catches                                                 |
| ---------------------------------------- | -------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| lint + typecheck                         | local + CI           | required (already wired: `npm run lint`, `astro check`) | syntactic / type drift, Rules-of-React violations       |
| unit + integration                       | local + CI           | required after §3 Phase 1                               | adjacency / conflict / invariant logic regressions      |
| RLS cross-account integration            | CI                   | required after §3 Phase 2                               | privacy / IDOR leaks                                    |
| e2e on the critical flow                 | CI on PR             | required after §3 Phase 4                               | broken north-star assign → conflict-flag path           |
| prod migration apply                     | between merge + prod | required for any slice with a migration                 | schema drift (lessons.md: S-02 migration never applied) |
| multimodal visual review of the SVG ring | CI on PR             | optional                                                | ring rendering regressions classic tests miss           |
| post-edit hook                           | local (agent loop)   | recommended                                             | regressions at edit time (Module 3 Lesson 3)            |

The "prod migration apply" gate is not a test but a release gate — it is
included because the operator's top past-pain (interview Q2) and lessons.md
both flag migrations merged but never applied to prod.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, it reads "TBD — see §3 Phase N."

### 6.1 Adding a unit test

- **Location & naming**: colocate as `src/**/*.test.ts` next to the module under test (e.g. `src/lib/adjacency.test.ts` beside `src/lib/adjacency.ts`).
- **Runner & config**: Vitest, `environment: 'node'`, standalone `vitest.config.ts` replicating only the `@/*` alias — no Astro/Cloudflare boot. Import test helpers explicitly (`import { describe, it, expect } from 'vitest'`); there is no `globals`.
- **Run command**: `npm run test:run` (single-pass) or `npm test` (watch).
- **Reference test**: `src/lib/adjacency.test.ts` — typed fixture factories building domain shapes from `src/types.ts` (camelCase, not `*Row`), a `ringTable(n)` helper, and violations compared as unordered `{guestAId, guestBId}` sets.
- **Oracle discipline** (load-bearing): derive every expected value by-hand from the spec/geometry and write it as a literal. Never snapshot the function's own output as the expectation — that encodes a bug as the oracle.

### 6.2 Adding an integration test (service / DB)

- **Prerequisite**: a local Supabase must be running — `npx supabase start` (Docker). The harness fails fast with that message if it is not, and before any destructive step it guards that the DB host is local (`127.0.0.1`/`localhost`/`::1`), so a mis-targeted reset can never hit a remote database.
- **Config & runner**: a second Vitest config, `vitest.integration.config.ts` (separate from the Astro-free `vitest.config.ts` so the fast unit lane never touches Supabase). It wires a `globalSetup`, runs specs single-fork with `fileParallelism: false` (one shared local DB), and replicates the `@/*` alias. It boots no Astro/Cloudflare — specs never import `src/lib/supabase.ts` (its `astro:env/server` import cannot resolve here).
- **Two lanes**: `npm run test:integration:db` runs only the direct-Postgres specs (`test/integration/db/**`) and needs just local Supabase; `npm run test:integration` runs everything, including the HTTP contract layer (§6.3, needs `npm run preview` too). The fast unit lane (`npm run test:run`) is unchanged.
- **Seed & sessions** (`test/integration/global-setup.ts`): reads connection details from `supabase status -o json` (never from committed env), runs `db reset`, then programmatically seeds two users A and B — each an Auth-admin-created, pre-confirmed account (`enable_confirmations = false`) with a full owner-owned graph (wedding → table+seats via the RPC → guests → a canonical `guest_conflicts` pair → an assignment). It signs both in to mint real JWTs and exposes connection + per-user credentials/ids to specs via Vitest `provide`/`inject`.
- **Seam & clients** (`test/integration/fixtures.ts`): specs build `@supabase/supabase-js` clients directly — `createUserClient(accessToken)` for a real per-user session (production-faithful `authenticated` role), an anon client, and `createServiceClient()` for setup/teardown only.
- **Oracle discipline** (load-bearing): every RLS/IDOR assertion runs under a real user or anon JWT; the `service_role` client (`BYPASSRLS`) may appear only in seed/teardown and the harness smoke self-check — never in a security `expect()`. Assert on SQLSTATE (`42501`/`23514`/`23505`) and row-count / post-state, never on copied message strings.
- **Reference**: `test/integration/db/smoke.test.ts` (two JWT sessions + the service-role self-check).

### 6.3 Adding a test for a new API endpoint

- **Prerequisite (developer-owned)**: the built preview server must be running — `npm run build && npm run preview` (workerd, prod-faithful). The HTTP harness fails fast with that message if it is unreachable. A **stale build silently tests old code** — always rebuild before an integration run.
- **Env coupling**: preview reads `SUPABASE_URL`/`SUPABASE_KEY` from `.dev.vars`; both must point at the **same local Supabase** (`127.0.0.1:54321`) that `globalSetup` reset+seeds. If they diverge, signin fails with a confusing auth error (the seeded users don't exist in the other store), not the readiness message.
- **Run command**: `npm run test:integration` (the full lane — runs the direct-Postgres specs _and_ the HTTP contract layer, so it can never report green while skipping the security tests). `npm run test:integration:db` skips the HTTP layer (no preview needed) for a fast inner loop.
- **Seam & auth** (`test/integration/http/http-client.ts`): real `fetch` against the preview base URL with a cookie jar. `signIn(email, password)` posts to the form endpoint and captures the Supabase session cookies; `authedFetch(jar, path, init)` replays them. Address endpoints via `ROUTES.*`, not path literals.
- **Oracle discipline** (load-bearing): assert on HTTP **status + error `code`**, never the copied Polish message string (oracle problem). For "no partial write", re-read the target scope with `createServiceClient()` and assert row counts. For IDOR-via-payload the code is deliberately **not** pinned (a foreign seat → `seat_not_found` 404, a foreign guest → `invalid_guest` 400) — assert a 4xx-class status plus nothing written.
- **No data echo**: error bodies are a `{ code, message }` shape — for most codes `message` is the static catalog string, but the `validation_error` branch returns the zod issue's own message (`parsed.error.issues[0].message` — see guests.ts / conflicts.ts / assignments.ts). Those zod messages are hand-written static strings and **must stay free of the received input**: never interpolate a user-supplied value into a zod message, or it leaks through the error path. A spec sends a recognizable value in the payload and asserts the raw body does not contain it.
- **Reference**: `test/integration/http/api-validation.test.ts` (malformed → 4xx), `api-idor.test.ts` (404 path + `wedding_id` ignored), `api-error-body.test.ts` (no input echo).

### 6.4 Adding an e2e test

- TBD — see §3 Phase 4 (north-star critical flow incl. real pointer drag-and-drop).

### 6.5 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2-3 line note
here capturing anything surprising the phase taught.)

- **Phase 1 (Bootstrap + adjacency core):** shipped as pure-logic unit coverage only. The "integration" slice of its test-types — asserting the `guest_conflicts` `check (guest_a_id < guest_b_id)` constraint rejects a non-canonical `(B,A)` insert — is **intentionally deferred to Phase 2** (API + RLS integration), which already stands up local Supabase; Phase 1 does not pull Docker/Supabase into an otherwise pure-logic phase. Order independence _at the guardrail_ is proven at the unit layer here.

## 7. What We Deliberately Don't Test

Exclusions agreed during the Phase 2 interview (Q5). Respect these unless the
underlying assumption changes.

- **Auth-flow internals** (Supabase email/password signin/signup/signout) — thin wrappers over a trusted library. Re-evaluate if custom auth logic is added. (Source: interview Q5.)
- **UI pixel / snapshot tests** — brittle, break on every style change, catch little; the guardrail is logic, not pixels. (Source: interview Q5.)
- **Static Astro pages & layout** — no branching logic. Re-evaluate if a page gains real conditional behavior. (Source: interview Q5.)
- **shadcn/ui primitives + generated `database.types.ts`** — the library / generator is the test. (Source: interview Q5.)
- **Rate-limiting / resource-abuse** — small-scale solo MVP, no email-sending flow, `target_scale.users: small`. Re-evaluate if the product opens to multi-tenant or public sign-up at scale. (Source: abuse-lens calibration.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-25
- Stack versions last verified: 2026-08-25
- AI-native tool references last verified: 2026-08-25

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
