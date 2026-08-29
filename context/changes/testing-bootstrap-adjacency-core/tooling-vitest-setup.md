# Tooling notes: standing up Vitest on this stack

> Supplement to `research.md` for Phase 1. Not a formal research doc.
> Source: Context7 — Astro `6.3.1`, Vitest `3.2.4`. Setup APIs checked: **2026-08-29**.

Supplement to `research.md` §6 (Vitest bootstrap). Where `research.md` grounds the
*codebase-side* facts (alias, Vite pin, which files are pure), this file records the
current *external* setup APIs, verified via Context7. `astro 6.3.1` is the **installed**
manifest version; `vitest 3.2.4` was the tentative target here (**superseded → install
`vitest@4.1.11` exact, see *Addendum***) — it is *not* in
`package.json` yet (0 tests today, see `research.md` §6) and is the version Context7 docs
were checked against, not a manifest entry. Setup APIs last checked: **2026-08-29**.

## TL;DR for `/10x-plan`

- **Use Astro's official `getViteConfig()` from `astro/config`** as the `vitest.config.ts`
  base. It merges Astro's fully-resolved Vite config into Vitest — which hands us the
  `@/*` alias, the Tailwind plugin, and `astro:env/server` resolution **for free**, and
  matches Astro's official `--template with-vitest`. Recommended over a hand-rolled config.
- **Vitest 4.x line — pin `vitest@4.1.11` exact** (`vite: ^7.3.2` override; 4.x peer declares
  vite ^7; `4.1.11` is the advisory floor and exact-pin is deliberate — see *Addendum* below;
  supersedes the earlier "3.x" note).
- **`environment: 'node'`** for Phase 1 (pure function, no DOM).
- **No `@cloudflare/vitest-pool-workers`** — that pool is only for code exercising Workers
  bindings; the Phase 1 target is a pure function. Explicitly out of scope.
