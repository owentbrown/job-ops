import { useCallback, useEffect, useRef } from "react";

/** Distance (px) from a scroll edge where dragging starts to scroll. */
export const DRAG_AUTO_SCROLL_EDGE = 80;
/** Maximum scroll step (px) per animation frame. */
export const DRAG_AUTO_SCROLL_MAX_STEP = 20;

/**
 * Scroll step for a pointer at `y` inside a scroll area spanning
 * `top`..`bottom`. Negative scrolls up, positive scrolls down, 0 stays put.
 * The step grows the closer the pointer gets to (or past) an edge.
 */
export function getDragAutoScrollStep(
  y: number,
  top: number,
  bottom: number,
  edge = DRAG_AUTO_SCROLL_EDGE,
  maxStep = DRAG_AUTO_SCROLL_MAX_STEP,
): number {
  const height = bottom - top;
  if (height <= 0) return 0;
  // Keep the two edge zones from overlapping in short containers.
  const zone = Math.min(edge, height / 3);
  if (zone <= 0) return 0;

  if (y < top + zone) {
    const depth = Math.min(1, (top + zone - y) / zone);
    return -Math.ceil(depth * maxStep);
  }
  if (y > bottom - zone) {
    const depth = Math.min(1, (y - (bottom - zone)) / zone);
    return Math.ceil(depth * maxStep);
  }
  return 0;
}

function isScrollable(element: HTMLElement): boolean {
  const { overflowY } = window.getComputedStyle(element);
  return (
    (overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay") &&
    element.scrollHeight > element.clientHeight
  );
}

/** Nearest scrollable ancestor, or null to scroll the window. */
export function findScrollParent(
  start: HTMLElement | null,
): HTMLElement | null {
  let current = start?.parentElement ?? null;
  while (current && current !== document.body) {
    if (isScrollable(current)) return current;
    current = current.parentElement;
  }
  return null;
}

/**
 * Scrolls the nearest scroll container while an HTML5 drag is in progress and
 * the pointer is held near its top or bottom edge. Browsers only auto-scroll
 * at the window edge (and inconsistently), so long in-panel lists otherwise
 * can't be reordered past what's on screen.
 *
 * Call `start(element)` from the drag source's `onDragStart` and `stop()` when
 * the drag ends. The hook cleans up on unmount.
 */
export function useDragAutoScroll() {
  const containerRef = useRef<HTMLElement | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const handleDragOver = useCallback((event: DragEvent) => {
    pointerYRef.current = event.clientY;
  }, []);

  const tick = useCallback(() => {
    if (!activeRef.current) return;
    const y = pointerYRef.current;
    if (y != null) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const step = getDragAutoScrollStep(y, rect.top, rect.bottom);
        if (step !== 0) container.scrollTop += step;
      } else {
        const step = getDragAutoScrollStep(y, 0, window.innerHeight);
        if (step !== 0) window.scrollBy(0, step);
      }
    }
    frameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    pointerYRef.current = null;
    containerRef.current = null;
    document.removeEventListener("dragover", handleDragOver, true);
    document.removeEventListener("drop", stop, true);
    document.removeEventListener("dragend", stop, true);
    if (frameRef.current != null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, [handleDragOver]);

  const start = useCallback(
    (element: HTMLElement | null) => {
      stop();
      if (typeof window === "undefined") return;
      activeRef.current = true;
      containerRef.current = findScrollParent(element);
      document.addEventListener("dragover", handleDragOver, true);
      document.addEventListener("drop", stop, true);
      document.addEventListener("dragend", stop, true);
      frameRef.current = window.requestAnimationFrame(tick);
    },
    [handleDragOver, stop, tick],
  );

  useEffect(() => stop, [stop]);

  return { start, stop };
}
