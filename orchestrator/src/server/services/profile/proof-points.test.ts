import type { ProofPointEntry } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  formatProofPointForPrompt,
  mergeProofSkills,
  sanitizeDrafts,
  selectProofPointsForJob,
} from "./proof-points";

const point = (over: Partial<ProofPointEntry>): ProofPointEntry => ({
  title: "Point",
  text: "Did a thing.",
  role: null,
  skills: [],
  keywords: [],
  metric: null,
  followUps: [],
  source: "ai",
  ...over,
});

describe("sanitizeDrafts", () => {
  it("keeps valid points, snaps the role to a resume role and dedupes keywords", () => {
    const drafts = sanitizeDrafts(
      {
        points: [
          {
            title: "  Governance partner  ",
            text: "Ran privacy impact assessments with legal.",
            role: "product manager at acme",
            skills: [{ label: "Privacy", keywords: ["PIA", "pia", "privacy"] }],
            keywords: ["PIA", "pia", "governance"],
            metric: "",
            followUps: ["How many?"],
          },
          { title: "", text: "no title" },
        ],
      },
      ["Product Manager at Acme"],
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: "Governance partner",
      role: "Product Manager at Acme",
      keywords: ["PIA", "governance"],
      metric: null,
      source: "ai",
    });
    expect(drafts[0]?.skills[0]?.keywords).toEqual(["PIA", "privacy"]);
  });

  it("drops a role the resume doesn't have", () => {
    const [draft] = sanitizeDrafts(
      { points: [{ title: "T", text: "X", role: "CEO at Nowhere" }] },
      ["Product Manager at Acme"],
    );
    expect(draft?.role).toBeNull();
  });
});

describe("mergeProofSkills", () => {
  it("starts from the starter list when none is saved", () => {
    const merged = mergeProofSkills(null, [
      { label: "Governance", keywords: ["risk assessment"] },
    ]);
    expect(merged.items.some((i) => i.source === "starter")).toBe(true);
    expect(merged.items.at(-1)).toMatchObject({
      label: "Governance",
      source: "user",
      keywords: ["Governance", "risk assessment"],
    });
  });

  it("adds keywords to a skill with the same label instead of duplicating it", () => {
    const current = {
      items: [
        {
          id: "gov",
          label: "Governance",
          keywords: ["governance"],
          hidden: false,
          source: "user" as const,
        },
      ],
      refreshedAt: null,
    };
    const merged = mergeProofSkills(current, [
      { label: "governance", keywords: ["compliance review", "Governance"] },
    ]);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.keywords).toEqual([
      "governance",
      "compliance review",
    ]);
  });
});

describe("selectProofPointsForJob", () => {
  const governance = point({
    title: "Governance",
    keywords: ["privacy impact assessment", "compliance"],
    skills: [{ label: "Risk management", keywords: ["risk assessment"] }],
  });
  const growth = point({ title: "Growth", keywords: ["activation", "A/B test"] });

  it("returns only points whose terms appear in the job, best match first", () => {
    const picked = selectProofPointsForJob([growth, governance], {
      title: "Product Operations Manager",
      jobDescription:
        "<p>Own compliance reviews and privacy impact assessment work with Legal.</p>",
    });
    expect(picked.map((p) => p.title)).toEqual(["Governance"]);
  });

  it("needs two shared terms, so one generic word isn't enough", () => {
    expect(
      selectProofPointsForJob([governance], {
        jobDescription: "You will ensure compliance with company policy.",
      }),
    ).toEqual([]);
  });

  it("returns nothing without a job description or points", () => {
    expect(selectProofPointsForJob([governance], {})).toEqual([]);
    expect(
      selectProofPointsForJob([], { jobDescription: "compliance" }),
    ).toEqual([]);
  });
});

describe("formatProofPointForPrompt", () => {
  it("includes role and metric but never the follow-up questions", () => {
    const line = formatProofPointForPrompt(
      point({
        title: "Governance",
        text: "Ran PIAs.",
        role: "PM at Acme",
        metric: "40 a year",
        followUps: ["secret question"],
      }),
    );
    expect(line).toBe("Governance (PM at Acme): Ran PIAs. [40 a year]");
  });
});
