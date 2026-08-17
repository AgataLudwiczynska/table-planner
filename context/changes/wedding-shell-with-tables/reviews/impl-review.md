<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01 Wedding Shell with Tables (full plan)

- **Plan**: context/changes/wedding-shell-with-tables/plan.md
- **Scope**: Phases 1–4 of 4 (full-plan sweep; Phases 1–2 also had a prior phase review in `impl-review-phase-1-2.md`)
- **Date**: 2026-08-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Middleware `getUser()` has no error handling; a Supabase transport error 500s every route

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:11-14
- **Detail**: `await supabase.auth.getUser()` runs on every request (including the public landing and auth pages) with no try/catch. `getUser()` resolves with `user: null` for invalid/expired sessions, but a network/transport error to Supabase *rejects* — an unhandled rejection here surfaces as a 500 on every route, so a transient Supabase blip takes the whole site down instead of degrading to "logged out". The `createClient() === null` branch right below already establishes the graceful-degradation pattern (`context.locals.user = null`); the `getUser()` call should mirror it. Pre-existing from the auth foundation, but this slice edits and re-establishes this middleware as the S-02..S-05 routing template, so it is worth closing now.
- **Fix**: Wrap the `getUser()` call in try/catch; on rejection set `context.locals.user = null` (same fallback as the `else` branch), so a Supabase outage degrades to unauthenticated rather than 500-ing public pages.
  - Strength: Mirrors the existing null-client fallback; localized to one function; removes a whole-site availability failure mode.
  - Tradeoff: A hard Supabase outage silently logs everyone out rather than showing an error — acceptable and arguably better for public routes.
  - Confidence: HIGH — the fallback pattern already exists two lines down.
  - Blind spot: None significant.
- **Decision**: FIXED — wrapped getUser() in try/catch, falls back to locals.user = null on rejection (src/middleware.ts).

### F2 — Topbar auth-control labels are English, against the repo's Polish-UI convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/Topbar.astro:24,30,34,37
- **Detail**: This slice localized the workspace link to "Wesele" (line 19) but the surrounding controls in the same touched file remain English: "Sign out" (24), "Not signed in" (30), "Sign in" (34), "Sign up" (37). CLAUDE.md and the lessons register both state UI strings in this repo are Polish. The mixed "Wesele" + "Sign out" in one row is a visible inconsistency. Pre-existing English, but the file was modified in this slice and now reads half-translated.
- **Fix**: Translate the four labels — e.g. "Sign out" → "Wyloguj się" (matching `wedding.astro`), "Sign in" → "Zaloguj się", "Sign up" → "Zarejestruj się", "Not signed in" → "Niezalogowany".
- **Decision**: FIXED — all four Topbar labels translated to Polish (src/components/Topbar.astro).

### F3 — `saveName()` relies on `disabled` alone for concurrency, no explicit pending guard

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/wedding/WeddingWorkspace.tsx:44-62
- **Detail**: Concurrent-call protection for the rename PATCH rests solely on the input's `disabled={rename.pending}`. Verified **not a live bug** — Enter calls `e.currentTarget.blur()`, which fires a single `onBlur`, so blur+Enter does not double-submit, and the non-optimistic flow (state set only after `await`) keeps local/server state consistent. Noted only as defense-in-depth, since `disabled` reflects state only after a React re-render.
- **Fix**: Optionally add `if (rename.pending) return;` at the top of `saveName()` as belt-and-suspenders. No change strictly required.
- **Decision**: FIXED — added `if (rename.pending) return;` guard atop saveName() (src/components/wedding/WeddingWorkspace.tsx:45).
