<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth & Landing Wedding Theme

- **Plan**: context/changes/auth-and-landing-wedding-theme/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: REVISE → SOUND after triage (F1, F2, F3, F4 fixed in plan; F5 accepted out of scope)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

12/12 paths ✓, all line-specific claims verified ✓ (SubmitButton:18 purple, SignUpForm:60 blue hint, PasswordToggle:13, global.css:113-115 bg-cosmic block, field-theme.ts dark constants), bg-cosmic = 6 files ✓, ServerError.tsx theme-agnostic (no missed remnant) ✓, Progress section mechanically well-formed ✓, brief↔plan ✓.

## Findings

### F1 — Phase 2 grep (2.4) uses bare `text-white`, contradicts the rose CTA

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness (internal contradiction)
- **Location**: Phase 2 §Success Criteria / line 188
- **Detail**: Phase 2's automated grep forbids bare `text-white` in Welcome.astro, but the same phase keeps the primary hero CTA as the workspace rose button (`bg-rose-500 ... text-white`; Welcome.astro:43 retains `text-white` after the purple→rose swap). White-on-rose is the correct high-contrast treatment, so a correct implementation still contains `text-white` and criterion 2.4 can never return empty. The Desired-End-State grep (line 36) already uses `text-white/` (with slash) and does not have this problem — Phase 2 is inconsistent with it.
- **Fix**: In Phase 2's grep (2.4), change `text-white` → `text-white/` to match the end-state grep. White-on-rose CTA stays as designed.
- **Decision**: FIXED (grep 2.4 updated to `text-white/`)

### F2 — Landing browser tab title stays "10x Astro Starter"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment / Blind Spots (promise gap)
- **Location**: Phase 2 §1 (Welcome.astro) — misses the page title
- **Detail**: Desired End State + manual criterion 2.6 promise "no 'Astro Starter' text remains" on the landing. Phase 2 rewrites Welcome.astro's H1 and copy, but the landing route `src/pages/index.astro` renders `<Layout>` with no `title` prop, so it falls back to the Layout default `title = "10x Astro Starter"` (Layout.astro:10). After the change the browser tab on `/` still reads "10x Astro Starter". index.astro and the Layout default are unmentioned in the plan.
- **Fix**: In Phase 2, pass a Polish product title to `<Layout>` in src/pages/index.astro (e.g. `title="TablePlanner — plan stołów na wesele"`). Optionally update the Layout.astro default too.
- **Decision**: FIXED (added Phase 2 §3 for index.astro title; Layout default left out of scope)

### F3 — End-state verify grep is unsatisfiable: dead `LibBadge.astro` holds dark tokens

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real scope tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Desired End State line 34/36; Phase 3 §2
- **Detail**: Line 34 claims "No dark-theme class ... remains anywhere in src/" and line 36's Verify runs `grep -rn "...\|bg-purple\|..." src/` expecting nothing. But `src/components/ui/LibBadge.astro` (out of scope, unmentioned) contains `bg-purple-500/30`, `text-purple-200`, `bg-blue-900/50`, `text-blue-200`, so the grep can never return empty. LibBadge is dead code — `grep -rln LibBadge src/` finds zero references. The phase-level gates do not break (1.4 scopes to auth/, 2.4 to Welcome+Topbar, 3.1 greps only `bg-cosmic`), so the build/impl is fine; only the stated end-state is inaccurate.
- **Fix A ⭐ Recommended**: Delete the unreferenced LibBadge.astro in Phase 3
  - Strength: Makes the "no dark tokens anywhere in src/" claim literally true; removes dead code — matches the lessons.md "export only what's used / small single-purpose files" rule.
  - Tradeoff: Widens the change beyond the 6 bg-cosmic files by one deletion; needs a one-line scope note.
  - Confidence: HIGH — verified unreferenced; deletion is safe.
  - Blind spot: None significant.
- **Fix B**: Narrow the end-state claim + verify grep to the restyled surfaces
  - Strength: Keeps the change strictly to the declared scope.
  - Tradeoff: Leaves a dead dark-token file in src/; the sweeping "anywhere in src/" promise becomes a scoped one.
  - Confidence: HIGH.
  - Blind spot: LibBadge lingers as future confusion for the next reader.
- **Decision**: FIXED via Fix A (added Phase 3 §3 deleting the unreferenced LibBadge.astro)

### F4 — Verify-grep token set is imprecise

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State line 36; Phase 1/2 greps
- **Detail**: The token `from-purple` matches nothing in the tree — the actual gradient stops are `via-purple-200` / `to-purple-200` / `to-pink-200`, none of which appear in any verify grep. A leftover gradient stop would slip past the greps. The retheme removes them structurally anyway, so this is a completeness gap in the proof, not a real risk.
- **Fix**: (optional) add `via-purple\|to-purple\|to-pink` to the greps, or accept — the manual walkthrough covers it.
- **Decision**: FIXED (replaced dead `from-purple` with `via-purple\|to-purple\|to-pink` in all three verify greps)

### F5 — `<html lang="en">` while translating all copy to Polish

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Layout.astro:12 (app-wide, pre-existing)
- **Detail**: This change brings auth+landing copy into Polish, but Layout.astro declares `lang="en"` for the whole app (a11y/SEO mismatch). It is pre-existing and app-wide (also affects the shipped Polish workspace), so arguably out of scope — flagged because this is the natural "make it Polish" change to at least acknowledge it.
- **Fix**: (optional / separate) set `lang="pl"` in Layout.astro.
- **Decision**: ACCEPTED (out of scope; pre-existing app-wide — not addressed in this change)
