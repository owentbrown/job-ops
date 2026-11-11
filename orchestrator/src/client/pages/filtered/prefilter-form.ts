import type { PrefilterConfigDto } from "@client/api";

/** Text-friendly form state: lists are one item per line, numbers are strings. */
export type PrefilterFormState = {
  enabled: boolean;
  pauseBeforeScoring: boolean;
  titleInclude: string;
  titleExclude: string;
  companyBlocklist: string;
  /** "" = no limit */
  maxPostingAgeDays: string;
  commuteBlocklist: string;
  dropUsOnly: boolean;
  companyNotes: string;
  languageEnabled: boolean;
  dropNonEnglishPostings: boolean;
  blockedLanguages: string;
  hardDropPhrases: string;
  flagPhrases: string;
  salaryEnabled: boolean;
  floorAnnualCad: string;
  hoursPerYear: string;
  defaultCurrency: string;
  ratesToCad: string;
  llmEnabled: boolean;
  batchSize: string;
  descriptionChars: string;
  model: string;
  targetRoles: string;
  hardPasses: string;
};

export function fromLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function ratesFromText(value: string): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const line of fromLines(value)) {
    const [code, rate] = line.split("=").map((part) => part.trim());
    if (code) rates[code.toUpperCase()] = Number(rate);
  }
  return rates;
}

/** "Company: note" per line. Lines without a colon are skipped (validation reports them). */
export function notesFromText(
  value: string,
): Array<{ company: string; note: string }> {
  return fromLines(value).flatMap((line) => {
    const colon = line.indexOf(":");
    if (colon <= 0) return [];
    const company = line.slice(0, colon).trim();
    const note = line.slice(colon + 1).trim();
    return company && note ? [{ company, note }] : [];
  });
}

function ratesToText(rates: Record<string, number>): string {
  return Object.entries(rates)
    .map(([code, rate]) => `${code}=${rate}`)
    .join("\n");
}

export function configToForm(config: PrefilterConfigDto): PrefilterFormState {
  return {
    enabled: config.enabled,
    pauseBeforeScoring: config.pauseBeforeScoring,
    titleInclude: config.title.include.join("\n"),
    titleExclude: config.title.exclude.join("\n"),
    companyBlocklist: config.companyBlocklist.join("\n"),
    maxPostingAgeDays:
      config.maxPostingAgeDays == null ? "" : String(config.maxPostingAgeDays),
    commuteBlocklist: config.location.commuteBlocklist.join("\n"),
    dropUsOnly: config.location.dropUsOnly ?? true,
    companyNotes: (config.companyNotes ?? [])
      .map((entry) => `${entry.company}: ${entry.note}`)
      .join("\n"),
    languageEnabled: config.language?.enabled ?? true,
    dropNonEnglishPostings: config.language?.dropNonEnglishPostings ?? true,
    blockedLanguages: (config.language?.blockedLanguages ?? []).join("\n"),
    hardDropPhrases: config.description.hardDropPhrases.join("\n"),
    flagPhrases: config.description.flagPhrases.join("\n"),
    salaryEnabled: config.salary.enabled,
    floorAnnualCad: String(config.salary.floorAnnualCad),
    hoursPerYear: String(config.salary.hoursPerYear),
    defaultCurrency: config.salary.defaultCurrency,
    ratesToCad: ratesToText(config.salary.ratesToCad),
    llmEnabled: config.llm.enabled,
    batchSize: String(config.llm.batchSize),
    descriptionChars: String(config.llm.descriptionChars),
    model: config.llm.model ?? "",
    targetRoles: config.llm.targetRoles,
    hardPasses: config.llm.hardPasses,
  };
}

/** Applies the form onto `base`, keeping fields the form doesn't show (e.g. _comment). */
export function formToConfig(
  form: PrefilterFormState,
  base: PrefilterConfigDto,
): PrefilterConfigDto {
  return {
    ...base,
    enabled: form.enabled,
    pauseBeforeScoring: form.pauseBeforeScoring,
    title: {
      ...base.title,
      include: fromLines(form.titleInclude),
      exclude: fromLines(form.titleExclude),
    },
    companyBlocklist: fromLines(form.companyBlocklist),
    maxPostingAgeDays: form.maxPostingAgeDays.trim()
      ? Number(form.maxPostingAgeDays.trim())
      : null,
    location: {
      ...base.location,
      commuteBlocklist: fromLines(form.commuteBlocklist),
      dropUsOnly: form.dropUsOnly,
    },
    companyNotes: notesFromText(form.companyNotes),
    language: {
      ...base.language,
      enabled: form.languageEnabled,
      dropNonEnglishPostings: form.dropNonEnglishPostings,
      blockedLanguages: fromLines(form.blockedLanguages),
    },
    salary: {
      ...base.salary,
      enabled: form.salaryEnabled,
      floorAnnualCad: Number(form.floorAnnualCad),
      hoursPerYear: Number(form.hoursPerYear),
      defaultCurrency: form.defaultCurrency.trim().toUpperCase(),
      ratesToCad: ratesFromText(form.ratesToCad),
    },
    description: {
      ...base.description,
      hardDropPhrases: fromLines(form.hardDropPhrases),
      flagPhrases: fromLines(form.flagPhrases),
    },
    llm: {
      ...base.llm,
      enabled: form.llmEnabled,
      batchSize: Number(form.batchSize),
      descriptionChars: Number(form.descriptionChars),
      model: form.model.trim() || null,
      targetRoles: form.targetRoles.trim(),
      hardPasses: form.hardPasses.trim(),
    },
  };
}
