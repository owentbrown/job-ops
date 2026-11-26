// Phase A: writes the demo's base data straight into the demo database.
// Runs inside a throwaway container (job-ops:local image) while the demo app
// is stopped:  node /demo/scripts/phase-a-seed.mjs
// Env: DEMO_DB (path to jobs.db), DEMO_LLM_API_KEY (optional).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/app/orchestrator/package.json");
const Database = require("better-sqlite3");

const DEMO = "/demo/data";
const read = (f) => JSON.parse(readFileSync(`${DEMO}/${f}`, "utf8"));
const persona = read("persona.json");
const jobs = [...read("jobs-a.json"), ...read("jobs-b.json"), ...read("jobs-c.json")];
const template = read("resume-template.json");

const db = new Database(process.env.DEMO_DB);
db.pragma("foreign_keys = ON");
const TENANT = "tenant_default";
const user = db.prepare("select id from users limit 1").get();
if (!user) throw new Error("No demo user yet: run the setup step first");
const USER = user.id;
const now = Date.now();
const iso = (daysAgo, hour = 9) => {
  const d = new Date(now - daysAgo * 86400000);
  d.setUTCHours(hour + 5, Math.floor(Math.random() * 50), 0, 0); // ~local morning
  return d.toISOString();
};

// ---------------------------------------------------------------- settings
const settings = {
  searchTerms: JSON.stringify([
    "Senior Product Manager",
    "Product Manager",
    "Growth Product Manager",
    "Product Operations",
    "Group Product Manager",
  ]),
  searchCities: "Toronto",
  workplaceTypes: JSON.stringify(["remote", "hybrid"]),
  jobspyCountryIndeed: "canada",
  showSponsorInfo: "0",
  onboardingProfileCompleted: "1",
  onboardingLlmCompleted: "1",
  onboardingResumeConfirmedSource: `local:primary_${TENANT}`,
  llmProvider: "anthropic",
  llmBaseUrl: "",
  model: "claude-haiku-5-5",
  pdfRenderer: "latex-personal",
  typstTheme: "compact",
  locationSearchMode: "cities",
  locationRadiusMiles: "40",
  locationSearchScope: "selected_plus_remote_worldwide",
  locationMatchStrictness: "flexible",
  jobspyResultsWanted: "8",
  penalizeMissingSalary: "1",
  autoSkipScoreThreshold: "30",
  chatStyleTone: "friendly",
  chatStyleFormality: "medium",
  backupEnabled: "0",
  scoringInstructions:
    "I'm targeting senior product manager roles in fintech, insurance, health tech or B2B SaaS. Remote in Canada or hybrid in Toronto. Minimum $130K CAD base. I'm strongest on onboarding, activation and growth work in regulated industries; weaker on deeply technical platform or API products.",
};
if (process.env.DEMO_LLM_API_KEY) settings.llmApiKey = process.env.DEMO_LLM_API_KEY;
const delSetting = db.prepare("delete from settings where key = ?");
const addSetting = db.prepare(
  `insert into settings (tenant_id, user_id, key, value, created_at, updated_at)
   values (?, null, ?, ?, datetime('now'), datetime('now'))`,
);
for (const [key, value] of Object.entries(settings)) {
  delSetting.run(key);
  addSetting.run(TENANT, key, value);
}

