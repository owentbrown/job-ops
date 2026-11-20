import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Related jobs route", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("returns other jobs at the same company and flags the same posting", async () => {
    const { createJob } = await import("@server/repositories/jobs");
    const current = await createJob({
      source: "manual",
      title: "Product Manager, Strategic Projects",
      employer: "tailscale",
      jobUrl:
        "https://job-boards.greenhouse.io/tailscale/jobs/4754039005?utm_source=freehire",
    });
    const applied = await createJob({
      source: "manual",
      title: "Product Manager, Aperture",
      employer: "Tailscale Inc.",
      jobUrl: "https://job-boards.greenhouse.io/tailscale/jobs/4754039005",
    });
    const sibling = await createJob({
      source: "manual",
      title: "Release Manager",
      employer: "Tailscale",
      jobUrl: "https://job-boards.greenhouse.io/tailscale/jobs/4751613005",
    });
    await createJob({
      source: "manual",
      title: "Product Operations Specialist",
      employer: "Kinaxis",
      jobUrl: "https://www.linkedin.com/jobs/view/4484478681",
    });

    const res = await fetch(`${baseUrl}/api/jobs/${current.id}/related`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual([
      applied.id,
      sibling.id,
    ]);
    expect(body.data.items[0]).toMatchObject({
      samePosting: true,
      title: "Product Manager, Aperture",
    });
    expect(body.data.items[1].samePosting).toBe(false);
  });

  it("returns 404 for a missing job", async () => {
    const res = await fetch(`${baseUrl}/api/jobs/missing-job/related`);
    expect(res.status).toBe(404);
  });
});
