# TablePlanner

![TablePlanner — lay out tables and keep clashing guests apart](./public/table-planner-banner.png)

Plan wedding seating for round tables and catch "do-not-seat-together" clashes the moment they happen — a seat-adjacency validator for the person organising the wedding.

🔗 **Live demo: [Check now](https://table-planner.ludwiczynska-a.workers.dev/)** 🔗

_Built during the [10xDevs](https://www.10xdevs.pl/) course._

## About

Couples planning a 100–150-guest wedding don't just decide *which table* someone sits at — they decide *who sits next to whom*. Feuding relatives, divorced parents, and the ring geometry of a round table (seat N borders N−1 and N+1) turn this into a puzzle that spreadsheets and paper can't check: a conflict only shows up once people are already seated.

TablePlanner is **not** a floor planner that arranges furniture in a room. It models the one thing those tools ignore — the adjacency relationship between seats — and validates it in real time. Assign a guest, and if two people you marked as "nie obok siebie" (not next to each other) end up adjacent, both seats turn red instantly, with no "Validate" button. It stays deliberately narrow — [Scope](#scope--deliberate-non-goals) lists what it leaves out and why.

## Tech stack

- **Astro 6 (server-side rendering)** — every page is server-rendered; React is used only where interaction demands it. Fast static shell, islands where it counts.
- **React 19 islands** — the drag-and-drop board and the SVG round-table ring are interactive islands. React Compiler is on and enforced by lint.
- **TypeScript (strict)** — `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`; the type check is a build gate, not a suggestion.
- **Supabase (Postgres + Auth + RLS)** — email/password auth and persistence. Every table has granular per-operation Row-Level Security so one account can never read or touch another's wedding.
- **Zod** — all API route input is validated at the boundary before it reaches the database.
- **Tailwind CSS 4 + shadcn/ui** — utility-first styling with a small set of accessible primitives.
- **Pragmatic drag-and-drop** (`@atlaskit/pragmatic-drag-and-drop`) — the seat-assignment interaction, with a click-based fallback for touch devices.
- **Cloudflare Workers** — SSR runs on the `workerd` edge runtime via `@astrojs/cloudflare`; deploys on push to `main`.

## Features

- **Round tables with auto-generated seats** — add a table with a name and seat count; seats 1..N are created for you.
- **Guests & conflicts** — add/edit/delete guests (name, optional side and group) and define binary "not next to each other" conflicts between pairs.
- **Two ways to assign a seat** — drag a guest from the always-visible unassigned panel onto a seat, or click the guest then click the seat.
- **Real-time adjacency validation** — round-table adjacency is computed as a ring (N borders N−1 and N+1, modulo seat count); violations flag *only* direct neighbours, immediately after every change. Guardrail: false negatives = 0.
- **Graphical ring summary** — each table is drawn as a numbered circle with the seated guest at each place, so the geometry that drives adjacency is visible.
- **Table resize with safe auto-unassign** — shrinking a table below its assigned count prompts *"Zmniejszenie zwolni miejsca dla N gości — kontynuować?"* and, on confirm, atomically resizes and returns the displaced guests to the unassigned list.
- **Progress counter & durable state** — a persistent *"N / M gości przypisanych"* counter; log out and back in and the plan — seats, conflicts, tables — is exactly as you left it.

> The UI is in Polish; the persona is Polish weddings, and internationalisation is an explicit non-goal.

## Running locally

**Prerequisites:** Node (version pinned in [`.nvmrc`](./.nvmrc)), npm, and [Docker](https://www.docker.com/) (for the local Supabase stack, ~7 GB RAM).

```bash
# 1. Clone and install
git clone git@github.com:AgataLudwiczynska/table-planner.git
cd table-planner
npm install

# 2. Start local Supabase (downloads images on first run; applies the migrations in supabase/migrations)
npx supabase start

# 3. Set env vars — copy the SUPABASE_URL and anon SUPABASE_KEY the CLI prints
cp .env.example .env        # used by `npm run dev` (Node)
cp .env.example .dev.vars   # used by `npm run preview` (Cloudflare workerd)
# then paste SUPABASE_URL / SUPABASE_KEY into both files

# 4. Run
npm run dev        # Astro dev server (Node runtime — Cloudflare bindings inactive)
npm run preview    # production build on the real workerd runtime (run `npm run build` first)
```

`npm run dev` is fastest for UI work; use `npm run preview` to exercise the actual Cloudflare runtime before pushing. Deeper conventions (auth flow, migrations, deploy) live in [`CLAUDE.md`](./CLAUDE.md).

## Testing & quality

The core guardrail is deterministic, so it's tested where the signal is cheapest — as a unit, not a browser click-through — and layered from there:

- **Unit** — pure ring-adjacency / progress logic (`src/**/*.test.ts`), run with [Vitest](https://vitest.dev/).
- **Integration — database** (`test/integration/db/**`) — RLS / IDOR and DB-constraint checks straight against local Postgres, proving one account can't reach another's wedding.
- **Integration — HTTP contract** (`test/integration/http/**`) — API validation, error-body shape, and IDOR through the preview server.
- **Lint as a build gate** — ESLint with `strictTypeChecked` + `stylisticTypeChecked`; the React Compiler rule is an **error**, so a Rules-of-React violation fails the build.
- **Pre-commit hooks** — husky + lint-staged auto-fix and format staged files.

```bash
npm run test:run              # unit tests, single pass
npm run test:integration:db   # DB integration (needs `npx supabase start`)
npm run test:integration      # full lane (also needs `npm run build && npm run preview`)
npm run lint                  # type-checked ESLint
```

The full test strategy — risk map, two-user seed, oracle discipline — is documented in `context/foundation/test-plan.md`.

## Scope / deliberate non-goals

Every line below was a conscious cut, not an unfinished task. A validator earns its keep by doing one thing precisely, so the MVP keeps a sharp boundary on purpose — each exclusion buys focus somewhere that matters:

| Not built | Why |
| --- | --- |
| Auto-seating / suggestion algorithm | The operator stays in control; no black box proposing "wrong" neighbours. |
| Room / furniture floor plan | TablePlanner validates adjacency, not spatial layout — a different category of tool. |
| Rectangular / long tables | Ring geometry is far simpler than two rows facing each other; round only. |
| PDF export, CSV guest import | Separate modules; browser summary and manual entry for the MVP. |
| Collaboration, viewers, invites | Solo — one owner per wedding, no permission layer. |
| Password reset, social login | Email/password only in v1; losing the password means losing access (flagged in the UI). |
| Offline mode, mobile-first, i18n | Desktop/tablet, online, Polish-only by design. |

## License

MIT
