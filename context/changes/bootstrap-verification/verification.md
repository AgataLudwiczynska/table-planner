---
bootstrapped_at: 2026-06-06T13:15:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: table-planner
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim from `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: table-planner
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

Solo operator building a wedding seating validator in 3 weeks of after-hours work, with a hard deadline of 2026-07-05. Auth, persistence, and a deployable web app surface are all required from day one — the smallest viable plumbing has to be free, so the project's first week is spent on the domain (ring adjacency, conflict validation, drag-and-drop seat assignment), not on wiring login or a database. 10x-astro-starter clears all four agent-friendly gates and bundles Astro + React (drag-and-drop and the round-table SVG fit naturally as React islands) + TypeScript + Zod + Supabase (Postgres + email/password auth) + Cloudflare Pages deploy in one opinionated pin. The user chose this starter through an explicit four-way comparison (Next, T3, React Router being the alternatives) on the custom path, so the pick is informed rather than default-accepted. Bootstrapper confidence is first-class, meaning scaffolding will be mostly smooth with occasional manual steps. Self-check came back clean across all five points; the operator knows JS/React well enough to catch agent missteps in the unfamiliar Astro/Supabase corners.

## Pre-scaffold verification

| Signal             | Value                                                                   | Severity | Notes                                                                                       |
| ------------------ | ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| npm package        | not run                                                                 | n/a      | cmd_template starts with `git clone` — no npm-published package to query                    |
| GitHub repo        | not run                                                                 | n/a      | `gh` CLI not installed locally; WARN-AND-CONTINUE per pre-scaffold-verification.md          |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone the starter repo without keeping its git history)
**Exit code**: 0
**Files moved**: 19 (top-level files and directories from `.bootstrap-scaffold/`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**.gitignore handling**: append-merged — cwd's 6 lines preserved, scaffold's 18 lines de-duped and appended with `# from 10x-astro-starter` separator
**.bootstrap-scaffold cleanup**: deleted

### Files moved

- `.env.example`
- `.github/` (incl. workflows + 10xDevs structure)
- `.husky/`
- `.nvmrc`
- `.prettierrc.json`
- `.vscode/`
- `README.md`
- `astro.config.mjs`
- `components.json`
- `eslint.config.js`
- `node_modules/` (773 packages, 895 deps total)
- `package-lock.json`
- `package.json`
- `public/`
- `src/`
- `supabase/`
- `tsconfig.json`
- `wrangler.jsonc`

### Files dropped

- `.bootstrap-scaffold/.git/` — deleted before move-up per git-clone strategy (upstream history does not leak into the user's repo)

### Files preserved (no scaffold conflict)

- `.claude/` — pre-existing local toolkit config; scaffold did not ship one
- `context/` — bootstrap chain source of truth; never overwritten
- `idea-notes.md` — pre-existing; no scaffold equivalent

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 (direct: `@astrojs/check` moderate, `wrangler` moderate; remaining 8 are transitive)

#### CRITICAL findings

none.

#### HIGH findings

- **devalue** 5.6.3 – 5.8.0 (transitive)
  - Advisory: GHSA-77vg-94rm-hx3p — Svelte devalue: DoS via sparse array deserialization
  - CWE-770, CVSS 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)
  - Pulled in via Cloudflare/Vite plugin chain
  - Fix available: yes — addressed by upgrading `@cloudflare/vite-plugin` / `wrangler` / `miniflare`

#### MODERATE findings (log only)

- `@astrojs/check` (direct, >=0.9.3) — via `@astrojs/language-server`; fix is a SemVer-major downgrade to 0.9.2
- `@astrojs/language-server` (transitive) — via `volar-service-yaml`
- `@cloudflare/vite-plugin` (transitive) — via `miniflare`, `wrangler`, `ws`
- `miniflare` (transitive) — via `ws`
- `volar-service-yaml` (transitive) — via `yaml-language-server`
- `wrangler` (direct) — via `miniflare`
- `ws` (transitive) — GHSA-58qx-3vcg-4xpx (CVSS 4.4) — uninitialized memory disclosure; affects supabase realtime-js and main ws tree
- `yaml` (transitive) — GHSA-48c2-rrv3-qjmp (CVSS 4.3) — stack overflow via deeply nested YAML; in `yaml-language-server`
- `yaml-language-server` (transitive) — via `yaml`

#### LOW / INFO findings

none.

### Audit notes

- `npm audit` exited with code 1 because vulnerabilities exist; bootstrapper does not treat that as a failure (post-scaffold-verification.md § failure mode).
- `npm audit fix` is offered by the tool but bootstrapper does NOT run it automatically. The user decides whether to patch, ignore, or defer.

## Hints recorded but not acted on

| Hint                            | Value                |
| ------------------------------- | -------------------- |
| bootstrapper_confidence         | first-class          |
| quality_override                | false                |
| path_taken                      | custom               |
| self_check_answers.typed        | true                 |
| self_check_answers.from_official_starter | true        |
| self_check_answers.conventions  | true                 |
| self_check_answers.docs_current | true                 |
| self_check_answers.can_judge_agent | true              |
| team_size                       | solo                 |
| deployment_target               | cloudflare-pages     |
| ci_provider                     | github-actions       |
| ci_default_flow                 | auto-deploy-on-merge |
| has_auth                        | true                 |
| has_payments                    | false                |
| has_realtime                    | false                |
| has_ai                          | false                |
| has_background_jobs             | false                |

These hints are preserved for the future M1L4 ("Memory Architecture") skill to act on (e.g., wiring `CLAUDE.md` / `AGENTS.md` around the auth + Cloudflare + GitHub Actions context). Bootstrapper v1 surfaces them but does not compensate.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` against the existing `CLAUDE.md` — the starter ships its own agent instructions, which the conflict policy sidelined so your repo-level CLAUDE.md (the 10xDevs lesson notes) is preserved. Decide whether to merge sections, replace, or keep them separate.
- Copy `.env.example` to `.env` (Node local dev) or `.dev.vars` (Cloudflare local dev) and fill in `SUPABASE_URL` / `SUPABASE_KEY`.
- Address the audit findings per project risk tolerance — the HIGH `devalue` advisory and the transitive `ws` / `yaml` issues are all fix-available via `npm audit fix`, though some upgrades are SemVer-major.
- Start local Supabase if you need it: `npx supabase start` (Docker required).
- Run the dev server: `npm run dev`.
