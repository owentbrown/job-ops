import { describe, expect, it } from "vitest";
import { findKeyword, findKeywords, normalizeText } from "./text-match";

describe("findKeyword", () => {
  it("matches whole words case-insensitively", () => {
    expect(findKeyword("Senior Business Analyst", ["analyst"])).toBe("analyst");
  });

  it("allows a trailing s", () => {
    expect(findKeyword("Data Analysts wanted", ["analyst"])).toBe("analyst");
  });

  it("does not match inside other words", () => {
    expect(findKeyword("Internal Communications Lead", ["intern"])).toBeNull();
    expect(findKeyword("International Growth Manager", ["intern"])).toBeNull();
  });

  it("matches multi-word and punctuated phrases", () => {
    expect(findKeyword("Head of Go-To-Market", ["go-to-market"])).toBe(
      "go-to-market",
    );
    expect(
      findKeyword("Strategy & Operations Lead", ["strategy & operations"]),
    ).toBe("strategy & operations");
    expect(
      findKeyword("This is a commission-only role.", ["commission-only"]),
    ).toBe("commission-only");
  });

  it("returns the first keyword in list order", () => {
    expect(
      findKeyword("Criminal Court Victim Specialist", ["specialist", "court"]),
    ).toBe("specialist");
  });

  it("handles null text and empty lists", () => {
    expect(findKeyword(null, ["x"])).toBeNull();
    expect(findKeyword("anything", [])).toBeNull();
  });
});

describe("findKeywords", () => {
  it("returns every matching keyword", () => {
    expect(
      findKeywords("Base salary plus commission and quota", [
        "commission",
        "quota",
        "ote",
      ]),
    ).toEqual(["commission", "quota"]);
  });
});

describe("normalizeText", () => {
  it("lowercases, unifies dashes and collapses whitespace", () => {
    expect(normalizeText("  Go–To   Market ")).toBe("go-to market");
  });
});
