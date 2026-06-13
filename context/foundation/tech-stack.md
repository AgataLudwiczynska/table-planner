---
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
---

## Why this stack

Solo operator building a wedding seating validator in 3 weeks of after-hours work, with a hard deadline of 2026-07-05. Auth, persistence, and a deployable web app surface are all required from day one — the smallest viable plumbing has to be free, so the project's first week is spent on the domain (ring adjacency, conflict validation, drag-and-drop seat assignment), not on wiring login or a database. 10x-astro-starter clears all four agent-friendly gates and bundles Astro + React (drag-and-drop and the round-table SVG fit naturally as React islands) + TypeScript + Zod + Supabase (Postgres + email/password auth) + Cloudflare Pages deploy in one opinionated pin. The user chose this starter through an explicit four-way comparison (Next, T3, React Router being the alternatives) on the custom path, so the pick is informed rather than default-accepted. Bootstrapper confidence is first-class, meaning scaffolding will be mostly smooth with occasional manual steps. Self-check came back clean across all five points; the operator knows JS/React well enough to catch agent missteps in the unfamiliar Astro/Supabase corners.
