import { describe, expect, it } from "vitest";
import {
  applyBulletSelectionToHtml,
  constrainExperienceBulletSelection,
  extractExperienceBulletCatalog,
  extractResumeHtmlBullets,
  getKeptBulletIndices,
  parseExperienceBulletSelection,
  serializeExperienceBulletSelection,
} from "./resume-experience-bullets";

const listHtml =
  "<ul><li><p><strong>Led</strong> a team of 6.</p></li><li><p>Cut costs &amp; time.</p></li><li><p>Shipped v2.</p></li></ul>";

describe("applyBulletSelectionToHtml", () => {
  it("keeps only the selected list items, in their original order and markup", () => {
    const result = applyBulletSelectionToHtml(listHtml, [2, 0]);
    expect(result).toBe(
      "<ul><li><p><strong>Led</strong> a team of 6.</p></li><li><p>Shipped v2.</p></li></ul>",
    );
    expect(extractResumeHtmlBullets(result)).toEqual([
      "<strong>Led</strong> a team of 6.",
      "Shipped v2.",
    ]);
  });

  it("returns the html unchanged when every bullet is kept", () => {
    expect(applyBulletSelectionToHtml(listHtml, [0, 1, 2])).toBe(listHtml);
  });

  it("returns an empty string when no bullet is kept", () => {
    expect(applyBulletSelectionToHtml(`<p>Intro.</p>${listHtml}`, [])).toBe("");
  });

  it("keeps non-list text around a trimmed list", () => {
    const result = applyBulletSelectionToHtml(`<p>Intro.</p>${listHtml}`, [1]);
    expect(result).toContain("<p>Intro.</p>");
    expect(extractResumeHtmlBullets(result)).toEqual(["Cut costs & time."]);
  });

  it("rebuilds paragraph-style bullets as a list that round-trips", () => {
    const html =
      "<p>Grew revenue by 5% &amp; more.</p><p>Built <em>dashboards</em>.</p><p>Hired 3 people.</p>";
    const result = applyBulletSelectionToHtml(html, [0, 1]);
    expect(extractResumeHtmlBullets(result)).toEqual([
      "Grew revenue by 5% & more.",
      "Built <em>dashboards</em>.",
    ]);
  });

  it("ignores out-of-range indices", () => {
    expect(
      extractResumeHtmlBullets(applyBulletSelectionToHtml(listHtml, [1, 9])),
    ).toEqual(["Cut costs & time."]);
  });
});

describe("selection parsing", () => {
  it("parses JSON, drops invalid entries and sorts indices", () => {
    expect(
      parseExperienceBulletSelection(
        JSON.stringify({ a: [2, 0, 2, -1, 1.5, "x"], b: "nope", "": [1] }),
      ),
    ).toEqual({ a: [0, 2] });
  });

  it("treats empty, invalid and empty-object input as no selection", () => {
    expect(parseExperienceBulletSelection(null)).toBeNull();
    expect(parseExperienceBulletSelection("")).toBeNull();
    expect(parseExperienceBulletSelection("{not json")).toBeNull();
    expect(parseExperienceBulletSelection("{}")).toBeNull();
    expect(parseExperienceBulletSelection("[1,2]")).toBeNull();
  });

  it("keeps an explicit empty list (drop every bullet of that role)", () => {
    expect(parseExperienceBulletSelection('{"old":[]}')).toEqual({ old: [] });
  });

  it("serializes with stable key and index order", () => {
    expect(serializeExperienceBulletSelection({ b: [3, 1], a: [0] })).toBe(
      '{"a":[0],"b":[1,3]}',
    );
    expect(serializeExperienceBulletSelection(null)).toBe("");
  });
});

describe("extractExperienceBulletCatalog", () => {
  const resume = {
    sections: {
      experience: {
        hidden: false,
        items: [
          {
            id: "recent",
            hidden: false,
            company: "Acme",
            position: "Lead",
            period: "2023 - Present",
            description: listHtml,
          },
          {
            id: "hidden",
            hidden: true,
            company: "Hidden Co",
            position: "x",
            period: "",
            description: "<ul><li>Hidden</li></ul>",
          },
        ],
      },
    },
  };

  it("lists visible items with plain-text bullets", () => {
    expect(extractExperienceBulletCatalog(resume)).toEqual([
      {
        id: "recent",
        company: "Acme",
        position: "Lead",
        period: "2023 - Present",
        bullets: ["Led a team of 6.", "Cut costs & time.", "Shipped v2."],
      },
    ]);
  });

  it("constrains a selection to known ids and valid indices", () => {
    const catalog = extractExperienceBulletCatalog(resume);
    expect(
      constrainExperienceBulletSelection(
        { recent: [0, 7], unknown: [0] },
        catalog,
      ),
    ).toEqual({ recent: [0] });
    expect(getKeptBulletIndices(null, catalog[0])).toEqual([0, 1, 2]);
    expect(getKeptBulletIndices({ recent: [1] }, catalog[0])).toEqual([1]);
  });
});
