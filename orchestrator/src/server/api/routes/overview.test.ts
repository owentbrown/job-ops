import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Overview API route", () => {
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

  it("returns pipeline buckets and counts for seeded jobs", async () => {
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const { transitionStage } = await import(
      "@server/services/applicationTracking"
    );

    const a = await createJob({
      source: "linkedin",
      title: "Growth Manager",
      employer: "Acme",
      jobUrl: "https://example.com/a",
      jobDescription: "d",
    });
    await updateJob(a.id, {
      status: "applied",
      appliedAt: new Date().toISOString(),
    });
    transitionStage(a.id, "screening");
    await createJob({
      source: "indeed",
      title: "Analyst",
      employer: "Beta",
      jobUrl: "https://example.com/b",
      jobDescription: "d",
    });

    const res = await fetch(`${baseUrl}/api/overview?range=30&tz=UTC`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.data ?? body;
    expect(data.rangeDays).toBe(30);
    expect(data.pipeline.total).toBe(1);
    expect(data.pipeline.buckets.screening).toBe(1);
    expect(data.actions.allJobsCount).toBe(2);
    expect(data.replies.replied).toBe(1);
  });

  it("estimates a catch-up pass and rejects a bad kind", async () => {
    const res = await fetch(`${baseUrl}/api/overview/backfill?kind=roles`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ kind: "roles", count: 0, calls: 0 });

    const bad = await fetch(`${baseUrl}/api/overview/backfill?kind=jobs`);
    expect(bad.status).toBe(400);
  });

  it("refuses to run a catch-up pass in demo mode", async () => {
    const previous = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";
    try {
      const res = await fetch(`${baseUrl}/api/overview/backfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "roles" }),
      });
      expect(res.status).toBe(403);
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = previous;
    }
  });

  it("rejects an unsupported range", async () => {
    const res = await fetch(`${baseUrl}/api/overview?range=5`);
    expect(res.status).toBe(400);
  });
});
