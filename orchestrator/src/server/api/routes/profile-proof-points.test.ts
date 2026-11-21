import type { Server } from "node:http";
import type { ProofPointEntry } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

function json(body: unknown) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const governance: ProofPointEntry = {
  title: "Governance partner to Legal, Risk & Compliance",
  text: "Partnered with legal, risk and compliance on risk assessments, privacy impact assessments and compliance reviews of new opportunities.",
  role: "Product Manager at Acme",
  skills: [
    {
      label: "Privacy & compliance",
      keywords: ["privacy impact assessment", "compliance review"],
    },
    { label: "Cross-functional alignment", keywords: ["legal", "risk"] },
  ],
  keywords: ["governance", "risk assessment", "PIA", "compliance"],
  metric: null,
  followUps: ["How many reviews a year?"],
  source: "ai",
};

describe.sequential("Profile proof point routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
    const { db, schema } = await import("@server/db");
    await db
      .insert(schema.users)
      .values({ id: "test-user", username: "test-user" });
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("saves, lists, updates and deletes a proof point", async () => {
    const created = await fetch(`${baseUrl}/api/profile/proof-points`, {
      method: "POST",
      ...json(governance),
    });
    expect(created.status).toBe(201);
    const row = (await created.json()).data;
    expect(row).toMatchObject({ kind: "proof", data: governance });

    const listed = await fetch(`${baseUrl}/api/profile/entries`).then((r) =>
      r.json(),
    );
    expect(listed.data.proofPoints).toHaveLength(1);
    expect(listed.data.stories).toEqual([]);

    const updated = await fetch(
      `${baseUrl}/api/profile/proof-points/${row.id}`,
      {
        method: "PUT",
        ...json({ ...governance, metric: "40+ reviews a year" }),
      },
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.data.metric).toBe("40+ reviews a year");

    const deleted = await fetch(
      `${baseUrl}/api/profile/proof-points/${row.id}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);
    const missing = await fetch(
      `${baseUrl}/api/profile/proof-points/${row.id}`,
      { method: "DELETE" },
    );
    expect(missing.status).toBe(404);
  });

  it("merges the point's skills into the skill map, keeping the starter list", async () => {
    await fetch(`${baseUrl}/api/profile/proof-points`, {
      method: "POST",
      ...json(governance),
    });
    const entries = await fetch(`${baseUrl}/api/profile/entries`).then((r) =>
      r.json(),
    );
    const items = entries.data.skills.items as {
      label: string;
      keywords: string[];
      source: string;
    }[];
    const privacy = items.find((i) => i.label === "Privacy & compliance");
    expect(privacy).toMatchObject({ source: "user" });
    expect(privacy?.keywords).toEqual(
      expect.arrayContaining(["privacy impact assessment"]),
    );
    const crossFunctional = items.find(
      (i) => i.label === "Cross-functional alignment",
    );
    expect(crossFunctional?.source).toBe("starter");
    expect(crossFunctional?.keywords).toEqual(
      expect.arrayContaining(["cross-functional", "legal", "risk"]),
    );
    // The rest of the starter list is still there.
    expect(items.length).toBeGreaterThan(5);
  });

  it("rejects an invalid proof point and an empty draft request", async () => {
    const bad = await fetch(`${baseUrl}/api/profile/proof-points`, {
      method: "POST",
      ...json({ ...governance, title: "" }),
    });
    expect(bad.status).toBe(400);

    const emptyDraft = await fetch(
      `${baseUrl}/api/profile/proof-points/draft`,
      { method: "POST", ...json({ text: "   " }) },
    );
    expect(emptyDraft.status).toBe(400);
  });
});
