# Cloudflare Workers — First Deployment Plan

## Context

`context/foundation/infrastructure.md` (researched 2026-06-14) selected **Cloudflare Workers (Static Assets)** as the MVP platform, with `@astrojs/cloudflare` v13 already wired. The codebase is structurally deploy-ready (correct adapter, correct `astro:env/server` access pattern, proper `.gitignore`, `wrangler.jsonc` with `nodejs_compat`), but several connective bits are missing or misaligned:

- Worker name is still the starter template's `"10x-astro-starter"` (rename → `table-planner`).
- No `deploy` script in `package.json`.
- CI workflow targets `master` but the actual branch is `main`; CI also has no deploy job.
- No Cloudflare account, no production Supabase project, no GitHub secrets for Cloudflare.
- `.dev.vars.example` missing (workerd-local-dev docs gap).

This plan ships the **first production deploy** by hand and then wires **auto-deploy on push to `main` via Cloudflare Workers Builds** — Cloudflare's native git integration, NOT GitHub Actions. Cloudflare connects directly to the GitHub repo, runs `npm run build` + `wrangler deploy` inside its own build environment, and surfaces preview URLs for non-main branches. No `CLOUDFLARE_API_TOKEN` lives in GitHub secrets. The plan addresses the top risks from `infrastructure.md` (Astro 6 + React island + workerd bugs, `wrangler deploy` having no draft safety net, known dependency risks) via a mandatory Day-1 smoke test on `wrangler dev` *and* `wrangler deploy` to a sandbox worker before the real `main`-branch deploy. Output: a public `https://table-planner.<subdomain>.workers.dev` URL with working Supabase SSR auth, plus automatic Cloudflare-managed deploys on every push to `main`.

---

## How to use this plan

Wykonuj fazy **po kolei**. Phase 0 to jednorazowy pre-flight (instalacja narzędzi + założenie kont) i powinien zająć ~50–65 min. Phases 1–6 to konkretne zmiany w kodzie i w panelach Cloudflare/Supabase, każda z checkboxami do odhaczania.

**TL;DR kolejność**:
1. **Phase 0** — install Node/wrangler/supabase CLI/Docker + załóż konta Cloudflare i Supabase
2. **Phase 1** — rename worker/project_id, dodaj deploy script, branch fix
3. **Phase 2** — `npm run preview` smoke test na workerdzie (gate przed deploy)
4. **Phase 3** — `wrangler deploy` ręcznie, ustaw secrets, skonfiguruj Supabase URL Configuration
5. **Phase 4** — wpinaj Workers Builds (auto-deploy on push to main)
6. **Phase 5** — Cloudflare MCP (opcjonalne, ale zaplanowane)
7. **Phase 6** — hardening (Dependabot, migration rollback rule)
8. **Verification** — 12 finalnych checków

Na końcu pliku są **trzy Appendiksy referencyjne** (Wrangler / Supabase / Cloudflare config) — to materiał do pogłębienia, **NIE** akcje do wykonania. Akcje są w fazach. Sięgnij do Appendiksu gdy potrzebujesz zrozumieć warstwę konfiguracji albo poznać komendę spoza cheat-sheetów wbudowanych w fazy.

---

## External integration map

Moving pieces this plan touches and how they connect.

| System | What we create / configure | Used by |
|---|---|---|
| **Cloudflare account** | Account + `<name>.workers.dev` subdomain. **No API token needed for this plan** — `wrangler login` (OAuth) handles local deploys; Workers Builds uses its own GitHub OAuth flow | `wrangler login` (Phase 3), Workers Builds (Phase 4), MCP servers (Phase 5) |
| **Cloudflare Workers Secrets** (runtime) | `SUPABASE_URL`, `SUPABASE_KEY` via `wrangler secret put` — encrypted at rest, not in `wrangler.jsonc` | Worker runtime via `astro:env/server` |
| **Cloudflare Workers Builds env vars** (build-time) | Same `SUPABASE_URL`, `SUPABASE_KEY` set in Cloudflare dash → Workers → Settings → Variables. **Separate from runtime secrets** — both copies must be rotated together | `npm run build` step inside Cloudflare's build container (astro:env/server validation) |
| **Cloudflare Workers Builds git integration** | OAuth-authorized Cloudflare GitHub app connected to `<github-owner>/table-planner`, production branch = `main`, build command + deploy command configured in Cloudflare dash | Auto-deploy on push to `main`; preview deploys for non-main branches |
| **Supabase production project** | New project (PL region: `eu-central-1` Frankfurt is the closest to Polish users; check at provisioning) + anon key + Auth → URL Configuration | App auth flow |
| **Supabase Auth → URL Configuration** | Site URL = `https://table-planner.<subdomain>.workers.dev`; redirect URL pattern for `/auth/confirm-email` | Email confirmation links work end-to-end |
| **GitHub repo secrets** | `SUPABASE_URL`, `SUPABASE_KEY` (already referenced by CI for lint/build verification). **No `CLOUDFLARE_*` secrets needed** — Workers Builds doesn't run in GitHub Actions | GH CI lint + build (signal only, not a deploy gate) |
| **Local `.dev.vars`** | Gitignored mirror of prod secrets | `npm run preview` on workerd |
| **Cloudflare MCP servers** (post-deploy) | `cloudflare-workers-bindings`, `cloudflare-observability`, `cloudflare-docs` via `claude mcp add` (OAuth interactive) | Future Claude sessions: structured env/secrets/logs access |

---

## Phase 0 — Pre-flight (one-time, ~50–65 min)

External work + local tool install that must happen before any code change. Nothing here is reversible-by-script. Phase 0 ends with a hard gate (§0.4) — don't move on to Phase 1 until every box ticks.

### 0.1 Install CLI tools and Docker (~20 min)

If you've worked on TablePlanner before, most of this is done — skim and verify, don't re-install.

#### What needs to be installed

| Tool | Required version | Install (macOS) | Verify |
|---|---|---|---|
| Node.js | `22.14.0` (per `.nvmrc`) | `nvm install 22.14.0 && nvm use 22.14.0` | `node --version` → `v22.14.0` |
| npm | bundled with Node | — | `npm --version` |
| Wrangler CLI | `^4.90.0` (in `package.json` devDependencies) | `npm install` in repo root | `npx wrangler --version` → `4.x` |
| Supabase CLI | `^2.23.4` (in `package.json` devDependencies) | `npm install` in repo root | `npx supabase --version` |
| Docker Desktop | latest stable | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) | `docker --version && docker ps` |
| git | usually pre-installed | `xcode-select --install` | `git --version` |

