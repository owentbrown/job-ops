// Phase B: fills the demo through the running demo app's own API, so the AI
// output (scores, briefs, tailored resumes, prep kits) is genuinely produced
// by the app for the fictional persona.
// Usage: node demo/scripts/phase-b-api.mjs <ids.json>
// Env: DEMO_URL (default http://localhost:3006), DEMO_USER, DEMO_PASSWORD
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const persona = read("persona.json");
const jobs = [...read("jobs-a.json"), ...read("jobs-b.json"), ...read("jobs-c.json")];
const idsPath = process.argv[2];
const ids = JSON.parse(readFileSync(idsPath, "utf8")).ids;
const BASE = process.env.DEMO_URL ?? "http://localhost:3006";
const DAY = 86400;
const nowSec = Math.floor(Date.now() / 1000);
const daysAgo = (d, hour = 10) => {
  const t = new Date((nowSec - d * DAY) * 1000);
  t.setUTCHours(hour + 5, 15, 0, 0);
  return Math.floor(t.getTime() / 1000);
};

let token = "";
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok || json.ok === false) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json.data ?? json;
}
const step = (msg) => console.log(`- ${msg}`);
async function pool(items, size, fn) {
  const queue = [...items];
  const failures = [];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await fn(item);
        } catch (e) {
          failures.push(`${item.key ?? item}: ${e.message}`);
        }
      }
    }),
  );
  return failures;
}

// ------------------------------------------------------------------ login
const login = await api("POST", "/api/auth/login", {
  username: process.env.DEMO_USER ?? "demo",
  password: process.env.DEMO_PASSWORD,
});
token = login.token;
step("signed in");

// ---------------------------------------------------------------- profile
const only = new Set((process.env.ONLY ?? "profile,score,tailor,track,prep").split(","));
if (only.has("profile")) {
  await api("PUT", "/api/profile/entries/brand", persona.brand);
  await api("PUT", "/api/profile/entries/values", persona.values);
  const storyIds = [];
  for (const s of persona.stories) storyIds.push((await api("POST", "/api/profile/stories", s)).id);
  await api("PUT", "/api/profile/entries/pitch", {
    ...persona.pitch,
    builtFrom: { ...persona.pitch.builtFrom, storyIds: storyIds.slice(0, 2) },
  });
  for (const pp of persona.proofPoints) await api("POST", "/api/profile/proof-points", pp);
  // Curated skill map (saved last: saving proof points merges their skills in).
  // Keywords are tuned to the demo jobs so every quadrant has examples.
  await api("PUT", "/api/profile/entries/skills", {
    items: persona.skillMap.map((s) => ({
      id: s.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      label: s.label,
      keywords: s.keywords,
      hidden: false,
      source: "user",
    })),
    refreshedAt: null,
  });
  step(`profile: brand, values, pitch, ${storyIds.length} stories, ${persona.proofPoints.length} proof points`);
}

// ----------------------------------------------------------------- scoring
const scored = jobs.filter((j) => j.plan !== "filtered");
if (only.has("score")) {
  const fails = await pool(scored, 4, async (j) => {
    await api("POST", `/api/jobs/${ids[j.key]}/rescore`);
  });
  step(`scored ${scored.length - fails.length}/${scored.length} jobs`);
  if (fails.length) console.log("  score failures:", fails);
}

// ---------------------------------------------- tailored resumes and PDFs
const tailored = jobs.filter((j) => ["pipeline", "applied", "ready", "history"].includes(j.plan));
if (only.has("tailor")) {
  const fails = await pool(tailored, 3, async (j) => {
    await api("POST", `/api/jobs/${ids[j.key]}/process?force=1`);
  });
  step(`tailored ${tailored.length - fails.length}/${tailored.length} resumes`);
  if (fails.length) console.log("  tailor failures:", fails);
  // A cover letter on the strongest ready job.
  try {
    const cl = await api("POST", `/api/jobs/${ids.clearpath}/cover-letter/generate`, {});
    const text = cl.text ?? cl.coverLetter ?? cl.draft ?? (typeof cl === "string" ? cl : null);
    if (text) await api("PUT", `/api/jobs/${ids.clearpath}/cover-letter`, { text });
    step(`cover letter for Clearpath ${text ? "saved" : "generated (no text field?)"}`);
  } catch (e) {
    console.log("  cover letter failed:", e.message);
  }
}

