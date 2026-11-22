import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPhoneAlert } from "./phone-alert";

describe("sendPhoneAlert", () => {
  afterEach(() => {
    delete process.env.NTFY_TOPIC;
    delete process.env.NTFY_SERVER;
    delete process.env.JOBOPS_PUBLIC_URL;
    vi.unstubAllGlobals();
  });

  it("does nothing without a topic", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendPhoneAlert({ title: "t", message: "m" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the topic with a tap-through link", async () => {
    process.env.NTFY_TOPIC = "jobops-abc";
    process.env.JOBOPS_PUBLIC_URL = "http://100.1.2.3:3005/";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await sendPhoneAlert({
        title: "Hiring Cafe needs a quick check",
        message: "Open Offerloop",
        path: "/jobs/ready",
      }),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ntfy.sh/jobops-abc",
      expect.objectContaining({
        method: "POST",
        body: "Open Offerloop",
        headers: expect.objectContaining({
          Title: "Hiring Cafe needs a quick check",
          Click: "http://100.1.2.3:3005/jobs/ready",
        }),
      }),
    );
  });

  it("swallows network failures", async () => {
    process.env.NTFY_TOPIC = "jobops-abc";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await sendPhoneAlert({ title: "t", message: "m" })).toBe(false);
  });
});
