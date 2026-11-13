import type { Server } from "node:http";
import type { DesignResumeJson } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

const story = {
  title: "Pricing relaunch",
  themes: ["delivery", "analytics"],
  situation: "Churn was rising",
  task: "Redesign pricing",
  action: "Ran tests and shipped tiers",
  result: "ARPU up 12%",
  metric: "+12% ARPU",
  source: "manual",
};

const brand = { line: "Product leader for B2B SaaS", industries: ["SaaS"] };

const LONG_DESCRIPTION = `We need a product manager to own the roadmap and work with cross-functional stakeholders. ${"You will define strategy, align teams and ship outcomes for customers. ".repeat(6)}`;

function json(body: unknown) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function seedResume() {
  const { replaceCurrentDesignResumeDocument } = await import(
    "@server/services/design-resume"
  );
  const { normalizeReactiveResumeV5Document } = await import(
    "@server/services/rxresume/document"
  );
  await replaceCurrentDesignResumeDocument({
    resumeJson: normalizeReactiveResumeV5Document({
      basics: {
        name: "Owen Brown",
        headline: "Product Manager",
        email: "owen@example.com",
        location: "Toronto",
        phone: "",
        website: { url: "", label: "" },
        customFields: [],
      },
      summary: { title: "Summary", columns: 1, hidden: false, content: "" },
      sections: {
        profiles: {
          title: "Profiles",
          columns: 1,
          hidden: false,
          items: [
            {
              id: "p1",
              hidden: false,
              icon: "",
              network: "LinkedIn",
              username: "owen",
              website: { url: "https://linkedin.com/in/owen", label: "" },
            },
          ],
        },
        experience: {
          title: "Experience",
          columns: 1,
          hidden: false,
          items: [
            {
              id: "e1",
              hidden: false,
              company: "Sun Life",
              position: "Senior Manager",
              location: "",
              period: "2020 - 2024",
              website: { url: "", label: "" },
              description:
                "<ul><li>Owned the roadmap for 3 products</li><li>Led stakeholders</li></ul>",
              roles: [],
            },
          ],
        },
        projects: { title: "Projects", columns: 1, hidden: false, items: [] },
        skills: { title: "Skills", columns: 1, hidden: false, items: [] },
      },
    }) as unknown as DesignResumeJson,
    sourceResumeId: null,
    sourceMode: "v5",
  });
}

async function seedScoredJobs(count: number) {
  const { createJob, updateJob } = await import("@server/repositories/jobs");
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const job = await createJob({
      source: "linkedin",
      title: "Senior Product Manager",
      employer: `Employer ${i}`,
      jobUrl: `https://example.com/job-${i}`,
      jobDescription: LONG_DESCRIPTION,
    });
    await updateJob(job.id, { suitabilityScore: 70 });
    ids.push(job.id);
  }
  return ids;
}

