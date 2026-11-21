import { afterEach, describe, expect, it, vi } from "vitest";
import { trackServerProductEvent } from "./product-analytics";

describe("trackServerProductEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never sends anything off the machine", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      trackServerProductEvent("job_applied", { jobId: "j1" }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