#### Steps

- [x] **Install / select Node 22.14.0** (the version pinned in `.nvmrc`):
  ```bash
  # If nvm itself is missing:
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

  nvm install 22.14.0
  nvm use 22.14.0
  node --version  # must print v22.14.0
  ```
  - *Edge case:* If you use fnm or asdf instead of nvm, both also respect `.nvmrc` — just `fnm use` / `asdf install nodejs 22.14.0`.
  - *Edge case:* `node --version` returning a major-version mismatch means your shell isn't picking up the nvm-switched binary. Re-source your shell (`exec zsh`) or check `which node`.

- [x] **Install project dependencies** (this installs **both** Wrangler and Supabase CLI locally — no global install needed):
  ```bash
  npm install
  npx wrangler --version   # → 4.x
  npx supabase --version   # → 2.x
  ```
  Both CLIs are pinned as `devDependencies` in `package.json` (`wrangler ^4.90.0`, `supabase ^2.23.4`). After `npm install` they're available via `npx <name>` and from `node_modules/.bin/` (so npm scripts can call them without the `npx` prefix).
  - *Why this is better than `brew install supabase/tap/supabase`:* version pinned in repo (no `u mnie działa` drift across machines), no Homebrew dependency, single command for both CLIs. Trade-off: ~200ms `npx` startup overhead per command — irrelevant for human-paced work.
  - *Edge case:* npm may print peer-dep warnings about `vite` — that's the `overrides` block in `package.json` doing its job (CLAUDE.md §Key conventions). Not an error.
  - *Edge case:* Husky's `prepare` script runs on first install; if it fails, run `npx husky install` manually.
  - *Edge case:* if you already have a globally-installed `supabase` (from a previous brew install), `which supabase` will resolve to the global one in interactive shells. Use `npx supabase ...` explicitly so you always hit the repo-pinned version.

- [x] **Install Docker Desktop** (required for `npx supabase start` local dev — local Supabase boots its services in Docker):
  - Download installer from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) — pick **Apple Silicon** if on M1/M2/M3, **Intel** otherwise.
  - Launch Docker Desktop after install; wait for the whale icon in menu bar to show "Docker Desktop is running".
  - Verify: `docker ps` (must return an empty container table, not "Cannot connect to the Docker daemon").
  - *Edge case:* Free Docker Desktop license is fine for personal projects. Commercial use at companies ≥250 employees or >$10M revenue needs a paid license — irrelevant for TablePlanner MVP but worth knowing.
  - *Edge case:* If you don't want Docker Desktop, alternatives are [OrbStack](https://orbstack.dev) (faster on Apple Silicon, paid for commercial) or Colima (free, CLI-only) — both are drop-in compatible with Supabase CLI.

