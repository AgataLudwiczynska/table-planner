# Auth & Landing Wedding Theme Implementation Plan

## Overview

Move the three auth screens (sign-in, sign-up, confirm-email) and the anonymous landing page from the dark "cosmic" palette to the light wedding theme (`bg-wedding`) that S-01 already established in the workspace, so the whole app reads as one consistent, wedding-appropriate look. Alongside the color swap we rewrite the landing to real wedding-seating product copy, bring all auth + landing text into Polish (matching the app-wide UI convention), and delete the now-dead cosmic styles.

This is a pure presentation-layer change: no logic, data model, API, migrations, or tests are touched. Form behaviour (validation rules, submit actions, field names) stays byte-for-byte identical — only class strings and user-facing copy change.

## Current State Analysis

The workspace (`src/pages/wedding.astro` + `src/components/wedding/*`) already uses the light wedding palette introduced in S-01:

- Background: `bg-wedding` utility — `linear-gradient(to bottom, #fff1f2, #ffffff, #fdf2f8)` (`src/styles/global.css:117`).
- Text: `text-slate-800` (body) / `text-slate-700` (headings) / `text-slate-600` / `text-slate-500` (muted).
- Primary CTA: `bg-rose-500 hover:bg-rose-600 text-white`.
- Cards / panels: `bg-white` or `bg-white/70`, borders `border-rose-100` / `border-slate-300`.
- Inputs: `border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-rose-400` (`src/components/wedding/GuestsTab.tsx:36`).
- Errors: `border-red-300 bg-red-50 text-red-700` (`src/pages/wedding.astro:63`).

The auth + landing surfaces still use the dark starter palette. `bg-cosmic` appears in exactly 6 files (grep-verified): `Welcome.astro`, the 3 auth pages, `field-theme.ts`, and the `global.css` utility definition.

### Key Discoveries:

- **The palette to copy already exists** — no design decisions needed; mirror the workspace classes above. (`src/pages/wedding.astro`, `src/components/wedding/*`)
- **The `FormField` component is already theme-agnostic** — every palette class is injected via a `FormFieldTheme` object; structural classes are hardcoded and theme-free (`src/components/ui/FormField.tsx:6-15`). Retheming auth fields = editing one constant object in `src/components/auth/field-theme.ts`; no per-form edits for field colors.
- **Shared auth/landing components have zero blast radius** into the workspace (grep-verified): `Topbar.astro` (landing-only), `SubmitButton.tsx` (`bg-purple-600`, auth-only), `PasswordToggle.tsx` (`text-white/40`, auth-only), `field-theme.ts` (auth-only). Safe to retheme in place.
- **Two hardcoded dark remnants live inside the form components**, not the theme object: `SubmitButton.tsx:18` (`bg-purple-600 hover:bg-purple-500`) and `SignUpForm.tsx:60` (`text-blue-100/50` password hint). Both must be caught individually — the field-theme swap alone won't cover them.
- **The landing is still generic starter content** — `Welcome.astro:35` shows "10x Astro Starter" with dev-tooling feature cards (Modern Stack, ESLint/Prettier). (README rewrite is a *separate* follow-up, F10 — out of scope here.)
- **Auth copy is English**, the rest of the app is Polish (`src/components/wedding/*` all Polish; CLAUDE.md: "UI strings in this repo are Polish").
- **`confirm-email.astro` branches on `import.meta.env.DEV`** for auto-confirm vs email-confirm copy (`confirm-email.astro:4`) — both branches need translating; the branch logic is untouched.

## Desired End State

Visiting `/`, `/auth/signin`, `/auth/signup`, and `/auth/confirm-email` shows the light wedding theme (rose/slate/white on `bg-wedding`), with Polish copy throughout and wedding-seating product messaging on the landing. No dark-theme class or `bg-cosmic` reference remains anywhere in `src/`. `npm run lint`, `npm run build`, and `npx astro check` all pass; every auth form submits and validates exactly as before.

Verify: `grep -rn "bg-cosmic\|text-blue-100\|text-white/\|bg-purple\|from-blue-200\|via-purple\|to-purple\|to-pink" src/` returns nothing (all dark-palette tokens gone from the restyled surfaces).

## What We're NOT Doing

