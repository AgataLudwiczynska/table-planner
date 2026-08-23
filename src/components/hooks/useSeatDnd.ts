import { useEffect, useRef, type RefObject } from "react";

// SSR-safe pragmatic-drag-and-drop binding: the element adapter touches window/document,
// so it is deferred-imported inside effects (never at module scope) and torn down via AbortController.

type CleanupFn = () => void;
type ElementAdapter = typeof import("@atlaskit/pragmatic-drag-and-drop/element/adapter");

// Awaits the adapter, then binds the element unless the effect was already cleaned up.
function bindWhenReady<T extends HTMLElement>(
  signal: AbortSignal,
  ref: RefObject<T | null>,
  bind: (adapter: ElementAdapter, element: T) => CleanupFn,
): void {
  void (async () => {
    const adapter = await import("@atlaskit/pragmatic-drag-and-drop/element/adapter");
    if (signal.aborted) return;
    const element = ref.current;
    if (!element) return;
    const cleanup = bind(adapter, element);
    signal.addEventListener("abort", cleanup, { once: true });
  })();
}

/** A guest chip (in the panel or seated) is draggable; its origin seat travels in the payload. */
export function useGuestDraggable<T extends HTMLElement>(
  ref: RefObject<T | null>,
  guestId: string,
  seatId: string | null,
): void {
  useEffect(() => {
    const controller = new AbortController();
    bindWhenReady(controller.signal, ref, ({ draggable }, element) =>
      draggable({ element, getInitialData: () => ({ type: "guest", guestId, seatId }) }),
    );
    return () => {
      controller.abort();
    };
  }, [ref, guestId, seatId]);
}

/**
 * A seat is a drop target. Live occupancy is read through a ref so the binding runs once at mount
 * instead of tearing down on every assignment change; `setIsOver` must be a stable state setter.
 */
export function useSeatDropTarget<T extends HTMLElement>(
  ref: RefObject<T | null>,
  seatId: string,
  occupiedRef: RefObject<boolean>,
  setIsOver: (over: boolean) => void,
): void {
  useEffect(() => {
    const controller = new AbortController();
    bindWhenReady(controller.signal, ref, ({ dropTargetForElements }, element) =>
      dropTargetForElements({
        element,
        getData: () => ({ seatId }),
        canDrop: ({ source }) => source.data.type === "guest" && !occupiedRef.current,
        onDragEnter: () => {
          setIsOver(true);
        },
        onDragLeave: () => {
          setIsOver(false);
        },
        onDrop: () => {
          setIsOver(false);
        },
      }),
    );
    return () => {
      controller.abort();
    };
  }, [ref, seatId, occupiedRef, setIsOver]);
}

/** The unassigned panel is a drop target: dropping a seated guest here unassigns them. */
export function usePanelDropTarget<T extends HTMLElement>(
  ref: RefObject<T | null>,
  setIsOver: (over: boolean) => void,
): void {
  useEffect(() => {
    const controller = new AbortController();
    bindWhenReady(controller.signal, ref, ({ dropTargetForElements }, element) =>
      dropTargetForElements({
        element,
        getData: () => ({ type: "panel" }),
        canDrop: ({ source }) => source.data.type === "guest",
        onDragEnter: () => {
          setIsOver(true);
        },
        onDragLeave: () => {
          setIsOver(false);
        },
        onDrop: () => {
          setIsOver(false);
        },
      }),
    );
    return () => {
      controller.abort();
    };
  }, [ref, setIsOver]);
}

/** Where a drop landed: on a seat (`seatId`), on the panel (`toPanel`), or neither. */
export interface DropCommit {
  guestId: string;
  seatId: string | null;
  toPanel: boolean;
}

/**
 * The single monitor that commits every drop. It reads guest/seat ids from the event only; the
 * commit handler is held in a ref so the monitor binds once yet always calls the latest closure.
 */
export function useSeatMonitor(onDrop: (commit: DropCommit) => void): void {
  const handlerRef = useRef(onDrop);
  useEffect(() => {
    handlerRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const { monitorForElements } = await import("@atlaskit/pragmatic-drag-and-drop/element/adapter");
      if (controller.signal.aborted) return;
      const cleanup = monitorForElements({
        canMonitor: ({ source }) => source.data.type === "guest",
        onDrop({ source, location }) {
          // Dropped outside any target → no-op. Length guard (not `[0]`) because the
          // library types the index as always-defined even though the array can be empty.
          if (location.current.dropTargets.length === 0) return;
          const destination = location.current.dropTargets[0];
          const guestId = source.data.guestId;
          if (typeof guestId !== "string") return;
          const rawSeatId = destination.data.seatId;
          const seatId = typeof rawSeatId === "string" ? rawSeatId : null;
          const toPanel = destination.data.type === "panel";
          handlerRef.current({ guestId, seatId, toPanel });
        },
      });
      controller.signal.addEventListener("abort", cleanup, { once: true });
    })();
    return () => {
      controller.abort();
    };
  }, []);
}
