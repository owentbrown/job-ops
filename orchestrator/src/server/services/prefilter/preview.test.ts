import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import { previewRules } from "./preview";

const config = parsePrefilterConfig({
  title: { include: ["product manager"], exclude: ["analyst"] },
  description: { flagPhrases: ["quota"] },
});

const jobs = [
  createJob({
    id: "pm",
    location: "Waterloo, ON",
    title: "Product Manager",
    jobDescription: "",
  }),
  createJob({
    id: "ops",
    location: "Waterloo, ON",
    title: "Operations Lead",
    jobDescription: "Quota applies",
  }),
  createJob({
    id: "ba",
    location: "Waterloo, ON",
    title: "Business Analyst",
    jobDescription: "",
  }),
];

describe("previewRules", () => {
  it("counts decisions and lists drops first", () => {
    const result = previewRules(jobs, config);
    expect(result.total).toBe(3);
    expect(result.counts).toEqual({ drop: 1, keep: 1, undecided: 1 });
    expect(
      result.items.map((item) => [item.id, item.decision, item.detail]),
    ).toEqual([
      ["ba", "drop", "title keyword 'analyst'"],
      ["ops", "undecided", "flags: quota"],
      ["pm", "keep", "title include 'product manager'"],
    ]);
  });

  it("caps the item list but not the counts", () => {
    const result = previewRules(jobs, config, 1);
    expect(result.items).toHaveLength(1);
    expect(
      result.counts.drop + result.counts.keep + result.counts.undecided,
    ).toBe(3);
  });
});