- **`globals`** is a choice (resolves `research.md` Open Question #3) — Astro's example ships
  it commented; pick `globals: true` **or** explicit `import { describe, it, expect }`.

## 1. Astro's recommended Vitest integration — `getViteConfig()`

Astro 6.3.1 exposes `getViteConfig()` from `astro/config` and ships an official
`examples/with-vitest`. The recommended config is exactly:

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    // globals: true, // optional — avoids importing describe/test/expect
  },
});
```

`getViteConfig(userViteConfig, inlineAstroConfig?)` returns an async Vite config getter that
resolves the full Astro config (runs `runHookConfigSetup` / `createVite`) and `mergeConfig`s
the user's `test` block on top.

**Why this matters for us:** because it merges Astro's *resolved* Vite config, it inherits:
- the **`@/*` → `./src/*` alias** (Astro honors tsconfig `paths`), so we don't hand-roll it;
- the **Tailwind Vite plugin** (`astro.config.mjs` pass-through);
- **`astro:env/server`** virtual-module resolution — future-proofing Phase 2/3 service/DB
  tests and anything that eventually imports `supabase.ts` / `config-status.ts`.

**Trade-off:** `getViteConfig` is heavier at startup (async, boots Astro config resolution)
than a bare `vitest.config.ts`. For a single pure-function suite that's negligible; the
durability + zero-alias-config win favors it. Scaffold reference:
`npm create astro@latest -- --template with-vitest`.

Source: Context7 `/withastro/astro/astro_6.3.1` — `examples/with-vitest/vitest.config.ts`,
`packages/astro/src/config/index.ts` (`getViteConfig`).

## 2. If we hand-roll instead — the alias pitfall

If we skip `getViteConfig` and write a plain `vitest.config.ts`, current Vitest docs warn the
`@/` alias must be built from a URL, not a bare string:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      // '@/': './src/',                                   // ✗ resolves wrong vs root
      '@/': new URL('./src/', import.meta.url).pathname,   // ✓
    },
  },
})
```

Source: Context7 `/vitest-dev/vitest/v3.2.4` — `docs/guide/common-errors.md`.

Given this footgun and the free alias from `getViteConfig`, **§1 is the preferred path.**

## 3. Environment and globals

- **Environment:** default `'node'` is correct for `adjacency.ts` (no DOM). `happy-dom` /
  `jsdom` only become relevant if/when we test React components (not this phase).
- **Globals:** `test: { globals: true }` lets tests use `describe/it/expect` without imports;
  otherwise import them from `vitest`. Either is fine — the plan should pick one and, under
  our strict type-aware ESLint, ensure the corresponding types are visible (`globals: true`
  needs `vitest/globals` in a tsconfig `types` entry or the `/// <reference>` triple-slash).

Source: Context7 `/vitest-dev/vitest/v3.2.4` — `docs/config/index.md`,
`docs/guide/features.md`.

## 4. What is explicitly NOT needed for Phase 1

- **`@cloudflare/vitest-pool-workers`** — only for tests that run against the Workers runtime
  / bindings. The adjacency validator is pure; a Node environment is correct. Revisit only if
  a later phase tests code that depends on Cloudflare bindings at runtime.
- **DOM libraries** (`jsdom` / `happy-dom`) and `@testing-library/*` — no component under
  test in Phase 1.

## Open decisions handed to `/10x-plan`

1. `getViteConfig()` (recommended, §1) vs. hand-rolled `vitest.config.ts` (§2).
2. `globals: true` vs. explicit imports (§3) — resolves `research.md` Open Question #3.
3. Re-verify Vitest × Vite 7 × Astro 6 compatibility at wire time if the manifest versions
   have moved (this note is pinned to `astro 6.3.1` / `vitest 3.2.4`).

---

## Addendum — version decision (added 2026-08-29)

> Follow-up research resolving plan-review **F1** (DEFERRED) and Open decision #3 above.
> Does **not** supersede the prose above; the `3.2.4` references in §1–§4 are the version the
> Context7 setup APIs were checked against, kept for provenance. The version to **install**
> is now the one recorded here.

**Target version: `vitest@4.1.11` (exact pin, not `^`)** (was tentatively "the 3.x line").
Rationale, verified via Context7 (`/vitest-dev/vitest`, checked 2026-08-29) and the GitHub
Advisory Database:

- **Vite 7 support.** Vitest 4.x declares its Vite peer as `^6.4.0 || ^7.0.0 || ^8.0.0` —
  Vite 7 is supported **explicitly**, matching the repo's `vite: ^7.3.2` override. Vitest 3.x
  only gained Vite 7 support in the `3.2` minor (its floor was `vite >= 5`), so a bare `^3`
  risked resolving an early 3.x that peers `vite ^5||^6` and conflicts with the `^7.3.2`
  override. This is the exact compatibility F1 wanted guaranteed — the 4.x line is where it
  is declared, not asserted.
- **Node floor.** Vitest 4.x requires `node >= 20`; the project runs Node `22.14.0` (`.nvmrc`).
- **`getViteConfig()` is major-agnostic.** The Astro↔Vitest coupling is through *Vite*
  (both must agree on the Vite version — they do, at 7). `getViteConfig()` merely merges
  Astro's resolved Vite config into the `test` block; the template shape (§1) is identical on
  4.x as on 3.x. Astro v6 additionally *requires* `environment: 'node'` for tests that render
  Astro components — which reinforces §3's Node-environment choice for Phase 1.
- **Security posture — why `4.1.11` and why exact.** The 4.x line has several **critical**
  *code* advisories (none are malware): CVE-2026-47429/-47428/-53633/-73653 (Browser Mode /
  UI / exposed `--api`) **plus GHSA-82fw-gwwq-j7x9** — `@vitest/mocker` path traversal /
  arbitrary file read via Redirect Mock, **fixed in 4.1.11** (backport #10974 of #10972), so
  **4.1.10 is affected**. Every one is a code vuln whose exploit surface — Browser Mode, the
  UI, an exposed dev-server/mocker socket, `vi.mock` redirects — is **not** exercised by a
  headless `vitest run` in `environment: 'node'` with no `@vitest/browser`, no UI, no
  `vi.mock`, and no network-exposed API, which is exactly the Phase 1 shape. The same classes
  also hit 3.x (patches 3.2.5–3.2.7), so they are **not** a reason to prefer 3.x. **`4.1.11`
  is the true floor** covering all five — `4.1.10` is short of the mocker fix, so falling back
  to it is not an option. **Pinned exact, not `^`:** a caret would let a fresh `npm install` /
  `npm update` auto-adopt a newer, less-vetted publish; exact + a committed `package-lock.json`
  (integrity hash) + `npm ci` in CI freeze the install to the vetted tarball, and
  `npm audit signatures` verifies its sigstore provenance — the assurance for a
  recently-published package that age alone does not give. Hygiene rule going forward: do not
  enable Browser Mode / `--ui` / `--api` without cause; for future React component tests
  prefer `happy-dom`/`jsdom` (environment) over Browser Mode (real browser).

Sources: Context7 `/vitest-dev/vitest/v4.1.6` (`docs/guide/index.md`, `migration.md`,
`packages/vitest/package.json`), `/withastro/docs` (`guides/testing.mdx`,
`reference/modules/astro-config.mdx`); GitHub Advisory Database GHSA-5xrq-8626-4rwp,
GHSA-2h32-95rg-cppp, GHSA-g8mr-85jm-7xhm, GHSA-p63j-vcc4-9vmv, GHSA-82fw-gwwq-j7x9
(`@vitest/mocker`, patched 4.1.11).