// ------------------------------------------------------------------ resume
const r = structuredClone(template);
const p = persona.resume;
r.basics = {
  ...r.basics,
  name: p.basics.name,
  headline: p.basics.headline,
  email: p.basics.email,
  phone: p.basics.phone,
  location: p.basics.location,
};
r.summary.content = p.summary;
const link = (url = "", label = "") => ({ url, label, inlineLink: false });
r.sections.profiles.items = p.profiles.map((x, i) => ({
  id: `demo-profile-${i + 1}`,
  hidden: false,
  icon: x.icon,
  network: x.network,
  username: x.username,
  website: link(x.url, x.label),
}));
r.sections.experience.items = p.experience.map((x, i) => ({
  id: `demo-exp-${i + 1}`,
  hidden: false,
  company: x.company,
  position: x.position,
  location: x.location,
  period: x.period,
  website: link(),
  description: `<ul>${x.bullets.map((b) => `<li><p>${b}</p></li>`).join("")}</ul>`,
  roles: [],
}));
r.sections.education.items = p.education.map((x, i) => ({
  id: `demo-edu-${i + 1}`,
  hidden: false,
  school: x.school,
  degree: x.degree,
  area: x.area,
  grade: "",
  location: "",
  period: x.period,
  website: link(),
  description: "",
}));
r.sections.skills.items = p.skills.map((x, i) => ({
  id: `demo-skill-${i + 1}`,
  hidden: false,
  icon: "",
  name: x.name,
  proficiency: "",
  level: 0,
  keywords: x.keywords,
}));
r.sections.certifications.items = p.certifications.map((x, i) => ({
  id: `demo-cert-${i + 1}`,
  hidden: false,
  title: x.title,
  issuer: x.issuer,
  date: x.date,
  website: link(),
  description: "",
}));
r.sections.projects.items = p.projects.map((x, i) => ({
  id: `demo-proj-${i + 1}`,
  hidden: false,
  name: x.name,
  period: "",
  website: link(),
  description: x.description,
}));
db.prepare("delete from design_resume_documents").run();
db.prepare(
  `insert into design_resume_documents
   (id, tenant_id, user_id, title, resume_json, revision, source_resume_id, source_mode, imported_at, created_at, updated_at)
   values (?, ?, ?, ?, ?, 1, null, null, ?, ?, ?)`,
).run(
  `primary_${TENANT}`,
  TENANT,
  USER,
  "Jordan Lee Resume",
  JSON.stringify(r),
  iso(60),
  iso(60),
  iso(60),
);

// -------------------------------------------------------------------- jobs
db.prepare("delete from jobs").run();
const insertJob = db.prepare(`insert into jobs (
  id, tenant_id, user_id, source, source_job_id, date_posted, title, employer, employer_url,
  job_url, application_link, salary, location, job_description, job_type, salary_source,
  salary_interval, salary_min_amount, salary_max_amount, salary_currency, is_remote, job_level,
  company_industry, work_from_home_type, status, filter_reason, filter_layer, filtered_at,
  skip_reason, skip_category, discovered_at, created_at, updated_at
) values (
  @id, @tenant, @user, @source, @sourceJobId, @datePosted, @title, @employer, @employerUrl,
  @jobUrl, @jobUrl, @salary, @location, @description, 'fulltime', @salarySource,
  @interval, @salaryMin, @salaryMax, @currency, @isRemote, @jobLevel,
  @industry, @wfh, @status, @filterReason, @filterLayer, @filteredAt,
  @skipReason, @skipCategory, @discoveredAt, @discoveredAt, @discoveredAt
)`);
const ids = {};
for (const j of jobs) {
  const id = randomUUID();
  ids[j.key] = id;
  const slug = j.employer.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const num = Math.floor(1000 + Math.random() * 8999);
  const discoveredAt = iso(j.discoveredDaysAgo, 7);
  insertJob.run({
    id,
    tenant: TENANT,
    user: USER,
    source: j.source,
    sourceJobId: `${j.source}-${num}`,
    datePosted: iso(j.discoveredDaysAgo + 1, 0).slice(0, 10),
    title: j.title,
    employer: j.employer,
    employerUrl: `https://${slug}.example.com`,
    jobUrl: `https://careers.${slug}.example.com/jobs/${num}`,
    salary: j.salary ?? null,
    location: j.location,
    description: j.description,
    salarySource: j.salary ? "listing" : null,
    interval: j.salary ? (j.interval ?? "yearly") : null,
    salaryMin: j.salaryMin ?? null,
    salaryMax: j.salaryMax ?? null,
    currency: j.salary ? (j.currency ?? "CAD") : null,
    isRemote: j.isRemote ? 1 : 0,
    jobLevel: j.jobLevel ?? null,
    industry: j.companyIndustry ?? null,
    wfh: j.workFromHomeType ?? null,
    status: j.plan === "filtered" ? "skipped" : "discovered",
    filterReason: j.filterReason ?? null,
    filterLayer: j.filterLayer ?? null,
    filteredAt: j.plan === "filtered" ? discoveredAt : null,
    skipReason: null,
    skipCategory: null,
    discoveredAt,
  });
}

// ------------------------------------------------------------ prefilter cfg
// (left to the app's defaults; the Filtered page shows the reasons above)

console.log(JSON.stringify({ ok: true, user: USER, jobs: Object.keys(ids).length, ids }));
