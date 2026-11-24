import { describe, expect, it } from "vitest";
import { mergeWrapUp, sanitizeKitContent } from "./prep-kit";

const kit = {
  sections: [
    { id: "a", title: "Opener", cues: ["Hi"], detail: "" },
    { id: "b", title: "Role facts", cues: ["Ask about hybrid"], detail: "" },
  ],
  questions: [
    { id: "q1", text: "Hybrid?", detail: "", answered: false, answer: "" },
    { id: "q2", text: "Team size?", detail: "", answered: false, answer: "" },
  ],
};

describe("mergeWrapUp", () => {
  it("replaces cards by id, adds new ones and marks answered questions", () => {
    const merged = mergeWrapUp(kit, {
      updatedSections: [
        {
          id: "b",
          title: "Role facts",
          cues: ["1 day/wk at K-W"],
          detail: "x",
        },
        { id: "", title: "What we've learned", cues: ["New role"], detail: "" },
        { id: "zzz", title: "  ", cues: [], detail: "" },
      ],
      answeredQuestions: [
        { id: "q1", answer: "1 day a week at K-W" },
        { id: "nope", answer: "ignored" },
      ],
      newQuestions: [
        { text: "What does success look like in a year?", detail: "" },
      ],
    });

    expect(merged.kit.sections.map((s) => s.title)).toEqual([
      "Opener",
      "Role facts",
      "What we've learned",
    ]);
    expect(merged.kit.sections[1]).toMatchObject({
      id: "b",
      cues: ["1 day/wk at K-W"],
    });
    expect(merged.kit.sections[2].id).toBeTruthy();
    expect(merged.changedSections).toEqual([
      "Role facts",
      "What we've learned",
    ]);
    expect(merged.answeredQuestionIds).toEqual(["q1"]);
    expect(merged.kit.questions[0]).toMatchObject({
      answered: true,
      answer: "1 day a week at K-W",
    });
    expect(merged.kit.questions[1].answered).toBe(false);
    expect(merged.kit.questions).toHaveLength(3);
  });

  it("an unknown card id adds a card instead of replacing one", () => {
    const merged = mergeWrapUp(kit, {
      updatedSections: [
        { id: "missing", title: "Comp", cues: ["$105K"], detail: "" },
      ],
      answeredQuestions: [],
      newQuestions: [],
    });
    expect(merged.kit.sections).toHaveLength(3);
    expect(merged.kit.sections[0].title).toBe("Opener");
  });
});

describe("sanitizeKitContent", () => {
  it("drops junk and trims cues", () => {
    const clean = sanitizeKitContent({
      sections: [
        {
          title: " Salary ",
          cues: [" Upper end ", "", 5, "a", "b", "c", "d"],
          detail: 3,
        },
        null,
        "nope",
      ],
      questions: [{ text: "" }, { text: "Why now?", answered: "yes" }],
    });
    expect(clean.sections).toHaveLength(1);
    expect(clean.sections[0]).toMatchObject({
      title: "Salary",
      cues: ["Upper end", "a", "b", "c", "d"],
      detail: "",
    });
    expect(clean.questions).toEqual([
      expect.objectContaining({
        text: "Why now?",
        answered: false,
        answer: "",
      }),
    ]);
  });
});
