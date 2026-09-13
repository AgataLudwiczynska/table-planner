# Auth & Landing Wedding Theme — Plan Brief

> Full plan: `context/changes/auth-and-landing-wedding-theme/plan.md`

## What & Why

Move the three auth screens (sign-in, sign-up, confirm-email) and the anonymous landing page from the dark "cosmic" starter palette to the light wedding theme (`bg-wedding`) that S-01 already established in the workspace — so the whole app reads as one consistent, wedding-appropriate look (follow-up F3 from the S-01 impl review). Alongside the color swap: rewrite the landing to real wedding-seating product copy, bring all auth + landing text into Polish, and delete the dead cosmic styles.

## Starting Point

The workspace (`/wedding`) is already on the wedding palette (rose/slate/white on `bg-wedding`). The auth + landing surfaces are still on the dark starter theme; `bg-cosmic` lives in exactly 6 files. The landing still shows generic "10x Astro Starter" copy with dev-tooling feature cards, and all auth copy is English while the rest of the app is Polish.

## Desired End State

Visiting `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email` shows the light wedding theme with Polish copy throughout and wedding-seating product messaging on the landing. No `bg-cosmic` or dark-palette token remains in `src/`. Every auth form validates and submits exactly as before.

## Key Decisions Made

| Decision                    | Choice                                             | Why (1 sentence)                                                       | Source |
| --------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| Landing content scope       | Rewrite hero + 3 feature cards to wedding product | "One consistent wedding look" is undercut by leaving "Astro Starter". | Plan   |
| Cosmic decoration           | Soft rose orbs, drop the star field               | Stars make no sense on a light bg; orbs keep gentle depth.            | Plan   |
| Copy language               | Translate auth + landing to Polish                | App-wide UI convention is Polish (CLAUDE.md).                          | Plan   |
| Dead cosmic styles          | Delete `bg-cosmic` + dark constants once unused   | No dead theme left for the next reader to reason about.               | Plan   |
| Palette values              | Copy workspace classes verbatim                    | Keeps auth/landing pixel-consistent with the themed workspace.        | Plan   |

## Scope

**In scope:** `Welcome.astro`, `Topbar.astro`, the 3 auth `.astro` pages, `field-theme.ts`, `SubmitButton.tsx`, `PasswordToggle.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`, and the `bg-cosmic` deletion in `global.css`. Colors + copy only.

**Out of scope:** README rewrite (follow-up F10); the workspace (already themed); any form behaviour, API, middleware, routing, migrations, or tests; a form library (follow-up F4).

## Architecture / Approach

Presentation-layer only — class strings and user-facing copy change, DOM shape and component structure stay identical. Work inside-out: retheme the shared auth constants/components first (one `field-theme.ts` edit themes all fields via the already-theme-agnostic `FormField`), then the auth page shells + form copy, then the landing, then delete the dead utility last — the deletion can only succeed once every reference is gone. Two dark remnants live *inside* form components, not the theme object, and must be caught individually: `SubmitButton.tsx:18` (purple button) and `SignUpForm.tsx:60` (blue password hint).

## Phases at a Glance

| Phase                              | What it delivers                                             | Key risk                                                  |
| ---------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| 1. Auth surfaces                   | 3 auth screens on wedding theme, Polish copy, rose fields   | Missing a hardcoded dark remnant inside a form component |
| 2. Landing                         | Wedding-themed landing, Polish product copy, rose orbs      | Weak text/CTA contrast on the light background           |
| 3. Cleanup + verify                | `bg-cosmic` deleted; full automated + manual sweep          | A missed reference breaks the build (fails loudly — good) |

**Prerequisites:** S-01 (done — introduced `bg-wedding` and the workspace palette). No blockers.
**Estimated effort:** ~1 session across 3 phases; low risk, no logic/data.

## Open Risks & Assumptions

- Only real risk is a missed surface or low-contrast text/CTA on the light background — mitigated by the per-phase grep checks and manual contrast walkthrough of all four surfaces.
- Assumes the workspace palette classes are the intended house style (they are, from S-01) — copied verbatim rather than re-invented.

## Success Criteria (Summary)

- All four anonymous surfaces read as one consistent, light wedding look, in Polish.
- No dark/cosmic remnant survives (`grep -rn "bg-cosmic" src/` is empty); lint, `astro check`, build, and `test:run` all pass.
- Every auth form still validates and submits exactly as before.
