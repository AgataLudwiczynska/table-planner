# @atlaskit/pragmatic-drag-and-drop — API reference for S-03

> Companion to `dnd-review-session.md` (which picked the library).
> Purpose: the concrete API surface + imports needed to implement seat-assignment DnD.
> Source: Context7 (`/atlassian/pragmatic-drag-and-drop`, official docs), fetched 2026-08-22.
> All snippets use the **element adapter** — we drag DOM elements onto DOM drop targets (chessboard-style), not files/text.

## Install

```
npm install @atlaskit/pragmatic-drag-and-drop
```

Not yet in `package.json`. Verify peerDeps resolve cleanly against React 19 without `--legacy-peer-deps` (see the open follow-up in `dnd-review-session.md`).

## Subpath imports

The package is split into small subpaths — you import each function from its own path, not from the package root. This keeps the bundle lean (`main_goal: speed`).

```ts
// Core: make draggable, define drop targets, observe drags globally
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

// Merge multiple cleanup fns (e.g. an element that is BOTH draggable and a drop target)
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';

// Optional: custom drag preview instead of a screenshot of the source element
import { setCustomNativeDragPreview }
  from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { pointerOutsideOfPreview }
  from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { preserveOffsetOnSource }
  from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source';
```

## Mapping to S-03 scope

| S-03 requirement | Library piece |
|---|---|
| Guest chips in the unassigned panel are draggable | `draggable` + `getInitialData({ guestId })` |
| Seats accept a guest (SVG circle or flat list) | `dropTargetForElements` + `getData({ seatId })` |
| Invariant: max 1 guest / seat (UI layer) | `canDrop` returning `false` for occupied seats |
| Commit assignment + trigger re-validation | single `monitorForElements` → `onDrop` |
| Release a guest back to the panel | assigned guests also draggable; panel is a drop target, or empty `dropTargets` = detach |
| Per-seat drag-over feedback | `onDragEnter` / `onDragLeave` / `onDrop` local state |

Owned by us, **not** covered by the library:
- **Click fallback** (click guest → click seat) — plain React `onClick`; call the same "assign guest to seat" function the monitor uses.
- **Adjacency conflict validation + red highlight** — our ring geometry (N adjacent to N−1 / N+1 mod seat_count), run after the monitor commits. The library only moves the guest; it has no opinion on conflicts.

## 1. Guest card → `draggable`

Attach in `useEffect`; the returned cleanup unbinds it. `getInitialData` is the payload that later appears as `source.data`.

```tsx
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

useEffect(() => {
  const el = ref.current;
  invariant(el);
  return draggable({
    element: el,
    getInitialData: () => ({ type: 'guest', guestId }),
  });
}, [guestId]);
```

An already-assigned guest is also draggable (reassign / release path) — include its current `seatId` in the data so the monitor knows the origin.

## 2. Seat → `dropTargetForElements`

Each numbered seat is a drop target. Enforce the max-1-guest-per-seat invariant at the UI layer via `canDrop`, and drive hover styling here.

```tsx
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

return dropTargetForElements({
  element: el,
  getData: () => ({ seatId }),
  canDrop: ({ source }) =>
    source.data.type === 'guest' && !seatIsOccupied,   // block occupied seats
  onDragEnter: () => setIsOver(true),
  onDragLeave: () => setIsOver(false),
  onDrop: () => setIsOver(false),
});
```

