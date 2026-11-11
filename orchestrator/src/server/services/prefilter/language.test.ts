import { describe, expect, it } from "vitest";
import {
  DEFAULT_BLOCKED_LANGUAGES,
  detectPostingLanguage,
  evaluateLanguageRequirement,
} from "./language";

const FRENCH_POSTING = `À titre de responsable de produits, vous représentez la voix du client dans le cadre des projets et êtes responsable de l'expérience membres et clients. Vous assemblez une gamme de produits et de services dans un processus cohérent afin de générer une expérience positive pour le membre et client. Vous travaillez en étroite collaboration avec le promoteur du projet et l'analyste d'affaires afin d'assurer que la solution réponde aux besoins des utilisateurs et que les bénéfices attendus du projet se réalisent. Vous gérez les relations avec les différentes parties prenantes du projet. Ce que nous offrons: salaire concurrentiel et boni annuel, 4 semaines de vacances flexibles dès la première année.`;

const ENGLISH_INTRO = `We are looking for a Product Manager to join our growing team. You will own the roadmap for our payments platform and work with engineering, design and the business to ship features our customers love. In this role you will define the strategy, run discovery with customers, and measure the impact of what we build.`;

function check(
  description: string,
  title = "Product Manager",
  dropNonEnglishPostings = true,
) {
  return evaluateLanguageRequirement({
    title,
    description,
    languages: DEFAULT_BLOCKED_LANGUAGES,
    dropNonEnglishPostings,
  });
}

describe("detectPostingLanguage", () => {
  it("spots a French posting", () => {
    expect(detectPostingLanguage(FRENCH_POSTING)).toBe("french");
  });

  it("leaves English postings alone", () => {
    expect(detectPostingLanguage(ENGLISH_INTRO)).toBeNull();
  });

  it("keeps bilingual postings with a full English half", () => {
    expect(
      detectPostingLanguage(
        `${ENGLISH_INTRO} ${ENGLISH_INTRO} ${FRENCH_POSTING}`,
      ),
    ).toBeNull();
  });

  it("ignores short text", () => {
    expect(detectPostingLanguage("Le produit et les clients")).toBeNull();
  });
});

describe("evaluateLanguageRequirement", () => {
  it("drops the Desjardins French posting", () => {
    expect(
      check(FRENCH_POSTING, "Responsable de produits, Gestion de produits-FR"),
    ).toMatchObject({ kind: "required", language: "French" });
  });

  it("drops a French posting even without the title marker", () => {
    expect(check(FRENCH_POSTING, "Responsable de produits")).toMatchObject({
      kind: "required",
      reason: "posting is written in French",
    });
  });

  it("can keep French-language postings when that switch is off", () => {
    expect(check(FRENCH_POSTING, "Responsable de produits", false)).toBeNull();
  });

  it.each([
    "Bilingual (English/French) is required.",
    "Fluency in French is mandatory for this role.",
    "You must be able to communicate in French with clients.",
    "French language skills: required",
    "Professional working proficiency in Spanish and English.",
    "Bilingualism is required.",
    "- Fluent in Mandarin",
  ])("drops a mandatory requirement: %s", (line) => {
    expect(check(`${ENGLISH_INTRO}\n${line}`)).toMatchObject({
      kind: "required",
    });
  });

  it.each([
    "Bilingual (English/French) is an asset.",
    "French would be a plus.",
    "Knowledge of Spanish is nice to have.",
    "Fluency in German is preferred but not required.",
    "Bilingualism (English and French) required if in Quebec.",
    "Adequate knowledge of French is required for positions in Quebec.",
    "If the position is bilingual (English/French), you'll also need to pass a French-language test.",
    "French may be required.",
    "When qualifications are equal, preference will be given to bilingual candidates.",
  ])("only flags an optional language: %s", (line) => {
    expect(check(`${ENGLISH_INTRO}\n${line}`)).toMatchObject({
      kind: "asset",
    });
  });

  it("ignores languages mentioned with no requirement", () => {
    expect(
      check(`${ENGLISH_INTRO} We serve French and English customers.`),
    ).toBeNull();
  });

  it.each([
    "Bilingual Product Manager",
    "French-speaking Product Owner",
    "Product Manager (Spanish)",
    "Product Manager - FR",
  ])("drops on the title: %s", (title) => {
    expect(check(ENGLISH_INTRO, title)).toMatchObject({ kind: "required" });
  });

  it("allows a language the user removed from the list", () => {
    expect(
      evaluateLanguageRequirement({
        title: "Product Manager",
        description: `${ENGLISH_INTRO}\nFluency in Spanish is required.`,
        languages: ["French"],
        dropNonEnglishPostings: true,
      }),
    ).toBeNull();
  });
});
