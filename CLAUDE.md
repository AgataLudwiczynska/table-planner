# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Astro dev server (Vite + Node). **Not** the Workers runtime — bindings declared in `wrangler.jsonc` are inactive here; use `npm run preview` to exercise the Cloudflare runtime locally.
- `npm run build` — production build (SSR via `@astrojs/cloudflare`).
- `npm run preview` — preview production build on workerd.
- `npm run lint` — ESLint with typescript-eslint `strictTypeChecked` + `stylisticTypeChecked` (stricter than defaults; the React Compiler rule is `error`, so any Rules-of-React violation fails the build).
- `npm run lint:fix` — auto-fix lint issues.
- `npm run format` — Prettier (includes `prettier-plugin-astro` + `prettier-plugin-tailwindcss`).
- `npx astro check` — standalone type-check (no `npm` script wired).

No test suite is configured yet — if you wire one, also update this section and add the runner script.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

See `@README.md` for the tech stack summary.

### Rendering mode

Full server-side rendering (`output: "server"` in `astro.config.mjs`). All pages are server-rendered by default. **API routes must export `const prerender = false`** to opt into the server endpoint.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client via `@supabase/ssr` with cookie-based sessions. Reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server` (server-only secrets declared in `astro.config.mjs` `env.schema`, `optional: true`). **`createClient()` returns `null` when either env var is missing** — every caller must handle the `null` case (the middleware already does).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated traffic away from paths listed in `PROTECTED_ROUTES`. Add new protected paths there, not in the page itself.
- `src/env.d.ts` — declares the `App.Locals` shape (currently `user: User | null`). Extend this file when adding new `locals` fields.
- `src/lib/config-status.ts` — pattern for "is this external service configured?" flags surfaced in UI. **UI strings in this repo are Polish** — match the language when adding user-facing copy.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`.
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`.
- Protected page example: `src/pages/dashboard.astro`.
- Local Supabase first-time setup is documented in `@README.md` (Supabase Configuration section) — don't duplicate it here.

### Key conventions

- **Path alias**: `@/*` → `./src/*` (`tsconfig.json` paths).
- **Astro components** for static content/layout; **React components** only when interactivity is required.
- **Tailwind class merging**: always use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: export uppercase `GET`, `POST`, etc. Validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. **Always enable RLS on new tables with granular per-operation, per-role policies.**
- **React**: no Next.js directives (`"use client"` etc.). Extract hooks to `src/components/hooks/`. **React Compiler is enforced by ESLint** — don't mutate props, don't break Rules of React; lint will fail the build.
- **Services / helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts` (file not yet created — add it on first shared type).
- **npm overrides**: `package.json` pins `vite: "^7.3.2"` via `overrides`. Intentional — don't remove without verifying compatibility with Astro 6 + `@astrojs/cloudflare`.
- **date display** use UTC format and `formatDate()` helper to display date

### Environment

- Node.js v22.14.0 (see `.nvmrc`).
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev).
- Local Supabase: `npx supabase start` (requires Docker).
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored).
- `wrangler.jsonc` sets `compatibility_flags: ["nodejs_compat"]` — most Node APIs work on Workers, but not all. If a build/deploy fails on a missing global (`process`, `Buffer`, etc.), check this flag before reaching for a polyfill.
- Deploy: **push to `main`** — Cloudflare Workers Builds runs `npm run build` + `npx wrangler deploy` in its own container. **Never run `wrangler deploy` from local** after first setup — creates drift. Exception: emergency rollback via `npx wrangler rollback`.
- **`prebuild` runs `astro sync` before lint**: `.astro/` type stubs are gitignored and don't exist in Cloudflare's fresh build container. Without `astro sync` first, ts-eslint fails on `import.meta.env.*` and similar Astro-generated types (works locally where old stubs linger).
- **Two-copy Supabase secrets on Cloudflare**: `SUPABASE_URL` / `SUPABASE_KEY` live in **two places** — runtime secrets (`wrangler secret put`) used by the deployed worker, and build-time env vars (Workers Builds → Settings → Variables) used by the build container. When rotating Supabase keys, update **both**.