- `canDrop` runs repeatedly during a drag. Returning `false` makes the search continue upward for another valid target — an occupied seat simply won't accept the drop.
- Feedback args carry `source` (guest payload), `element` (this seat's DOM node), `input` (pointer coords + keyboard state).
- `source.data` is typed `Record<string, unknown>` — narrow before use (`typeof guestId === 'string'`).

Base payload shapes:

```ts
type ElementEventBasePayload = {
  location: DragLocationHistory;
  source: ElementDragPayload;
};
type ElementDragPayload = {
  element: HTMLElement;
  dragHandle: Element | null;
  data: Record<string, unknown>;
};
```

## 3. One central `monitorForElements` — commit the assignment

The idiomatic pattern (from the official chessboard tutorial, structurally identical to seat assignment): a **single monitor** owns the state update. This is the one place to POST `/assignments` and then run incremental conflict re-validation.

```tsx
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

useEffect(() => {
  return monitorForElements({
    canMonitor: ({ source }) => source.data.type === 'guest',
    onDrop({ source, location }) {
      const destination = location.current.dropTargets[0];
      if (!destination) return;                 // dropped outside any seat → no-op

      const seatId = destination.data.seatId;
      const guestId = source.data.guestId;
      // narrow both, then: assign guest → seat, unassign from previous seat if any
    },
  });
}, [/* state deps */]);
```

- `location.current.dropTargets[0]` is the innermost/topmost target under the pointer at release — that's the seat.
- Empty `dropTargets` = dropped outside → treat as no-op (guest stays put).
- `canMonitor` / `canDrop` are how you isolate experiences (only react to `type === 'guest'`).

## 4. Custom drag preview (optional polish)

Render a clean "First Last" ghost instead of a screenshot of the chip.

```tsx
import { setCustomNativeDragPreview }
  from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { pointerOutsideOfPreview }
  from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';

draggable({
  element: el,
  getInitialData: () => ({ type: 'guest', guestId }),
  onGenerateDragPreview: ({ nativeSetDragImage }) => {
    setCustomNativeDragPreview({
      getOffset: pointerOutsideOfPreview({ x: '8px', y: '8px' }),
      render({ container }) {
        // render a small "First Last" chip into container; return a cleanup fn
      },
      nativeSetDragImage,
    });
  },
});
```

Offset helpers: `pointerOutsideOfPreview({ x, y })` (CSS values), `preserveOffsetOnSource({ element, input })` (keep the grab point), or a custom `getOffset: () => ({ x, y })`.

## `combine` — one cleanup for draggable + drop target

An element that is both draggable and a drop target (e.g. an assigned guest sitting in a seat) merges its cleanups:

```tsx
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';

useEffect(() => {
  const el = ref.current;
  invariant(el);
  return combine(
    draggable({ element: el, getInitialData: () => ({ type: 'guest', guestId }) }),
    dropTargetForElements({ element: el, canDrop: ({ source }) => source.data.type === 'guest' }),
  );
}, [guestId]);
```

## Key references

- Element adapter (draggable / drop targets / monitors): https://atlassian.design/components/pragmatic-drag-and-drop/core-package/adapters/element/about
- Drop targets (`canDrop`, nested targets): https://atlassian.design/components/pragmatic-drag-and-drop/core-package/drop-targets
- Chessboard tutorial (closest analogue to seat assignment): https://atlassian.design/components/pragmatic-drag-and-drop/tutorial
- Drag previews: https://atlassian.design/components/pragmatic-drag-and-drop/core-package/adapters/element/drag-previews

## Compatibility verdict (added 2026-08-22 by `/10x-research`)

> Full findings: `research.md`. Verified against live Context7 docs (`/atlassian/pragmatic-drag-and-drop`).

**Verdict: compatible with our stack (React 19 + Astro 6 islands + Cloudflare Workers SSR)** — with one implementation rule.

### The three compatibility facts (verified)

1. **React 19 peerDep — non-issue (the open follow-up above is resolved).** The **core** package (`@atlaskit/pragmatic-drag-and-drop`, the `/element/adapter` these snippets use) is framework-agnostic and declares **no React peer dependency at all**, so React 19 never enters its resolution — it installs cleanly without `--legacy-peer-deps`. The *optional* companion packages (`react-drop-indicator`, `react-accessibility`) do declare a React peer and **already include React 19 in their supported range** (documented as supported-but-not-directly-tested; raise a GitHub issue if problems appear). The only package that rejects React 19 is `react-beautiful-dnd-migration` — **which we do not use**.

2. **SSR safety — safe, with a rule.** Astro renders `client:load` islands on the Cloudflare server first. The adapter must therefore never execute during SSR. It won't, because we bind it inside `useEffect` (never runs on the server) — but to be airtight, **prefer Atlassian's deferred-loading recipe**: dynamically `import()` the adapter *inside* the effect, guarded by an `AbortController`, rather than the top-level imports shown in §1–§4 below. This guarantees the server pass never touches `window`/`document`.

   ```tsx
   useEffect(() => {
     const controller = new AbortController();
     (async () => {
       const { draggable, dropTargetForElements } =
         await import('@atlaskit/pragmatic-drag-and-drop/element/adapter');
       if (controller.signal.aborted) return;
       const el = ref.current;
       if (!el) return;
       const cleanup = draggable({ element: el, getInitialData: () => ({ type: 'guest', guestId }) });
       controller.signal.addEventListener('abort', cleanup, { once: true });
     })();
     return () => controller.abort();
   }, [guestId]);
   ```

   (The static-import snippets in §1–§4 remain valid API references; swap them to this dynamic-import shape at implementation time. A plain top-level import *may* also be SSR-safe, but the deferred recipe is the documented, guaranteed-safe path and bundle-splits the DnD code as a bonus.)

3. **API surface matches.** `draggable`, `dropTargetForElements`, `monitorForElements`, `combine`, `getInitialData`, `canDrop`, `getData` are all current — the surface documented above is accurate.

### Fit with our codebase (grounded in `research.md`)

- **Mounting:** add an assignment board as a **new tab inside `WeddingWorkspace.tsx`** (already a single `client:load` island holding `tables`/`guests`/`conflicts` in state) — the board re-validates against live in-memory data with zero extra fetches. Use `client:load` (repo convention); `client:only` is unused and unnecessary.
- **ESLint:** `react-hooks` recommended + `react-compiler: "error"` **do not block** the `useRef` + `useEffect(cleanup)` pattern — they forbid conditional hooks / prop mutation / impure render. Give effects correct deps (`exhaustive-deps`). These would be the first effect/ref in `src/components`.
- **Not covered by the library (ours to build):** the click fallback (plain `onClick` calling the same assign function the monitor uses), the adjacency ring validation (greenfield pure fn → `src/lib/adjacency.ts`), and the `assignments` table + service + `/api/assignments` endpoint (persistence does not exist yet).
