import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDragAutoScrollStep, useDragAutoScroll } from "./useDragAutoScroll";

describe("getDragAutoScrollStep", () => {
  it("does nothing in the middle of the scroll area", () => {
    expect(getDragAutoScrollStep(500, 0, 1000)).toBe(0);
  });

  it("scrolls up near the top and down near the bottom", () => {
    expect(getDragAutoScrollStep(10, 0, 1000)).toBeLessThan(0);
    expect(getDragAutoScrollStep(990, 0, 1000)).toBeGreaterThan(0);
  });

  it("scrolls faster closer to the edge and caps past it", () => {
    const near = getDragAutoScrollStep(60, 0, 1000);
    const closer = getDragAutoScrollStep(5, 0, 1000);
    expect(Math.abs(closer)).toBeGreaterThan(Math.abs(near));
    expect(getDragAutoScrollStep(-200, 0, 1000)).toBe(-20);
    expect(getDragAutoScrollStep(1400, 0, 1000)).toBe(20);
  });

  it("keeps the edge zones apart in short containers", () => {
    expect(getDragAutoScrollStep(50, 0, 100)).toBe(0);
  });
});

describe("useDragAutoScroll", () => {
  const frames: FrameRequestCallback[] = [];

  afterEach(() => {
    frames.length = 0;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  function setup() {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const container = document.createElement("div");
    container.style.overflowY = "auto";
    Object.defineProperty(container, "scrollHeight", { value: 3000 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    container.getBoundingClientRect = () =>
      ({ top: 100, bottom: 700, left: 0, right: 400 }) as DOMRect;
    const card = document.createElement("div");
    container.appendChild(card);
    document.body.appendChild(container);
    container.scrollTop = 500;
    return { container, card };
  }

  function runFrame() {
    const next = frames.shift();
    next?.(0);
  }

  function dragOverAt(clientY: number) {
    const event = new Event("dragover", { bubbles: true });
    Object.defineProperty(event, "clientY", { value: clientY });
    document.body.dispatchEvent(event);
  }

  it("scrolls the panel while the pointer is held near its edges", () => {
    const { container, card } = setup();
    const { result } = renderHook(() => useDragAutoScroll());

    act(() => result.current.start(card));

    dragOverAt(690);
    runFrame();
    expect(container.scrollTop).toBeGreaterThan(500);

    const afterDown = container.scrollTop;
    dragOverAt(105);
    runFrame();
    expect(container.scrollTop).toBeLessThan(afterDown);
  });

  it("stops scrolling once the drag ends", () => {
    const { container, card } = setup();
    const { result } = renderHook(() => useDragAutoScroll());

    act(() => result.current.start(card));
    document.dispatchEvent(new Event("dragend"));
    dragOverAt(690);
    runFrame();

    expect(container.scrollTop).toBe(500);
  });
});
