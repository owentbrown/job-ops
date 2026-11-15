import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface JobListSwiperItem {
  id: string;
  label: string;
  count?: number;
}

interface JobListSwiperProps {
  items: JobListSwiperItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

const SLOT_SHARE = 0.42;
const ANIMATION_MS = 240;
const EASING = "cubic-bezier(.2,.8,.2,1)";

const mod = (value: number, size: number) => ((value % size) + size) % size;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Phone tab bar for the job lists: shows the current list in the middle with
 * its neighbours fading in at the edges. Swipe or tap a neighbour to move;
 * it wraps around, so every list is at most two swipes away.
 */
export const JobListSwiper: React.FC<JobListSwiperProps> = ({
  items,
  activeId,
  onSelect,
  className,
}) => {
  const size = items.length;
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );
  const [index, setIndex] = useState(activeIndex);
  const [slot, setSlot] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const animating = useRef(false);

  useEffect(() => {
    if (!animating.current) setIndex(activeIndex);
  }, [activeIndex]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setSlot(Math.round(root.clientWidth * SLOT_SHARE));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const place = useCallback(
    (offset: number, animate: boolean) => {
      const track = trackRef.current;
      if (!track) return;
      track.style.transition =
        animate && !prefersReducedMotion()
          ? `transform ${ANIMATION_MS}ms ${EASING}`
          : "none";
      track.style.transform = `translateX(${-slot * 2.5 + offset}px)`;
    },
    [slot],
  );

  // Re-centre (without animation) whenever the shown list or width changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: index re-centres the track after a move
  useLayoutEffect(() => {
    place(0, false);
  }, [place, index]);

  const go = useCallback(
    (direction: number) => {
      if (animating.current || direction === 0 || size < 2) return;
      animating.current = true;
      place(-direction * slot, true);
      const next = mod(index + direction, size);
      window.setTimeout(
        () => {
          animating.current = false;
          setIndex(next);
          onSelect(items[next].id);
        },
        prefersReducedMotion() ? 0 : ANIMATION_MS,
      );
    },
    [index, items, onSelect, place, size, slot],
  );

  // Drag: follow the finger, then move one list if it went far enough.
  const drag = useRef<{ x: number; dx: number; id: number } | null>(null);
  const onPointerDown = (event: React.PointerEvent) => {
    if (animating.current || event.button > 0) return;
    drag.current = { x: event.clientX, dx: 0, id: event.pointerId };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    state.dx = event.clientX - state.x;
    if (Math.abs(state.dx) > 6) {
      try {
        rootRef.current?.setPointerCapture(event.pointerId);
      } catch {}
      place(state.dx, false);
    }
  };
  const onPointerEnd = () => {
    const state = drag.current;
    drag.current = null;
    if (!state || Math.abs(state.dx) <= 6) return;
    const threshold = slot * 0.22;
    if (state.dx < -threshold) go(1);
    else if (state.dx > threshold) go(-1);
    else place(0, true);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  };

  const shown = [-2, -1, 0, 1, 2].map((offset) => ({
    offset,
    item: items[mod(index + offset, size)],
  }));

  return (
    <div
      ref={rootRef}
      role="tablist"
      aria-label="Job lists"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className={cn(
        "flex w-full touch-pan-y select-none flex-col gap-2 rounded-xl bg-muted py-3",
        className,
      )}
      data-testid="job-list-swiper"
    >
      <div
        className="relative h-10 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(90deg, transparent 0, currentColor 16%, currentColor 84%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0, currentColor 16%, currentColor 84%, transparent 100%)",
        }}
      >
        <div
          ref={trackRef}
          className="absolute left-1/2 top-0 flex h-full will-change-transform"
        >
          {shown.map(({ offset, item }) => {
            const isActive = offset === 0;
            return (
              <button
                key={`${offset}-${item.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                aria-hidden={Math.abs(offset) > 1 ? true : undefined}
                onClick={() => {
                  if (!isActive) go(Math.sign(offset));
                }}
                style={{ width: slot || undefined }}
                className={cn(
                  "flex h-full shrink-0 items-center justify-center text-sm transition-opacity focus-visible:outline-none",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground opacity-60",
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-baseline justify-center gap-1.5 whitespace-nowrap",
                    isActive &&
                      "min-w-[9.5rem] rounded-lg bg-background px-6 py-2 font-semibold shadow",
                  )}
                >
                  {item.label}
                  {item.count ? (
                    <span className="text-xs font-normal tabular-nums opacity-70">
                      {item.count}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div
        className="flex h-1.5 items-center justify-center gap-1.5"
        aria-hidden
      >
        {items.map((item, i) => (
          <span
            key={item.id}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index
                ? "w-[18px] bg-primary"
                : "w-1.5 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>
    </div>
  );
};