- [x] **Verify local Supabase boots cleanly** (smoke test of Docker + CLI):
  ```bash
  npx supabase start
  ```
  First run pulls ~10 Docker images (~2 min). Expected output: list of services with URLs (Studio: http://127.0.0.1:54323, API: http://127.0.0.1:54321, JWT secret, anon/service keys, etc.).
  - *Edge case:* Hangs on "Pulling images" → Docker Desktop not fully started; wait for the menu-bar icon to stabilize.
  - *Edge case:* Port collision (`54321 already in use`) → another supabase instance is running, or another tool grabbed the port. `npx supabase stop --no-backup` then retry; or edit ports in `supabase/config.toml`.
  - **Stop after verification** (unless you plan to use local dev immediately): `npx supabase stop`.

### 0.2 Create Cloudflare and Supabase accounts (~30–45 min)

- [x] **Create Cloudflare account.** dash.cloudflare.com → sign up → accept email verification. Choose `<your-name>.workers.dev` subdomain — **one-time, irreversible** (Cloudflare treats it as identity). Pick deliberately: if you'll ever paste the URL into an email, "agata-apps.workers.dev" reads better than "agata-test.workers.dev". See *Appendix C* for full subdomain implications.
  - *Note:* No scoped API token created now. `wrangler login` (Phase 3) uses interactive OAuth, and Workers Builds (Phase 4) uses Cloudflare's own GitHub OAuth app — neither needs a long-lived token. If you later add automation that needs API access (e.g., scripted log scraping), create a token then with minimal scope.

- [x] **Note your Cloudflare Account ID.** dash.cloudflare.com → right sidebar of any Workers page shows "Account ID". Copy to password manager — useful for `wrangler whoami` validation and dashboard URLs.

- [x] **Set Cloudflare billing budget alert.** Account Home → Billing → set a **$5/month budget alert** even though you expect $0. Catches a runaway worker accidentally consuming paid features.

- [x] **Create Supabase production project.** supabase.com → New project. Region: **`eu-central-1` (Frankfurt)** for Polish users (lowest latency from PL). Set strong DB password (store in password manager). Wait ~2 min for provisioning.
  - *Edge case:* Supabase free tier projects pause after 7 days of inactivity. Click any dashboard tab once to reset the timer; pause itself takes minutes to wake. Phase 6 reminds you to document this in CLAUDE.md.

- [x] **Capture Supabase credentials.** Project Settings → API → copy `Project URL` (→ `SUPABASE_URL`) and `anon` `public` key (→ `SUPABASE_KEY`). **Do not** copy the `service_role` key — anon is what `@supabase/ssr` needs for cookie-based SSR. See *Appendix B* for `anon` vs `service_role` cardinal rule.

- [x] **Configure Supabase Authentication → Providers** (in dashboard, immediately after project creation):
  - **Email** provider: enabled (default — confirm it is)
  - "Confirm email" toggle: **enabled**. Note: this **intentionally differs from local** — `supabase/config.toml` has `enable_confirmations = false` because locally all mail lands in Inbucket (`127.0.0.1:54324`) and clicking the confirm link every signup slows dev iteration. In production, real users get real email so verification protects against fake signups.
  - "Allow anonymous sign-ins": **disabled** (matches local `enable_anonymous_sign_ins = false`)
  - Any OAuth providers you're not using: **disabled** — they would show up as buttons on `/auth/signin`
  - *Note:* "Authentication → URL Configuration" (Site URL + Redirect URLs) is **deferred to Phase 3** because we don't yet know the production workers.dev URL.

- [x] **Verify Supabase Auth defaults** (Settings → Auth — one-time, easy to forget):
  - JWT expiry: `3600` (1 hour access tokens — fine for MVP)
  - Refresh token rotation: **enabled** (default — security best practice)
  - "Reuse interval": `10` seconds (default — handles parallel SSR requests gracefully)

- [x] **Email delivery readiness check.** Supabase default SMTP has a **4 emails/hour rate limit** on free tier. For first auth smoke test, one signup is fine. If you plan to test more, either add custom SMTP (Authentication → SMTP Settings) or accept the cap.

### 0.3 Link Supabase CLI to production project (~3 min) — **DEFERRED**

> **Status:** Deferred until first migration is created. Not required for initial deploy (no migrations exist yet). Come back here before running `npx supabase db push` for the first time.

Now that the production project exists, link the local CLI so future migrations can be pushed.

- [~] **Authenticate Supabase CLI** — *deferred until first migration*:
  ```bash
  npx supabase login   # opens browser → personal access token, stored at ~/.supabase/access-token
  ```
  - *Edge case:* On a shared machine, `npx supabase logout` after the session.

- [~] **Link to production project** — *deferred until first migration*:
  ```bash
  npx supabase link --project-ref <project-ref>
  ```
  `<project-ref>` is the substring between `https://` and `.supabase.co` in your project URL (from §0.2).
  - *Why now:* enables future `npx supabase db push` for migrations. Not strictly needed for the very first deploy (no migrations yet), but you'll need it within days — set it up while context is fresh.

### 0.4 Pre-flight gate

Don't move to Phase 1 until **all of these** pass:

- [x] `node --version` → `v22.14.0`
- [x] `npm install` completed (peer-dep warnings on `vite` are allowed — `overrides` block)
- [x] `npx wrangler --version` → `4.x`
- [x] `npx supabase --version` → `2.x`
- [x] `docker ps` returns without error
- [x] `npx supabase start` boots cleanly (then `npx supabase stop`)
- [x] Cloudflare account exists; you can reach dash.cloudflare.com logged in
- [x] `<your-name>.workers.dev` subdomain chosen; Account ID saved to password manager — *subdomena i prod URL zapisane w password managerze*
- [x] Supabase project exists in `eu-central-1`; `Project URL` + `anon` key saved
- [~] `npx supabase link --project-ref <ref>` succeeded (no error) — *deferred with Phase 0.3 until first migration*
- [x] You understand `anon` vs `service_role` distinction (*Appendix B*) — won't paste the wrong key in Phase 3

---

## Phase 1 — Local config alignment (no deploys yet)

Code-side changes to make the repo deployable. All files exist; this is editing, not creating new patterns.

- [x] **Resolve branch name discrepancy.** Current HEAD is `main`; CI workflow `.github/workflows/ci.yml` targets `master`; `CLAUDE.md` §CI says `master`. **Decision: align everything to `main`** (matches the actual branch, matches `git status` at session start). Implemented across the next two checkboxes and the CLAUDE.md update below.

- [x] **Rename worker in `wrangler.jsonc`** — `"name": "10x-astro-starter"` → `"name": "table-planner"`. This is the URL prefix on `workers.dev`, so it's user-facing.

- [x] **Rename project_id in `supabase/config.toml`** line 5: `project_id = "10x-astro-starter"` → `"table-planner"`. Cosmetic but keeps local Supabase consistent.

- [x] **Add `deploy` script to `package.json`**: `"deploy": "wrangler deploy"`. Also consider `"deploy:dry": "wrangler deploy --dry-run --outdir dist"` for sanity-check builds.

- [~] **Pin `@astrojs/cloudflare` to an exact version.** — *deferred: `npm audit` obecnie czyste dla `13.5.0`; `astro` bumped do 6.4.8; pełny `npm audit fix` odłożony do post-MVP.* Currently `^13.5.0`. Per `infrastructure.md` risk register, remove the `^` and pin to a specific patch — details w rejestrze ryzyk.

- [x] **Create `.dev.vars.example`** at repo root with:
  ```
  SUPABASE_URL=https://<your-project-ref>.supabase.co
  SUPABASE_KEY=<anon-public-key>
  ```
  Documents the workerd local-dev contract; the actual `.dev.vars` stays gitignored.

- [x] **Update CI branch trigger** in `.github/workflows/ci.yml`: `branches: [master]` → `branches: [main]` (both in `push` and `pull_request`). The workflow stays as **lint/build verification only** — no deploy job is added (Workers Builds in Phase 4 handles deploy).

- [x] **Update CLAUDE.md** §CI: "every push and PR to `master`" → "every push and PR to `main`".

**Verification**: `npm run lint` and `npm run build` should still pass locally (sanity-check the renames didn't break anything).

---

## Phase 2 — Local secrets + workerd Day-1 smoke test

This phase **gates the deploy**. The top risk in `infrastructure.md` is Astro 6 + React island + workerd bugs blocking SSR mid-sprint (#16387, #16529, #15411). The smoke test catches it now, when a Netlify swap is still cheap.

- [x] **Create local `.dev.vars`** at repo root (gitignored — verify with `git status` that it's NOT tracked):
  ```
  SUPABASE_URL=<production Supabase URL from Phase 0>
  SUPABASE_KEY=<production anon key from Phase 0>
  ```
  - *Why production creds in local `.dev.vars`?* Because `npm run preview` runs the same workerd runtime as production, and we want the smoke test to exercise the **real** Supabase auth flow against real cookies. If you want isolation, create a separate Supabase project for staging (out of scope for first deploy). See *Appendix B* "Local vs production" for the broader picture.
  - *użyto lokalnej Supabase (`http://127.0.0.1:54321` + lokalny anon key) zamiast prod — bezpieczniejsze dla smoke testu, prod creds wchodzą dopiero w Phase 3 przez `wrangler secret put`*

- [x] **Build and preview**:
  ```bash
  npm run build
  npm run preview
  ```

- [x] **Smoke test in browser** at the URL `wrangler` prints (typically `http://localhost:8788`):
  - [x] Home page renders without console errors
  - [x] `/auth/signin` renders
  - [x] `/auth/signup` — submit with a test email, receive Supabase confirmation email
  - [x] Confirm email → `/dashboard` renders (or the protected page flow works)
  - [x] **Open DevTools console.** Watch for: `react-dom/client` SyntaxError (issue #16387), Invalid hook call (issue #16529), `cloudflare:workers` ESM URL error (#15411). If any hit → **STOP and trigger Netlify fallback** (out of scope for this plan, but `infrastructure.md` runner-up section is the entry point).
  - [x] **Check `wrangler tail` output** in another terminal for runtime errors that don't reach the browser.

- [x] **Date display sanity check**: `CLAUDE.md` mandates UTC + `formatDate()` helper. The topbar already shows the current date (last commit `ed3ef5f`). Verify it renders correctly in workerd.

**Gate**: If smoke test passes — proceed to Phase 3. If it fails — debug; if not fixable in one evening, swap to Netlify per `infrastructure.md` runner-up plan.

---

## Phase 3 — First manual production deploy

Manual first deploy (auto-deploy comes in Phase 4). This gives a clean point to verify the worker is reachable before automation enters the picture. See *Appendix A* for full wrangler command cheat-sheet.

- [x] **Wrangler login** (opens browser — must run locally on a graphical machine):
  ```bash
  npx wrangler login
  npx wrangler whoami
  ```
  `whoami` should show the correct account, email, and **the Account ID matching what you noted in Phase 0.2**.
  - *Edge case:* if you're logged into a *different* Cloudflare account (e.g., personal vs work), `npx wrangler logout` then `login` again.
  - *Edge case (multi-account membership):* if you're a member of several Cloudflare accounts, wrangler will prompt to choose at each command. Pin one by setting `CLOUDFLARE_ACCOUNT_ID=<id>` in your shell rc.
  - *Edge case (headless / SSH machines):* `wrangler login` won't work — there's no browser. Use a scoped API token instead: `export CLOUDFLARE_API_TOKEN=<token>`. Not needed on a local machine with a browser.

- [x] **Set production runtime secrets** (one-by-one, each prompts interactively for the value — paste from Phase 0):
  ```bash
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  ```
  These are stored encrypted at rest in Cloudflare; `wrangler tail` will not echo them. Verify with `npx wrangler secret list` — shows **names**, never values.

- [x] **First deploy**:
  ```bash
  npx wrangler deploy
  ```
  Expected output: `Uploaded table-planner (X sec)` and a URL `https://table-planner.<your-subdomain>.workers.dev`.

- [x] **Configure Supabase Auth → URL Configuration** in Supabase dashboard (deferred from Phase 0.2 — we needed the workers.dev URL):
  - **Site URL**: `https://table-planner.<your-subdomain>.workers.dev`
  - **Redirect URLs** (Allow list): `https://table-planner.<your-subdomain>.workers.dev/**`
  - *Edge case:* omit the `/**` wildcard and the redirect to `/auth/confirm-email?token=...` will be rejected — only the exact Site URL would be allowed.
  - *Why now:* without this, email confirmation links go to `localhost` and break in prod.

- [x] **Verify Cloudflare observability is on** (one-time check):
  - `wrangler.jsonc` already has `observability.enabled = true`
  - In dash: Worker → `table-planner` → Observability — confirm "Enabled" badge present
  - Log sampling: leave at default (100% for low-volume MVP)

- [x] **Production smoke test**:
  - [x] Open production URL → renders
  - [x] `/auth/signin` → renders
  - [x] Sign up with a fresh test email → confirmation email arrives → click link → redirected to production app (NOT localhost)
  - [x] `/dashboard` (or other protected route) renders with auth
  - [x] `npx wrangler tail` shows no 500s during the flow

- [x] **Edge case checks**:
  - [x] **Cookie domain**: `@supabase/ssr` cookies should be set on `*.workers.dev` with `Secure; SameSite=Lax`. In DevTools → Application → Cookies, verify they exist and aren't being rejected. *SameSite=Lax + HttpOnly confirmed (HttpOnly required a fix in `src/lib/supabase.ts` — neither @supabase/ssr nor Astro cookie API set it by default). Secure intentionally omitted — would break local HTTP preview; Cloudflare enforces HTTPS in prod.*
  - [x] **CPU time limit**: Workers free tier has a **10ms CPU limit per request**. SSR auth calls are I/O-bound (Supabase HTTP), so CPU should be fine — but if you see `Worker exceeded CPU limit` in `wrangler tail`, the auth client may have a hot loop. Investigate before Phase 4.
  - [x] **Env import**: confirm the worker is reading secrets via `astro:env/server` (already correct in `src/lib/supabase.ts`). If you see `SUPABASE_URL is undefined` in logs, the secret didn't bind — re-run `npx wrangler secret put`.

---

## Phase 4 — Cloudflare-native auto-deploy via Workers Builds

After the first manual deploy succeeds, connect the GitHub repo to **Cloudflare Workers Builds** so subsequent pushes to `main` build + deploy automatically from inside Cloudflare's infrastructure. **No GitHub Actions deploy job, no `CLOUDFLARE_*` secrets in GH.**

**Tradeoff vs GitHub Actions path** (the option we rejected): Workers Builds runs **independently** of `.github/workflows/ci.yml`. Cloudflare doesn't see whether the GH `lint` job passed — it only knows about its own build. A push to `main` with a lint error can still deploy if `astro build` itself succeeds. We mitigate this by making `npm run build` itself fail on lint errors (see first checkbox below), so Cloudflare's build container catches what GH CI would have.

### Steps

- [x] **Add `prebuild` lint guard to `package.json`** (critical — without it, lint errors won't block Cloudflare deploys): `"prebuild": "npm run lint"`. Now `npm run build` always runs `npm run lint` first, both locally and inside Cloudflare Workers Builds. Verify locally: introduce a deliberate lint error → `npm run build` should fail before Astro starts compiling.
  - *Edge case*: if `prebuild` slows local dev iteration too much, you can scope it to CI only by gating on `process.env.CI`, but for MVP keep it unconditional — the safety net is worth the few seconds.

- [x] **Connect GitHub repo to Cloudflare Workers Builds**:
  1. dash.cloudflare.com → Workers & Pages → click the `table-planner` worker (deployed in Phase 3)
  2. Settings → Build → "Connect to Git" (button label may vary — Cloudflare iterates the UI; the action is "link a Git repository")
  3. Authorize the Cloudflare GitHub app for `<github-owner>/table-planner` only (do NOT grant org-wide access — scope to this single repo)
  4. **Production branch**: `main`
  5. **Build configuration**:
     - **Build command**: `npm run build`
     - **Deploy command**: `npx wrangler deploy` (Cloudflare's default for Workers; verify in UI)
     - **Root directory**: `/` (default)
     - **Node version**: verify Cloudflare picks up `.nvmrc` (`22.14.0`); if not, set `NODE_VERSION=22.14.0` as a build env var
     - **Auto-retry failed builds**: leave **off** (avoid silent retries masking real errors)
     - **Build caching**: leave **on** (default — speeds up builds)

- [x] **Add build-time env vars in Workers Builds settings** (Settings → Variables → Build-time variables):
  - `SUPABASE_URL` — same value as Phase 3 runtime secret
  - `SUPABASE_KEY` — same value as Phase 3 runtime secret
  - These are needed because `npm run build` reads them via `astro:env/server` validation. Without them, Cloudflare's build will fail at the env-schema step.
  - *Edge case*: Cloudflare Workers Builds **build-time env vars are separate** from the runtime `wrangler secret` values set in Phase 3. You're maintaining two copies — document in CLAUDE.md so future rotations update **both** (otherwise the worker either fails to build or starts with stale secrets).
  - *Edge case*: Mark them as **encrypted** in the dashboard, not plaintext — the UI offers both modes; encrypted means they don't appear in build logs.

- [x] **Configure preview deployments for feature branches**: in the same Build settings, enable preview deployments for non-`main` branches. Each push creates `<branch-name>.table-planner.<subdomain>.workers.dev` (URL format may vary). **Don't pass production Supabase secrets to previews** — either set preview-only env vars in the same settings page, or accept that previews show the "Supabase not configured" warning state (the existing `createClient()` null-return path in `src/lib/supabase.ts` handles this gracefully).
  - *Edge case*: Preview URLs are **publicly accessible by default**. If a preview ever contains real data, gate it with Cloudflare Access (zero-trust login wall) — out of scope for first deploy, but flag if it comes up.

- [x] **Test the integration end-to-end**:
  1. Make a trivial change on a new branch (e.g., update a comment): `git checkout -b test/workers-builds-smoke`
  2. Push and open a PR
  3. Verify Cloudflare Workers Builds creates a preview deployment (URL appears in the Cloudflare dashboard → Workers → table-planner → Deployments; may also surface in GitHub PR checks if the Cloudflare app added a check)
  4. GitHub Actions CI runs lint + build in parallel — that's still the **signal** that lint passed
  5. Merge PR to `main` → Cloudflare Workers Builds triggers production deploy automatically
  6. Production URL reflects the change within ~2 min

- [x] **Add deploy-flow rules to `CLAUDE.md`** §Environment:
  > **Production deploys go through Cloudflare Workers Builds.** Pushing to `main` triggers automatic build + deploy from Cloudflare's infrastructure — not GitHub Actions. After Workers Builds is connected, **never run `wrangler deploy` from a local machine** — it bypasses the Cloudflare build environment and can introduce drift (different Node version, different `node_modules`, missed `prebuild` lint). Local checks: `npm run build` + `npm run preview`. GitHub Actions CI (`.github/workflows/ci.yml`) is a **signal** (lint passing) not a **gate** — a green Cloudflare deploy with red GH CI means `prebuild` lint guard let something through; investigate the gap before pushing again. **Build-time `SUPABASE_*` env vars in Cloudflare Workers Builds settings are separate from runtime `wrangler secret` values** — when rotating Supabase keys, update BOTH.

---

## Phase 5 — MCP setup (optional but user-selected)

Per `infrastructure.md` §Unknown Unknowns, MCP servers each require interactive OAuth — they don't pre-load from `.claude/settings.json`. Do this **after** Phase 4 succeeds so the worker actually exists to bind against.

- [~] **Workers Bindings MCP** (env vars + secrets management): *skipped — Phase 5 whole block deferred; MCP servers add value when structured Cloudflare access is needed from Claude, can be enabled in a future session*
  ```bash
  claude mcp add cloudflare-workers-bindings -- npx -y mcp-remote https://bindings.mcp.cloudflare.com/sse
  ```
  Follow the OAuth prompt in browser.

- [~] **Observability MCP** (structured access to `wrangler tail`-style logs): *skipped with Phase 5*
  ```bash
  claude mcp add cloudflare-observability -- npx -y mcp-remote https://observability.mcp.cloudflare.com/sse
  ```

- [~] **Docs MCP** (agent-readable Cloudflare docs): *skipped with Phase 5*
  ```bash
  claude mcp add cloudflare-docs -- npx -y mcp-remote https://docs.mcp.cloudflare.com/sse
  ```

- [~] **Verify**: `claude mcp list` should show all three as `connected`. If any shows `auth_required`, re-run the OAuth. *skipped with Phase 5*

- [~] *Edge case*: OAuth tokens for MCP can expire; if a future session shows tools returning auth errors, re-run `claude mcp add` for that server. *skipped with Phase 5*

---

## Phase 6 — Post-deploy hardening (quick wins)

Captured from the risk register so they're not lost.

- [~] **Disable Dependabot auto-merge** for `@astrojs/cloudflare`, `astro`, `wrangler`, `@supabase/ssr`, `@supabase/supabase-js` — manual PR review only. (If no `dependabot.yml` exists yet, this is a "don't add auto-merge" rule, not a file change.) *skipped — no `dependabot.yml` exists yet; rule applies preventively if/when Dependabot is added*

- [x] **Document Supabase migration rollback caveat** in CLAUDE.md: `npx wrangler rollback` reverts the worker code but NOT Supabase migrations (`npx supabase db push` is one-way at the schema level). Schema-breaking migrations to `main` only outside a known production-use window. See *Appendix B — Migration workflow* for the broader picture.

- [~] **Document Supabase 7-day inactivity pause** in CLAUDE.md: if the project sits idle a week between sprints, Supabase auto-pauses. Click any dashboard tab to reset. *skipped — failure is loud (visible error on return) and auto-resolves within minutes; low value for CLAUDE.md line-count*

- [~] **Add `compatibility_date` review reminder**: `wrangler.jsonc` currently pins `2026-05-08`. Worth a calendar reminder to review every ~6 months — bumping it can unlock fixes but also introduce behavior changes. *skipped — Cloudflare rarely ships breaking compat changes; pinned date gives deterministic behavior, revisit when a specific fix is needed*

---

## Verification (end-to-end)

Final acceptance checks after Phase 4 (Phase 5 + 6 are independent and don't gate this). Run in this order:

1. [x] **Public URL responds**: `curl -I https://table-planner.<subdomain>.workers.dev` → `HTTP/2 200`
2. [x] **Auth flow round-trip**: sign up new user → confirm email → land on `/dashboard` (or protected route)
3. [x] **Sign out works**: `/api/auth/signout` POST clears cookie, redirect to home
4. [x] **`wrangler tail` is clean** during the flow — no 500s, no `Worker exceeded` errors
5. [x] **Workers Builds auto-deploy works**: trivial push to `main` triggers Cloudflare Workers Builds; dashboard → Workers → table-planner → Deployments shows the new version; production URL reflects the change within ~2 min
6. [x] **Preview deploy works** for a feature branch — push a branch, verify Cloudflare creates a non-`main` deployment with its own URL
7. [~] **Rollback path works**: `npx wrangler deployments list` shows ≥2 versions; `npx wrangler rollback` (dry first, then real) reverts cleanly. *Note*: rollback via CLI bypasses Workers Builds — it's a direct platform operation, safe to do locally even after Workers Builds is wired *(partial: `deployments list` confirms ≥8 versions available for rollback; actual `wrangler rollback` not exercised — deferred until real need)*
8. [~] **Smoke retest after rollback**: auth flow still works (catches the "rollback restored a broken version" trap) *(deferred with #7)*
9. [x] **Secrets are NOT in code**: `git grep -i 'supabase_key\|SUPABASE_KEY=eyJ'` returns nothing in tracked files
10. [x] **`.dev.vars` is gitignored**: `git check-ignore .dev.vars` returns the file path
11. [x] **No `CLOUDFLARE_*` secrets in GH**: Settings → Secrets → confirm only `SUPABASE_URL` and `SUPABASE_KEY` are present *(actually zero secrets — GH Actions CI deleted, no `CLOUDFLARE_*` present)*

If all green → first ship complete. Update `context/foundation/infrastructure.md` `researched_at` only if substantive findings emerged; otherwise leave it as-is and write deploy notes to `context/deployment/deploy-plan.md` (per the chain in CLAUDE.md).

---

## Critical files touched

| File | Phase | Change |
|---|---|---|
| `wrangler.jsonc` | 1 | Rename `name` |
| `package.json` | 1, 4 | Add `deploy` script; pin `@astrojs/cloudflare` exactly; add `prebuild` lint guard (Phase 4) |
| `.github/workflows/ci.yml` | 1 | Branch trigger `master`→`main` only (kept as lint/build signal — NO deploy job added) |
| `supabase/config.toml` | 1 | Rename `project_id` |
| `.dev.vars.example` (new) | 1 | Document workerd local-dev env contract |
| `.dev.vars` (new, gitignored) | 2 | Local prod-mirror secrets |
| `CLAUDE.md` | 1, 4, 6 | Branch alignment; Workers-Builds-only deploy rule; two-copy secrets caveat; Supabase migration rollback caveat; 7-day pause note |
| Cloudflare (external) | 0, 3, 4 | Account, subdomain, billing alert, Auth providers, runtime secrets (`wrangler secret`), Workers Builds git integration, build-time env vars |
| Supabase (external) | 0, 3 | Project, anon key, Auth Providers config, JWT/refresh defaults, Site URL + redirect allowlist (Phase 3) |
| GitHub repo (external) | 0 | Branch alignment only — no new repo secrets needed (Workers Builds uses Cloudflare's own GitHub OAuth app) |

---

# Appendices — configuration reference (deep-dive, NOT actions)

The three sections below are **reference material**, not steps. Actions for these systems are in Phases 0–4. Read an appendix when you need to understand a layer of configuration, look up a command not in the phase-level cheat-sheets, or recover from an edge case.

---

## Appendix A — Wrangler CLI configuration reference

What "configuring wrangler" actually means in this repo. The starter shipped `wrangler.jsonc` and `package.json` has wrangler as a dependency; the work in the phases above is mostly verifying you understand each layer.

### The four layers of Wrangler config

Wrangler reads configuration from four places. Knowing which layer holds what is half the battle — secret leaks usually happen by putting a value in the wrong layer.

| Layer | Location | What goes here | Lifetime |
|---|---|---|---|
| **1. Repo config** | `wrangler.jsonc` in repo root | Worker name, entry point, compatibility flags, assets binding, observability toggle — **non-secret**, shared across team | Tracked in git |
| **2. Local dev secrets** | `.dev.vars` in repo root (gitignored) | Secrets used only by `wrangler dev` / `npm run preview` | Per-machine; **never in git** |
| **3. Runtime secrets (Cloudflare-side)** | Stored encrypted by Cloudflare; set via `wrangler secret put` | Secrets used by the **deployed** worker | Cloudflare-side; rotate via re-running `wrangler secret put` |
| **4. CLI auth** | `~/.wrangler/config/default.toml` (created by `wrangler login`) | OAuth tokens for your Cloudflare account | Per-machine; managed by wrangler |

**Cardinal rule**: secrets NEVER go in `wrangler.jsonc` (it's in git). Public config (worker name, compat flags) NEVER goes in `wrangler secret` (it's runtime-only, can't be read at build time).

### What's in `wrangler.jsonc` (annotated)

The file is pre-populated by `10x-astro-starter`. Current contents with what each field means:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json", // editor IntelliSense for this file
  "name": "10x-astro-starter",                           // ← Phase 1 renames to "table-planner"; becomes URL prefix
  "main": "@astrojs/cloudflare/entrypoints/server",      // Astro 6 SSR entry — do NOT change
  "compatibility_date": "2026-05-08",                    // pins workerd behavior to this date (newer = newer features, possible behavior changes)
  "compatibility_flags": ["nodejs_compat"],              // enables Node API polyfills — REQUIRED for @supabase/ssr
  "assets": {
    "binding": "ASSETS",                                  // env binding name for static assets (used by Astro adapter)
    "directory": "./dist",                                // build output directory
    "not_found_handling": "404-page"                      // serve /404 page on asset misses
  },
  "observability": { "enabled": true }                    // built-in metrics + logs in Cloudflare dash
}
```

**You do NOT need to add a `[vars]` block** in this repo — every env var (`SUPABASE_URL`, `SUPABASE_KEY`) is a secret, so they go through layer 3 (`wrangler secret put`) or layer 2 (`.dev.vars`), never layer 1.

### Wrangler commands cheat-sheet

The set of wrangler commands you'll actually use. Anything not in this table is unlikely to come up during MVP.

| Command | Purpose | When |
|---|---|---|
| `npx wrangler dev` | Run worker locally on workerd runtime (closer to prod than `astro dev`) | Verifying workerd-specific behavior |
| `npm run preview` | Same path via Astro preview script | Day-1 smoke test (Phase 2) |
| `npx wrangler deploy` | Deploy to production | Manual first deploy (Phase 3). **After Phase 4, prefer Workers Builds** (push to main) |
| `npx wrangler deploy --dry-run --outdir dist` | Build worker bundle without uploading | Sanity check / debugging build issues |
| `npx wrangler secret put NAME` | Add/update production secret (interactive value prompt) | Setting `SUPABASE_*`; rotation |
| `npx wrangler secret list` | List secret **names** (values never shown) | Verify secrets exist after `put` |
| `npx wrangler secret delete NAME` | Remove a secret | Cleanup |
| `npx wrangler deployments list` | Show recent versions deployed (with version IDs) | Pre-rollback investigation |
| `npx wrangler rollback [VERSION_ID]` | Atomic rollback (~5s); no arg = previous version | Recover from a broken deploy |
| `npx wrangler tail` | Live runtime logs from production | Debugging |
| `npx wrangler tail --status error` | Filter for errors only | Triage hot incidents |
| `npx wrangler whoami` | Show current auth state | After `login` / when something acts weird |

---

## Appendix B — Supabase configuration reference

Supabase has more moving parts than wrangler (auth, DB, RLS, key types) and a few traps that bite if you skip them. Actions are in Phases 0 and 3; this is the deep-dive.

### The four layers of Supabase config

| Layer | Location | What goes here | Lifetime |
|---|---|---|---|
| **1. Local CLI config** | `supabase/config.toml` in repo | Local Supabase boot settings: Studio port, auth flags, DB version, edge functions | Tracked in git |
| **2. Project config (cloud)** | Supabase dashboard → Project Settings + Authentication | Production auth providers, JWT secret, Site URL/redirect allowlists, SMTP, email templates | Cloud-side; per-project |
| **3. Database schema + RLS** | `supabase/migrations/*.sql` (directory will be created when first table is added) → applied via `npx supabase db push` | Tables, columns, indexes, **RLS policies (always required per CLAUDE.md)** | Tracked in git; applied to prod |
| **4. App-facing secrets** | `SUPABASE_URL` + `SUPABASE_KEY` (anon) | Set in Cloudflare runtime secrets + Workers Builds env vars | Cloudflare-side (covered in Phases 3 and 4) |

### anon vs service_role — never confuse them

Every Supabase project exposes **two API keys** in Project Settings → API. Mistaking them is the most common Supabase deployment foot-gun.

| Key | What it does | Where it goes in this app |
|---|---|---|
| **`anon` (public)** key | Bound by RLS policies; can only do what RLS permits. Safe to ship to the browser. | `SUPABASE_KEY` env var. **This is the one we use.** |
| **`service_role`** key | **Bypasses RLS entirely.** Full admin access to the DB. | **Nowhere in this app.** Only ever set from a server-only admin script after auditing every call site. If TablePlanner ever needs it, gate behind a separate secret name (`SUPABASE_SERVICE_ROLE_KEY`) and document the call sites in CLAUDE.md. |

**Cardinal rule**: if you ever pasted the wrong key into `SUPABASE_KEY` and pushed it through `wrangler secret put`, you've granted admin access to the whole worker. Rotate the leaked key in Supabase dashboard → Settings → API → "Reset" + re-run `wrangler secret put SUPABASE_KEY` with the correct `anon` key.

### What's in `supabase/config.toml` (annotated highlights)

The file is ~14 KB. These are the lines that matter for first deploy and won't bite later:

```toml
project_id = "10x-astro-starter"   # ← Phase 1 renames to "table-planner"

[db]
major_version = 17                 # Postgres major version — match production (Supabase free tier defaults to 17)

[auth]
site_url = "http://127.0.0.1:3000" # ⚠️ verify this matches the port `npm run dev` actually binds to (Astro default = 4321)
enable_signup = true               # Sign-ups via /auth/signup allowed
enable_anonymous_sign_ins = false  # Disabled — RLS depends on real users

[auth.email]
enable_confirmations = false       # ⚠️ deliberately OFF locally — mail lands in Inbucket (127.0.0.1:54324) and clicking the link every signup slows dev iteration. Production toggles this ON in dashboard (Phase 0.2) so real users must verify.
```

**Important local ≠ production intent**: the `enable_confirmations` split above is by design — do NOT flip it to `true` locally to "match prod" as a reflex. Local off = signup returns success immediately, user is signed in, no email is sent. If you specifically want to exercise the confirmation flow locally (before shipping a change that touches it), temporarily set `enable_confirmations = true` in `config.toml`, run `npx supabase stop && npx supabase start` to reload, do the test (emails land in Inbucket at `http://127.0.0.1:54324`), then revert.

The rest of the file (storage, edge functions, realtime, etc.) is local-dev tuning — leave as-is unless you adopt those features. **Production-side equivalents live in the dashboard**, not here.

### Free tier caveats (cheat-sheet)

| Limit | Value | Hits MVP? |
|---|---|---|
| DB size | 500 MB | No (TablePlanner schema is tiny) |
| Egress bandwidth | 5 GB/month | No |
| Storage | 1 GB | No (no file uploads in MVP) |
| Monthly active users | 50,000 | No |
| Email send rate (default SMTP) | **4 emails/hour** | **Potentially yes** during testing — add custom SMTP if needed |
| Inactivity pause | 7 days → project pauses | **Yes if you skip a week** — click any dashboard tab to reset; pause takes minutes to wake |
| Point-in-time recovery | 7 days | Acceptable for MVP |

### Migration workflow (for the day you add the first table)

Not used in first deploy — `supabase/migrations/` doesn't exist yet. Document the flow now so it's ready:

1. `npx supabase migration new <description>` — creates `supabase/migrations/<timestamp>_<description>.sql`
2. Write SQL. **Always**: `ALTER TABLE <foo> ENABLE ROW LEVEL SECURITY;` + per-operation policies (`SELECT`, `INSERT`, `UPDATE`, `DELETE` separately, per CLAUDE.md)
3. `npx supabase db reset` — applies all migrations to **local** DB (destructive — wipes local data; safe locally)
4. Verify in local Studio at http://127.0.0.1:54323
5. `npx supabase db push` — applies to **production**
   - Requires `npx supabase link --project-ref <ref>` (done in Phase 0.3)
   - Requires `npx supabase login` (done in Phase 0.3)
6. **Edge case**: `npx wrangler rollback` reverts the worker code but does **NOT** undo `npx supabase db push`. Schema-breaking migrations must be sequenced carefully (Phase 6 flags this — don't ship them in the week before known production use).

### Local vs production — what's different

The local Supabase from `npx supabase start` is **not the same project** as production:

| Thing | Local | Production |
|---|---|---|
| `SUPABASE_URL` | `http://127.0.0.1:54321` | `https://<ref>.supabase.co` |
| `SUPABASE_KEY` (anon) | Printed by `npx supabase start` | From dashboard → Settings → API |
| JWT secret | Printed by `npx supabase start` (default insecure value) | Auto-generated, in dashboard → Settings → API |
| Data | Empty (or whatever you seeded) | Real users |
| Migrations | Applied via `npx supabase db reset` | Applied via `npx supabase db push` |

For Phase 2's smoke test we use **production** values in `.dev.vars` to exercise the real auth flow on workerd. If you want true isolation, create a second Supabase project for staging — out of scope for first ship.

---

## Appendix C — Cloudflare configuration reference

What "configuring Cloudflare" means beyond the wrangler CLI (covered in Appendix A). Most Cloudflare-side setup is concentrated in Phases 0, 3, and 4 — this is the map of where things live and what each piece does.

### The three levels of Cloudflare config

| Level | Where | What | Phase touched |
|---|---|---|---|
| **1. Account level** | dash.cloudflare.com → Account Home | Subdomain choice, billing plan (free), members, API tokens | Phase 0 |
| **2. Worker level** | dash.cloudflare.com → Workers & Pages → `table-planner` | Runtime secrets, observability, custom domains, deployments, rollback | Phase 3 |
| **3. Build level** (Workers Builds) | Worker → Settings → Build | Git integration, build command, deploy command, branch, build-time env vars, preview deploys | Phase 4 |

### Workers free tier — what you get

The numbers that matter for first ship and for spotting limits before they bite:

| Resource | Free limit | Notes for MVP |
|---|---|---|
| Requests | **100,000 / day per account** (NOT per worker — Phase 6 flags this) | Plenty for MVP at `target_scale.users: small` |
| CPU time | **10 ms / request** | I/O-bound (Supabase HTTP) is fine; tight loops will trip it (Phase 3 edge case) |
| Bandwidth | **Unlimited** | The headline feature |
| Workers Builds minutes | **3,000 / month** | Way over MVP needs |
| Cold starts | **None** (workerd is always-on) | No first-request penalty |
| Custom domains | **Unlimited** on free tier | Use for `app.tableplanner.pl` later |
| Workers Secrets | **Unlimited** | Use for `SUPABASE_*` |

### `workers.dev` subdomain — one-time choice

Phase 0 picks `<your-name>.workers.dev`. Implications:

- Production URL: `https://table-planner.<your-name>.workers.dev`
- **Cannot be changed** without account recreation — Cloudflare treats it as an identity
- Preview deploys (Phase 4) use the same subdomain pattern
- **Pick something professional**: if you'll ever paste the URL into an email or wedding-prep doc, "agata-test.workers.dev" reads worse than "agata-apps.workers.dev" or just your name. Doesn't matter if you'll add a custom domain quickly.

### Dashboard navigation cheat-sheet

Where to find things when you're poking around live state:

| Looking for... | Path |
|---|---|
| Worker status / version list | Workers & Pages → `table-planner` → Deployments |
| Real-time logs (web equiv of `wrangler tail`) | Workers & Pages → `table-planner` → Logs |
| Request metrics (volume, errors, p50/p99) | Workers & Pages → `table-planner` → Metrics |
| **Runtime secrets** (e.g. `SUPABASE_KEY`) | Workers & Pages → `table-planner` → Settings → Variables → "Secret" |
| **Build-time env vars** (Workers Builds) | Workers & Pages → `table-planner` → Settings → Build → Variables |
| Git integration / branch config | Workers & Pages → `table-planner` → Settings → Build |
| Worker name / routes | Workers & Pages → `table-planner` → Settings → General |
| Account ID | Right sidebar of any Workers page (Phase 0.2 captures) |
| API Tokens (we do NOT create one) | My Profile (top right) → API Tokens |

### Account members (skip for solo MVP)

If you later add a collaborator: Account Home → Members → add by email; pick **Workers Admin** role for full deploy access, or **Worker Read** for view-only. Skipped for solo MVP.

### Custom domain — out of scope, sketched for the future

If you later move from `*.workers.dev` to e.g. `app.tableplanner.pl`:

1. Add zone to Cloudflare (DNS → Add a site → follow nameserver instructions at your registrar)
2. Worker → Settings → Triggers → Add Custom Domain
3. Update **Supabase Site URL + Redirect URLs** to the new domain (most common forgotten step)
4. Update Workers Builds build-time env vars if any reference the URL
5. Update CLAUDE.md `formatDate()` notes if timezone display depends on host

For first deploy, the `workers.dev` URL **is** the production URL.