// ------------------------------------------------ application tracking
const user = (eventLabel, note = null, eventType = "status_update") => ({
  actor: "user",
  eventLabel,
  note,
  eventType,
});
const tracks = {
  fernway: [
    ["applied", 20, user("Applied")],
    ["screening", 15, user("Recruiter screen", "30 min with Priya (Talent). Comp range confirmed, strong interest in my onboarding work.", "interview_log")],
    ["interview", 8, user("Hiring manager interview", "45 min with Dana Okafor, Director of Product. Deep dive on the Maplewave onboarding story. Next: panel on Thursday.", "interview_log")],
  ],
  cobalt: [
    ["applied", 15, user("Applied")],
    ["screening", 6, user("Recruiter screen", "Recruiter call with Marcus. Hybrid 2 days, base band $145-170K. Hiring manager interview next.", "interview_log")],
  ],
  tidewater: [
    ["applied", 32, user("Applied")],
    ["screening", 27, user("Recruiter screen", null, "interview_log")],
    ["interview", 20, user("Hiring manager interview", "With Ravi Sandhu, VP Claims Digital. Very aligned on hypercare and vendor management.", "interview_log")],
    ["interview", 12, user("Panel interview", "Product case (improve FNOL completion) plus panel with Ops and IT. Went well.", "interview_log")],
    ["offer", 3, user("Offer received", "Verbal offer: $168K base, 15% bonus, start Jan 12. Written offer to follow.")],
  ],
  brightline: [
    ["applied", 38, user("Applied")],
    ["screening", 33, user("Recruiter screen", null, "interview_log")],
    ["interview", 26, user("Hiring manager interview", null, "interview_log")],
    ["closed", 21, user("Rejected", "They went with an internal candidate. Asked to stay in touch."), "rejected"],
  ],
  pinecrest: [
    ["applied", 30, user("Applied")],
    ["screening", 26, user("Recruiter screen", "Band tops out at $125K for this scope.", "interview_log")],
    ["closed", 24, user("Withdrew", "Withdrew: comp below my floor."), "withdrawn"],
  ],
  lumen: [
    ["applied", 42, user("Applied")],
    ["closed", 10, user("No response", "No reply after 4 weeks and one follow-up."), "ghosted"],
  ],
};
const applied = jobs.filter((j) => j.plan === "applied");
if (only.has("track")) {
  for (const [key, events] of Object.entries(tracks)) {
    for (const [toStage, d, metadata, outcome] of events) {
      await api("POST", `/api/jobs/${ids[key]}/stages`, {
        toStage,
        occurredAt: daysAgo(d),
        metadata,
        ...(outcome ? { outcome } : {}),
      });
    }
  }
  for (const j of applied) {
    await api("POST", `/api/jobs/${ids[j.key]}/stages`, {
      toStage: "applied",
      occurredAt: daysAgo(Math.max(1, j.discoveredDaysAgo - 1)),
      metadata: user("Applied"),
    });
  }
  // Older applications: [stage, daysAgo, label?, note?, eventType?, outcome?]
  for (const j of jobs.filter((x) => x.track)) {
    for (const [toStage, d, label, note, eventType, outcome] of j.track) {
      await api("POST", `/api/jobs/${ids[j.key]}/stages`, {
        toStage,
        occurredAt: daysAgo(d),
        metadata: user(label ?? "Applied", note ?? null, eventType ?? "status_update"),
        ...(outcome ? { outcome } : {}),
      });
    }
  }
  for (const j of jobs.filter((x) => x.plan === "skipped")) {
    await api("POST", `/api/jobs/${ids[j.key]}/skip`);
  }
  step(`tracked ${Object.keys(tracks).length} pipeline jobs, ${applied.length} applied, skips done`);

  // Notes
  const notes = {
    fernway: [
      ["Panel prep: who's on it", "Thursday 2:00 pm, 60 min, Google Meet.\n\n- Dana Okafor, Director of Product (hiring manager)\n- Sam Whitfield, Engineering Manager, Onboarding squad\n- Leah Kim, Senior Product Designer\n- Dr. Anika Rao, Clinical Governance\n\nExpect: a product case on activation, plus a stakeholder question from Clinical Governance."],
      ["Why Fernway", "Activation is stuck at 38% within 30 days: same shape as the Maplewave problem I fixed (54% to 71%). Regulated domain, consent and identity verification, which I've done with Privacy and Legal. Fully remote and the base range clears my floor."],
    ],
    cobalt: [
      ["Recruiter screen notes", "Marcus (Talent) — 30 min.\n- Team: 6 engineers, 1 designer, shared analyst\n- KYB is the big bottleneck: median 4 days to first payment\n- They want someone who has worked with Risk and Compliance, not around them\n- Next: hiring manager (Elena Varga, Head of Product, Payments)"],
    ],
    tidewater: [
      ["Offer details", "Verbal offer from Ravi (VP Claims Digital):\n- Base $168,000\n- 15% target bonus\n- Defined-benefit pension\n- Start date Jan 12\n- Hybrid 1-2 days a week\n\nTo decide: compare with Fernway (panel this week). Ask for a 1-week extension if needed. Counter on base ($175K) given two squads."],
    ],
    brightline: [["Feedback", "Recruiter said the panel liked my process work but they hired internally. Good relationship, worth a check-in in Q2."]],
  };
  for (const [key, list] of Object.entries(notes))
    for (const [title, content] of list) await api("POST", `/api/jobs/${ids[key]}/notes`, { title, content });
  step("notes added");
}

// ---------------------------------------------------------- prep kits
if (only.has("prep")) {
  for (const key of ["fernway", "cobalt"]) {
    try {
      await api("POST", `/api/jobs/${ids[key]}/prep-kit/generate`, {});
      step(`prep kit generated for ${key}`);
    } catch (e) {
      console.log(`  prep kit ${key} failed:`, e.message);
    }
  }
  const jots = [
    "Dana: 3 PMs on the platform team, this role is the only one on activation",
    "Biggest drop-off is health-card verification, ~40% abandon there",
    "They tried SMS reminders last year, small lift, then stopped measuring",
    "Ask about: how employer partnerships sets onboarding targets",
    "Clinical Governance signs off on any consent copy change, 2-3 week cycle",
  ];
  for (const text of jots) await api("POST", `/api/jobs/${ids.fernway}/jots`, { text });
  step(`${jots.length} jots on Fernway`);
}

writeFileSync(join(dirname(idsPath), "phase-b-done.json"), JSON.stringify({ at: new Date().toISOString() }));
console.log("phase B done");