- **Not** rewriting `README.md` — that is follow-up F10, a separate change.
- **Not** touching the workspace (`wedding.astro`, `src/components/wedding/*`) — it is already themed.
- **Not** changing any form behaviour: validation logic, `MIN_PASSWORD_LENGTH`, submit `action` URLs, field `name`/`id` attributes, and the `confirm-email` DEV branch all stay identical.
- **Not** changing auth API endpoints, middleware, routing, or `PROTECTED_ROUTES`.
- **Not** adding or changing tests (no test surface — pure visual), and **not** introducing a form library (that's follow-up F4).
- **Not** redesigning layout/structure — same DOM shape, same components; only classes and copy change.

## Implementation Approach

Work inside-out and in dependency order so the dead-code deletion in Phase 3 can only succeed once every reference is gone:

1. **Phase 1 (auth)** retheme the shared auth constants/components first (one edit themes all fields), then restyle the three auth `.astro` shells and translate their copy + the two React forms' copy.
2. **Phase 2 (landing)** rewrite `Welcome.astro` (theme + Polish product copy + rose orbs, drop star field) and restyle `Topbar.astro`.
3. **Phase 3 (cleanup + verify)** delete the `bg-cosmic` utility and confirm no dark tokens survive, then run the full automated + manual verification pass.

Copy the workspace palette classes verbatim rather than inventing new tints, so auth/landing and workspace stay pixel-consistent.

## Critical Implementation Details

**State sequencing** — `bg-cosmic` in `global.css` and the dark constants in `field-theme.ts` can only be deleted *after* Phases 1–2 remove every reference; deleting earlier breaks the build. Phase 3 owns the deletion and the grep that proves nothing references them.

## Phase 1: Auth surfaces → wedding theme + Polish

### Overview

Retheme the shared auth field/button/toggle styles to the light wedding palette, restyle the three auth page shells, and translate all auth-facing copy (headings, links, labels, placeholders, validation messages, button text) to Polish. Form behaviour is untouched.

### Changes Required:

#### 1. Shared auth field theme

**File**: `src/components/auth/field-theme.ts`

**Intent**: Swap the dark-glassmorphism `authFieldTheme` and `authServerErrorClass` for the light wedding palette so every `FormField` on the auth screens inherits wedding colors from one place.

**Contract**: Keep the same exported names and `FormFieldTheme` shape. Map to workspace tokens: labels `text-slate-700`, icon `text-slate-400`, input `border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:ring-rose-400`, input-error `border-red-400 focus:ring-red-400`, error text `text-red-600`; server-error box `border-red-300 bg-red-50 text-red-700`. Update the file's top comment (currently "Dark glassmorphism palette … bg-cosmic background") to describe the wedding palette.

#### 2. Auth submit button

**File**: `src/components/auth/SubmitButton.tsx`

**Intent**: Recolor the hardcoded purple submit button to the wedding rose CTA.

**Contract**: Change `bg-purple-600 … hover:bg-purple-500` → `bg-rose-500 … hover:bg-rose-600` (line 18). Spinner border classes stay (they render on the rose fill and read fine). No prop or behaviour change.

#### 3. Password visibility toggle

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: Recolor the toggle icon for a light background.

**Contract**: `text-white/40 hover:text-white/70` → `text-slate-400 hover:text-slate-600` (line 13). Polish the `aria-label`s to Polish ("Ukryj hasło" / "Pokaż hasło").

#### 4. Sign-in form copy

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Translate all user-facing strings to Polish; no logic/regex change.

**Contract**: Labels/placeholders/messages: `Email`→`Email` (unchanged) / placeholder stays `you@example.com`; `Password`→`Hasło`, placeholder `Your password`→`Twoje hasło`; validation `Email is required`→`Podaj adres email`, `Enter a valid email address`→`Podaj poprawny adres email`, `Password is required`→`Podaj hasło`; button `Sign in`→`Zaloguj się`, pendingText `Signing in...`→`Logowanie...`. The `authFieldTheme` spread, `noValidate`, `action`, and validation branches are unchanged.

#### 5. Sign-up form copy + hint remnant

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Translate copy to Polish and fix the one hardcoded dark hint color.

**Contract**: Fix `text-blue-100/50`→`text-slate-500` on the password hint (line 60). Translate: `Password`→`Hasło`, `Confirm password`→`Potwierdź hasło`, placeholders `Min. 6 characters`→`Min. 6 znaków`, `Re-enter your password`→`Wpisz hasło ponownie`; validation `Email is required`→`Podaj adres email`, `Enter a valid email address`→`Podaj poprawny adres email`, `Password is required`→`Podaj hasło`, `Password must be at least 6 characters`→`Hasło musi mieć co najmniej 6 znaków`, `Please confirm your password`→`Potwierdź hasło`, `Passwords do not match`→`Hasła nie są takie same`; the "N more characters needed" hint → a Polish equivalent (e.g. `Brakuje jeszcze N znaków`); button `Create account`→`Utwórz konto`, pendingText `Creating account...`→`Tworzenie konta...`. `MIN_PASSWORD_LENGTH`, regex, and submit `action` unchanged.

#### 6. Sign-in page shell

**File**: `src/pages/auth/signin.astro`

**Intent**: Restyle the cosmic glass card to a light wedding card and translate copy.

**Contract**: Outer `bg-cosmic` → `bg-wedding`. Card `border-white/10 bg-white/10 text-white backdrop-blur-xl` → light card matching workspace (`border-rose-100 bg-white text-slate-800 shadow-sm`, drop backdrop-blur). Heading: drop the `bg-gradient-to-r from-blue-200 to-purple-200 … text-transparent`, use `text-slate-800` (or a rose accent) — text `Sign in`→`Zaloguj się`. Footer link text `text-blue-100/60` → `text-slate-600`, link `text-purple-300`→`text-rose-600`; copy `Don't have an account? Sign up`→`Nie masz konta? Zarejestruj się`. `Layout title="Sign in"`→`title="Zaloguj się"`.

#### 7. Sign-up page shell

**File**: `src/pages/auth/signup.astro`

**Intent**: Same restyle + translation as sign-in (symmetric file).

**Contract**: Same class swaps as §6. Heading `Sign up`→`Zarejestruj się`; footer `Already have an account? Sign in`→`Masz już konto? Zaloguj się`; `Layout title`→`Zarejestruj się`.

#### 8. Confirm-email page shell

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Restyle both card + translate both DEV/non-DEV copy branches; keep the branch logic.

**Contract**: Same outer/card/heading class swaps as §6. Translate both `content` objects: DEV branch heading `Registration successful`→`Rejestracja zakończona`, description `Your account has been created. You can now sign in.`→`Twoje konto zostało utworzone. Możesz się teraz zalogować.`, linkText `Go to sign in`→`Przejdź do logowania`; non-DEV branch heading `Check your email`→`Sprawdź swoją skrzynkę`, description →`Wysłaliśmy link aktywacyjny na Twój adres email. Kliknij go, aby aktywować konto.`, linkText `Back to sign in`→`Powrót do logowania`. The `isAutoConfirmed = import.meta.env.DEV` branch and emoji are unchanged. Link `text-purple-300`→`text-rose-600`, description `text-blue-100/80`→`text-slate-600`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type-check passes: `npx astro check`
- Production build succeeds: `npm run build`
- No dark tokens remain in auth files: `grep -rn "bg-cosmic\|text-white/\|text-blue-100\|bg-purple\|from-blue-200\|via-purple\|to-purple\|to-pink" src/components/auth src/pages/auth` returns nothing

#### Manual Verification:

- `/auth/signin`, `/auth/signup`, `/auth/confirm-email` render on the light wedding background with legible slate text and a rose CTA (adequate contrast).
- All three screens read in Polish (headings, labels, placeholders, links, button text).
- Sign-in and sign-up still validate (empty/invalid email, short password, mismatched passwords) with Polish messages, and a valid submit still posts to its endpoint.
- Password show/hide toggle still works on both password fields.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Landing → wedding theme, Polish product copy, rose decoration

### Overview

Rewrite the anonymous landing (`Welcome.astro`) to the wedding theme with real wedding-seating product copy in Polish, replace the star field with soft rose/pink blurred orbs, and restyle the shared `Topbar.astro` to the light palette.

### Changes Required:

#### 1. Landing hero, decoration, and feature cards

**File**: `src/components/Welcome.astro`

**Intent**: Convert the cosmic hero to the wedding theme, swap decoration, and replace generic starter copy with wedding-seating product copy (Polish).

**Contract**:
- Root `bg-cosmic` → `bg-wedding`.
- **Decoration**: remove the star-field `<div>` (lines ~20-25) entirely. Recolor the three blurred orbs from `bg-purple-500/20`/`bg-blue-500/15`/`bg-indigo-400/10` to soft rose/pink low-opacity tints (e.g. `bg-rose-300/30`, `bg-pink-300/20`, `bg-rose-200/20`); keep them `pointer-events-none absolute … blur-[…]` so they stay subtle background depth.
- **Hero**: drop the `bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200 … text-transparent` treatment; use a solid slate/rose heading. Headline `10x Astro Starter` → a wedding product headline (e.g. `TablePlanner`/`Rozplanuj wesele bez konfliktów przy stołach`); subtitle → Polish product value line about seating guests and avoiding adjacency conflicts. CTAs: `Sign In`→`Zaloguj się`, `Sign Up`→`Zarejestruj się`; primary CTA `bg-purple-600 hover:bg-purple-500`→`bg-rose-500 hover:bg-rose-600`, secondary `border-white/20 text-white hover:bg-white/10`→ light outline (`border-slate-300 text-slate-700 hover:bg-white`).
- **Feature cards**: restyle `border-white/10 bg-white/5 backdrop-blur-xl` → `border-rose-100 bg-white shadow-sm`; icon color `text-purple-300`→`text-rose-500`; card heading `text-white`→`text-slate-800`, body `text-blue-100/60`→`text-slate-600`. Rewrite all three cards to wedding-product benefits in Polish (e.g. plan stołów, walidacja konfliktów sąsiedztwa, śledzenie postępu rozsadzania) — replace the dev-tooling copy. Icons may be reused or swapped for more fitting lucide/svg glyphs; keep the 3-card grid.

#### 2. Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Restyle the dark glass bar for the light landing (it is landing-only).

**Contract**: Bar `border-white/10 bg-white/5 text-white/80` → `border-rose-100 bg-white text-slate-600 shadow-sm`. All `text-blue-100/70`→`text-slate-500`; links `text-purple-300 hover:text-purple-100`→`text-rose-600 hover:text-rose-700`. Copy is already Polish (`Wesele`, `Wyloguj się`, `Zaloguj się`, `Zarejestruj się`, `Niezalogowany`) — leave it. The `user ? … : …` branch, `ROUTES`, and sign-out form are unchanged.

#### 3. Landing page title

**File**: `src/pages/index.astro`

**Intent**: The landing route renders `<Layout>` with no `title`, so it falls back to the Layout default "10x Astro Starter" (`Layout.astro:10`) — after the retheme the browser tab would still show starter copy.

**Contract**: Pass a Polish product title to `<Layout>`, e.g. `title="TablePlanner — plan stołów na wesele"`. No other change to `index.astro`; the `Layout.astro` default stays as-is (out of scope here).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type-check passes: `npx astro check`
- Production build succeeds: `npm run build`
- No dark tokens remain in landing files: `grep -rn "bg-cosmic\|text-white/\|text-blue-100\|bg-purple\|from-blue-200\|via-purple\|to-purple\|to-pink\|star" src/components/Welcome.astro src/components/Topbar.astro` returns nothing

#### Manual Verification:

- `/` (logged out) renders on the light wedding background with soft rose orbs and no star field.
- Hero and all three feature cards show wedding-seating product copy in Polish — no "Astro Starter" / dev-tooling text remains.
- Both hero CTAs and both Topbar links navigate correctly; contrast of slate text and rose CTAs is comfortable.
- Topbar renders correctly both logged-out and logged-in.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Cleanup + full verification

### Overview

With no surface referencing the dark theme, delete the dead `bg-cosmic` utility, then run the full automated + manual verification sweep across all four surfaces.

### Changes Required:

#### 1. Remove dead cosmic utility

**File**: `src/styles/global.css`

**Intent**: Delete the now-unused `bg-cosmic` utility so no dead theme lingers.

**Contract**: Remove the `@utility bg-cosmic { … }` block (lines 113-115). Leave `bg-wedding` and everything else untouched.

#### 2. Repo-wide dead-token sweep

**File**: (verification only — no file unless the grep finds a straggler)

**Intent**: Prove nothing references the dark palette anywhere in `src/`; fix any straggler found.

**Contract**: `grep -rn "bg-cosmic" src/` must return nothing. If it hits, restyle that surface to the wedding palette before closing the phase.

#### 3. Remove dead `LibBadge` component

**File**: `src/components/ui/LibBadge.astro` (delete)

**Intent**: `LibBadge.astro` is an unused starter component carrying dark-palette tokens (`bg-purple-500/30`, `text-purple-200`, `bg-blue-900/50`, `text-blue-200`). It is referenced nowhere (`grep -rln "LibBadge" src/` returns nothing), so it would otherwise leave dark tokens in `src/` and defeat the end-state verify grep.

**Contract**: Delete the file. This is the one file outside the original 6-file scope; safe because it has zero importers. After deletion, `grep -rln "LibBadge" src/` returns nothing.

### Success Criteria:

#### Automated Verification:

- No cosmic references anywhere: `grep -rn "bg-cosmic" src/` returns nothing
- Lint passes: `npm run lint`
- Type-check passes: `npx astro check`
- Production build succeeds: `npm run build`
- Test suite still green (guards against accidental non-visual edits): `npm run test:run`

#### Manual Verification:

- Full click-through of all four surfaces (`/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`) plus the workspace (`/wedding`) shows one consistent wedding look with no dark/cosmic remnants.
- Text/CTA contrast is comfortable on every surface (no light-gray-on-white or low-contrast rose text).
- A full auth round-trip works end to end: sign up → confirm-email screen → sign in → workspace → sign out → landing.

**Implementation Note**: After this phase, the change is complete; hand off to `/10x-impl-review` if desired.

---

## Testing Strategy

No automated tests are added — this is a presentation-only change with no testable behaviour delta, and the existing suite has no rendering/snapshot tests. Regression safety comes from `npm run test:run` staying green (proving no logic was accidentally altered) plus the manual walkthroughs.

### Manual Testing Steps:

1. `npm run dev`, open `/` logged out — verify wedding theme, Polish product copy, rose orbs, working CTAs.
2. Go to `/auth/signup` — verify light card, Polish copy; submit empty and invalid inputs to see Polish validation; toggle password visibility; complete a valid sign-up.
3. Land on `/auth/confirm-email` — verify Polish copy (DEV branch), themed card.
4. Go to `/auth/signin`, sign in — verify themed screen + Polish, land in workspace.
5. Sign out — verify landing again; confirm no dark/cosmic surface anywhere.

## Performance Considerations

None. Removing the star-field overlay and one utility class marginally reduces DOM/CSS; no runtime impact.

## Migration Notes

None — no data, schema, or config migration. `bg-cosmic` removal is safe once Phases 1–2 land (dependency enforced by Phase 3 ordering).

## References

- Follow-up: `context/foundation/follow-ups.md` → F3
- Roadmap item: `context/foundation/roadmap.md` → S-06
- Palette source (S-01): `src/pages/wedding.astro`, `src/components/wedding/GuestsTab.tsx`, `src/styles/global.css:117`
- Theme-agnostic field pattern: `src/components/ui/FormField.tsx:6-15`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth surfaces → wedding theme + Polish

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Type-check passes: `npx astro check`
- [x] 1.3 Production build succeeds: `npm run build`
- [x] 1.4 No dark tokens remain in auth files (grep)

#### Manual

- [x] 1.5 Three auth screens render on light wedding background with legible contrast
- [x] 1.6 All three auth screens read in Polish
- [x] 1.7 Sign-in and sign-up still validate with Polish messages and submit
- [x] 1.8 Password show/hide toggle still works

### Phase 2: Landing → wedding theme, Polish product copy, rose decoration

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Type-check passes: `npx astro check`
- [ ] 2.3 Production build succeeds: `npm run build`
- [ ] 2.4 No dark tokens remain in landing files (grep)

#### Manual

- [ ] 2.5 Landing renders on light wedding background with rose orbs, no star field
- [ ] 2.6 Hero + feature cards show Polish wedding product copy (no Astro Starter text)
- [ ] 2.7 Hero CTAs and Topbar links navigate correctly with comfortable contrast
- [ ] 2.8 Topbar renders correctly logged-out and logged-in

### Phase 3: Cleanup + full verification

#### Automated

- [ ] 3.1 No cosmic references anywhere: `grep -rn "bg-cosmic" src/` returns nothing
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Type-check passes: `npx astro check`
- [ ] 3.4 Production build succeeds: `npm run build`
- [ ] 3.5 Test suite still green: `npm run test:run`

#### Manual

- [ ] 3.6 All four surfaces + workspace show one consistent wedding look
- [ ] 3.7 Text/CTA contrast comfortable on every surface
- [ ] 3.8 Full auth round-trip works end to end
