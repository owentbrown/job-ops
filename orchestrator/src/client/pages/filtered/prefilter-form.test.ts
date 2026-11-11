import type { PrefilterConfigDto } from "@client/api";
import { describe, expect, it } from "vitest";
import {
  configToForm,
  formToConfig,
  fromLines,
  notesFromText,
  ratesFromText,
} from "./prefilter-form";

const base: PrefilterConfigDto = {
  _comment: "top",
  enabled: true,
  pauseBeforeScoring: true,
  title: { _comment: "t", include: ["growth"], exclude: ["analyst", "intern"] },
  companyBlocklist: [],
  maxPostingAgeDays: null,
  location: { commuteBlocklist: ["toronto"], dropUsOnly: true },
  companyNotes: [{ company: "Float", note: "3 days in office" }],
  salary: {
    enabled: true,
    floorAnnualCad: 110000,
    hoursPerYear: 2080,
    defaultCurrency: "CAD",
    ratesToCad: { CAD: 1, USD: 1.37 },
  },
  language: {
    enabled: true,
    dropNonEnglishPostings: true,
    blockedLanguages: ["French"],
  },
  description: { hardDropPhrases: ["commission only"], flagPhrases: ["quota"] },
  llm: {
    enabled: true,
    batchSize: 20,
    descriptionChars: 400,
    model: null,
    targetRoles: "PM roles",
    hardPasses: "Sales",
  },
};

describe("prefilter form helpers", () => {
  it("round-trips a config unchanged", () => {
    expect(formToConfig(configToForm(base), base)).toEqual(base);
  });

  it("maps the posting age limit, with empty meaning no limit", () => {
    const form = configToForm({ ...base, maxPostingAgeDays: 21 });
    expect(form.maxPostingAgeDays).toBe("21");
    expect(formToConfig(form, base).maxPostingAgeDays).toBe(21);
    expect(
      formToConfig({ ...form, maxPostingAgeDays: " " }, base).maxPostingAgeDays,
    ).toBeNull();
  });

  it("splits one keyword per line, trimming blanks", () => {
    expect(fromLines(" analyst \n\n intern\n")).toEqual(["analyst", "intern"]);
  });

  it("parses company notes as Company: note, skipping lines without a colon", () => {
    expect(
      notesFromText(
        "Float: 3 days in office\nno colon here\n Acme : remote ok ",
      ),
    ).toEqual([
      { company: "Float", note: "3 days in office" },
      { company: "Acme", note: "remote ok" },
    ]);
  });

  it("parses currency rates", () => {
    expect(ratesFromText("cad=1\nUSD = 1.37\n")).toEqual({ CAD: 1, USD: 1.37 });
  });

  it("applies edits and keeps comments", () => {
    const form = {
      ...configToForm(base),
      titleExclude: "analyst\nsales",
      floorAnnualCad: "120000",
      model: "  ",
      pauseBeforeScoring: false,
    };
    const next = formToConfig(form, base);
    expect(next.title.exclude).toEqual(["analyst", "sales"]);
    expect(next.title._comment).toBe("t");
    expect(next._comment).toBe("top");
    expect(next.salary.floorAnnualCad).toBe(120000);
    expect(next.llm.model).toBeNull();
    expect(next.pauseBeforeScoring).toBe(false);
  });
});
