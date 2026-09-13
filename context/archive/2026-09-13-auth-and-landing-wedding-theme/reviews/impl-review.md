<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth & Landing Wedding Theme

- **Plan**: context/changes/auth-and-landing-wedding-theme/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated verification (re-run 2026-09-13)

- `grep` dark-token sweep across `src/` — clean (no matches)
- `grep "star"` in Welcome/Topbar — clean
- `grep "bg-cosmic" src/` — clean
- `npm run lint` — pass (0 errors)
- `npx astro check` — 0 errors, 0 warnings, 4 hints (pre-existing `tseslint.config` deprecation notices in `eslint.config.js`, unrelated to this change)
- `npm run build` — pass (Cloudflare adapter, server built in ~5s)
- `npm run test:run` — pass (2 files, 16 tests)

## Findings

### F1 — Polish plural not agreed in the password countdown hint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/SignUpForm.tsx:60
- **Detail**: The hint reads `Brakuje jeszcze {MIN_PASSWORD_LENGTH - password.length} znaków`. With `MIN_PASSWORD_LENGTH = 6`, the remaining count is 1–5, but Polish count-noun agreement needs `znak` (1), `znaki` (2–4), and `znaków` (5). So the hint is grammatically wrong for the most common cases: "Brakuje jeszcze 2 znaków" should be "2 znaki". The original English handled singular/plural correctly (`character` / `characters`); the translation dropped agreement entirely. The plan gave `Brakuje jeszcze N znaków` only as an example ("e.g."), so this follows the plan literally but ships incorrect UI copy in a Polish-first app. (The static strings at line 35 and the placeholder at line 90 both use a fixed `6`, where `znaków` is correct — only the dynamic hint is affected.)
- **Fix**: Reword to avoid the count-noun agreement instead of adding pluralization logic — e.g. a fixed `Hasło musi mieć co najmniej {MIN_PASSWORD_LENGTH} znaków` hint, or `Wpisz jeszcze co najmniej {N} znak(i/ów)`. Simplest correct option: drop the live countdown and show the static minimum, matching the placeholder already on the field.
- **Decision**: FIXED (Fix A) — hint changed to static `Hasło musi mieć co najmniej {MIN_PASSWORD_LENGTH} znaków`, dropping the live countdown; display condition unchanged.

### F2 — Auth route paths hardcoded as string literals instead of `ROUTES`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/Welcome.astro:34,40 (also src/pages/auth/signin.astro:14, signup.astro:14, confirm-email.astro:29)
- **Detail**: These `href="/auth/signin"` / `href="/auth/signup"` links use literal path strings, whereas the lessons register ("Centralize app paths in a route registry — no hardcoded path literals") and `Topbar.astro` in this same diff use `ROUTES.signIn` / `ROUTES.signUp`. **These literals are pre-existing — they were not introduced or moved by this change** (the diff only touched their `class` attributes and surrounding copy). The plan explicitly scoped routing out ("Not changing auth API endpoints, middleware, routing"), so fixing them here would exceed the plan's guardrail. Flagged only because a lessons prior covers it and this review surfaced them.
- **Fix**: Leave out of this presentation-only change; queue a small follow-up to swap the four literals to `ROUTES.*` (mirrors the `Topbar.astro` pattern), or fold it into the next change that legitimately touches these files.
- **Decision**: SKIPPED — pre-existing debt, out of scope for this presentation-only change; a `ROUTES.*` prior already lives in lessons.md for whoever next touches these files.
