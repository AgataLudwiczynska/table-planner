# Drag-and-drop library review — S-03

> Research session for `assignment-with-realtime-conflict-validation` (north star).
> Goal: pick a drag-and-drop library for the seat-assignment interaction, compatible with the tech stack.
> Date: 2026-08-22. Source: web search (Exa).

## Context

- **Stack:** Astro 6 + React 19 islands + Tailwind 4 + shadcn/ui, SSR on Cloudflare Workers.
- **Interaction (S-03):** assign a guest chip onto a **specific, discrete seat** in an SVG ring, plus a **click fallback** (click guest → click seat). This is a discrete drop-target interaction (chessboard-style), **not** list sorting/reordering. Drag between two assigned seats is an explicit Non-Goal.

## Candidates & React 19 status

| Library | React 19 | Size (core) | Model | Verdict for S-03 |
|---|---|---|---|---|
| **@atlaskit/pragmatic-drag-and-drop** | Core is framework-agnostic (no React dep); some optional React packages now allow `react@^19` in peerDeps | ~4.7 kB | Headless, native HTML5 DnD, "drop targets + monitors" | **Recommended** |
| **@dnd-kit** (new `@dnd-kit/react`) | Yes, but **experimental / pre-1.0** — breaking changes possible before 1.0 | ~6 kB | Headless, React hooks/contexts | Alternative |
| **@dnd-kit/core** (legacy v6.3.1) | peerDep added Jan 2025, but reported `JSX.Element` TS errors with React 19; main branch stalled | ~27 kB w/ sortable | React-only | Avoid (dead branch) |
| react-beautiful-dnd | No — deprecated by Atlassian | 30 kB | — | No |
| hello-pangea/dnd | No — blocked on React 18 peerDep | — | — | No |
| SortableJS / react-dnd | No / too low-level or too complex | — | — | No |

## Recommendation: `@atlaskit/pragmatic-drag-and-drop` (core)

Reasons, tied to S-03:

1. **Matches the interaction exactly.** The official tutorial is a **chessboard**: discrete squares as drop targets + a `canMove(start, destination, …)` guard. Maps ~1:1 to "drop guest on seat N, enforce invariant (max 1 guest/seat), compute adjacency conflict". Sortable lists (dnd-kit's strength) are not needed here.
2. **Framework-agnostic core = clean React island.** The core has no React dependency, so it fits Astro islands without heavy Context Providers wrapping the tree. `draggable()` / `dropTargetForElements()` / `monitorForElements()` run inside `useEffect`; works well with Cloudflare SSR (DnD is client-only anyway).
3. **Native HTML5 DnD + SVG.** Drop targets attach to any element's `ref` (including SVG `<g>`/`<circle>`); the monitor exposes `source.data` / `destination.data` for incremental conflict recalculation. Data typed via `getInitialData`.
4. **Official React + TailwindCSS example** exists (maintainer-authored, StackBlitz). Headless → no Tailwind-v4 cascade-layer friction (dnd-kit's changelog notes a specific Tailwind v4 cascade-layer fix, i.e. real friction on their side).
5. **Size** ~4.7 kB fits `main_goal: speed` and a lean island.

## Caveats

- **A11y and animations are DIY.** Highlight, drop indicator, keyboard support are manual. Optional packages `-react-accessibility` and `-react-drop-indicator` now allow `react@^19`, but Atlassian does **not** officially test them against React 19 ("small risk"). Acceptable here: roadmap scopes desktop/tablet only, and the **click fallback** is plain React `onClick`, independent of the DnD library — not a feature of any of these packages.
- **Do NOT use `@atlaskit/pragmatic-drag-and-drop-react-beautiful-dnd-migration`** — the only package still lacking React 19 support. Not needed (we are not migrating from rbd).
- The tutorial uses `@emotion/react` for styling — **example only**; replace with Tailwind. The core does not require emotion.

## When dnd-kit would win instead

If S-04/S-05 or v2 introduced real **list reordering** with a ready-made `sortable` preset and built-in keyboard support, the new `@dnd-kit/react` would be cheaper. But it is pre-1.0 today (breaking-change risk), and the north star is discrete seats, not lists. Under the 2026-09-10 deadline, pragmatic is the more stable pick.

## Open follow-up (before locking into the S-03 plan)

- Verify current npm peerDeps install cleanly against the repo's React 19 (`package.json`) — core + optionally `-react-drop-indicator` / `-react-accessibility` — before wiring into the plan.
- Watch specifically for a transitive `@atlaskit/tokens` dependency (pulled in by `-react-drop-indicator`), which was reported as `unmet peer react@^18.2.0: found 19.x` — the most concrete React 19 friction signal found; confirm it resolves without `--legacy-peer-deps`.

## Key references

- Pragmatic DnD docs: https://atlassian.design/components/pragmatic-drag-and-drop/
- Pragmatic DnD GitHub: https://github.com/atlassian/pragmatic-drag-and-drop
- Pragmatic DnD React 19 tracking issue: https://github.com/atlassian/pragmatic-drag-and-drop/issues/181
- React + Tailwind examples: https://atlassian.design/components/pragmatic-drag-and-drop/examples
- dnd-kit React 19 issue (closed, "rewritten"): https://github.com/clauderic/dnd-kit/issues/1511
- dnd-kit maintenance/roadmap (experimental branch): https://github.com/clauderic/dnd-kit/issues/1830, https://github.com/clauderic/dnd-kit/discussions/1842
- Comparison writeup (2026): https://www.pkgpulse.com/guides/dnd-kit-vs-react-beautiful-dnd-vs-pragmatic-drag-drop-2026