describe.sequential("Profile About you API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
    // The test auth bypass acts as "test-user"; user-owned rows need it to exist.
    const { db, schema } = await import("@server/db");
    await db
      .insert(schema.users)
      .values({ id: "test-user", username: "test-user" });
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("does not shadow the existing profile routes", async () => {
    const res = await fetch(`${baseUrl}/api/profile/status`);
    expect(res.status).toBe(200);
  });

  it("returns the insights shape with no resume and no jobs", async () => {
    const res = await fetch(`${baseUrl}/api/profile/insights`);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.dataState).toBe("no-resume");
    expect(data.bestFitJobCount).toBe(0);
    expect(data.strength.max).toBe(100);
    expect(data.strength.checks).toHaveLength(6);
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.roles).toEqual([]);
    expect(data.landing.applications).toBe(0);
    expect(data.skillsRefreshedAt).toBeNull();
  });

  it("computes insights from the resume, scored jobs and entries", async () => {
    await seedResume();
    await seedScoredJobs(6);
    await fetch(`${baseUrl}/api/profile/entries/brand`, {
      method: "PUT",
      ...json(brand),
    });

    const res = await fetch(`${baseUrl}/api/profile/insights`);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.dataState).toBe("ok");
    expect(data.bestFitJobCount).toBe(6);
    expect(data.brand.initials).toBe("OB");
    expect(data.brand.line).toBe(brand.line);
    expect(data.brand.lineSource).toBe("saved");
    expect(data.brand.location).toBe("Toronto");
    const roadmap = data.skills.find((s: { id: string }) => s.id === "roadmap");
    expect(roadmap).toMatchObject({ demandPct: 100, demandCount: 6, proof: 2 });
    expect(data.roles.length).toBeGreaterThan(0);
    expect(
      data.strength.checks.map((c: { id: string }) => c.id).sort(),
    ).toEqual(
      ["basics", "fresh", "pitch-values", "proof", "results", "stories"].sort(),
    );
  });

  it("uses the latest stage event as the job's stage", async () => {
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const { transitionStage } = await import(
      "@server/services/applicationTracking"
    );
    const { loadProfileJobs } = await import("@server/services/profile/load");
    const job = await createJob({
      source: "linkedin",
      title: "Strategy Lead",
      employer: "Acme",
      jobUrl: "https://example.com/stage",
      jobDescription: "d",
    });
    await updateJob(job.id, {
      status: "applied",
      appliedAt: new Date().toISOString(),
    });
    transitionStage(job.id, "screening");
    const rows = await loadProfileJobs();
    expect(rows.find((r) => r.id === job.id)?.stage).toBe("screening");
  });

  it("round-trips singletons and stories", async () => {
    const empty = await fetch(`${baseUrl}/api/profile/entries`).then((r) =>
      r.json(),
    );
    expect(empty.data).toEqual({
      brand: null,
      pitch: null,
      values: null,
      skills: null,
      stories: [],
    });

    const put = await fetch(`${baseUrl}/api/profile/entries/brand`, {
      method: "PUT",
      ...json(brand),
    });
    expect(put.status).toBe(200);
    expect((await put.json()).data).toMatchObject({
      kind: "brand",
      data: brand,
    });

    const created = await fetch(`${baseUrl}/api/profile/stories`, {
      method: "POST",
      ...json(story),
    });
    expect(created.status).toBe(201);
    const { data: row } = await created.json();
    expect(row).toMatchObject({ kind: "story", data: story });

    const updated = await fetch(`${baseUrl}/api/profile/stories/${row.id}`, {
      method: "PUT",
      ...json({ ...story, title: "Pricing relaunch v2" }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.data.title).toBe("Pricing relaunch v2");

    const list = await fetch(`${baseUrl}/api/profile/entries`).then((r) =>
      r.json(),
    );
    expect(list.data.brand).toEqual(brand);
    expect(list.data.stories).toHaveLength(1);
    expect(list.data.stories[0].data.title).toBe("Pricing relaunch v2");

    const deleted = await fetch(`${baseUrl}/api/profile/stories/${row.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    const again = await fetch(`${baseUrl}/api/profile/stories/${row.id}`, {
      method: "DELETE",
    });
    expect(again.status).toBe(404);
  });

  it("returns 404 when updating a missing story", async () => {
    const res = await fetch(`${baseUrl}/api/profile/stories/nope`, {
      method: "PUT",
      ...json(story),
    });
    expect(res.status).toBe(404);
  });

  it("rejects story and unknown kinds on the singleton route", async () => {
    const asStory = await fetch(`${baseUrl}/api/profile/entries/story`, {
      method: "PUT",
      ...json(story),
    });
    expect(asStory.status).toBe(400);
    expect((await asStory.json()).error.message).toMatch(/stories/);

    const unknown = await fetch(`${baseUrl}/api/profile/entries/hobbies`, {
      method: "PUT",
      ...json({}),
    });
    expect(unknown.status).toBe(400);
  });

  it("returns 400 with a field message for invalid bodies", async () => {
    const badBrand = await fetch(`${baseUrl}/api/profile/entries/brand`, {
      method: "PUT",
      ...json({ line: 5, industries: [] }),
    });
    expect(badBrand.status).toBe(400);
    const body = await badBrand.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toMatch(/^line: /);

    const badStory = await fetch(`${baseUrl}/api/profile/stories`, {
      method: "POST",
      ...json({ ...story, themes: ["bogus"] }),
    });
    expect(badStory.status).toBe(400);

    const badValues = await fetch(`${baseUrl}/api/profile/entries/values`, {
      method: "PUT",
      ...json({ items: [], ideal: { size: 101, management: 0, office: 0 } }),
    });
    expect(badValues.status).toBe(400);
  });
});

describe.sequential("Profile About you API scoping", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        BASIC_AUTH_USER: "admin",
        BASIC_AUTH_PASSWORD: "secret",
        JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
        JOBOPS_TEST_AUTH_BYPASS: "0",
      },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function login(username: string, password: string) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      ...json({ username, password }),
    });
    expect(res.status).toBe(200);
    return (await res.json()).data.token as string;
  }

  function auth(token: string, body?: unknown) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
  }

  it("requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/profile/entries`);
    expect(res.status).toBe(401);
  });

  it("keeps entries separate between workspaces", async () => {
    const adminToken = await login("admin", "secret");
    const createAdam = await fetch(`${baseUrl}/api/workspaces/users`, {
      method: "POST",
      ...auth(adminToken, {
        username: "adam",
        displayName: "Adam",
        password: "adam-secret",
      }),
    });
    expect(createAdam.status).toBe(201);
    const adamToken = await login("adam", "adam-secret");

    await fetch(`${baseUrl}/api/profile/entries/brand`, {
      method: "PUT",
      ...auth(adminToken, brand),
    });
    const created = await fetch(`${baseUrl}/api/profile/stories`, {
      method: "POST",
      ...auth(adminToken, story),
    });
    const storyId = (await created.json()).data.id as string;

    const adamEntries = await fetch(
      `${baseUrl}/api/profile/entries`,
      auth(adamToken),
    ).then((r) => r.json());
    expect(adamEntries.data.brand).toBeNull();
    expect(adamEntries.data.stories).toEqual([]);

    const adamInsights = await fetch(
      `${baseUrl}/api/profile/insights`,
      auth(adamToken),
    ).then((r) => r.json());
    expect(adamInsights.data.stories.total).toBe(0);
    expect(adamInsights.data.brand.lineSource).not.toBe("saved");

    const crossUpdate = await fetch(
      `${baseUrl}/api/profile/stories/${storyId}`,
      { method: "PUT", ...auth(adamToken, story) },
    );
    expect(crossUpdate.status).toBe(404);
    const crossDelete = await fetch(
      `${baseUrl}/api/profile/stories/${storyId}`,
      { method: "DELETE", ...auth(adamToken) },
    );
    expect(crossDelete.status).toBe(404);

    const adminEntries = await fetch(
      `${baseUrl}/api/profile/entries`,
      auth(adminToken),
    ).then((r) => r.json());
    expect(adminEntries.data.brand).toEqual(brand);
    expect(adminEntries.data.stories).toHaveLength(1);
  });
});
