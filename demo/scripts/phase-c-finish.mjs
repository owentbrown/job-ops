// Phase C: makes the history look lived-in. Runs inside a throwaway container
// while the demo app is stopped:  node /demo/scripts/phase-c-finish.mjs
// Env: DEMO_DB, IDS (path to ids.json inside the container)
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/app/orchestrator/package.json");
const Database = require("better-sqlite3");
const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const jobsData = [...read("/demo/data/jobs-a.json"), ...read("/demo/data/jobs-b.json"), ...read("/demo/data/jobs-c.json")];
const ids = read(process.env.IDS).ids;
const byKey = Object.fromEntries(jobsData.map((j) => [j.key, j]));
const db = new Database(process.env.DEMO_DB);
const TENANT = "tenant_default";
const USER = db.prepare("select id from users limit 1").get().id;
const now = Date.now();
const addMin = (isoStr, m) => new Date(new Date(isoStr).getTime() + m * 60000).toISOString();
const isoDaysAgo = (d, hour = 9, min = 0) => {
  const t = new Date(now - d * 86400000);
  t.setUTCHours(hour + 5, min, 0, 0);
  return t.toISOString();
};

const tx = db.transaction(() => {
  const jobs = db.prepare("select id, status, discovered_at, applied_at, pdf_path from jobs").all();
  const firstApplied = db.prepare(
    "select min(occurred_at) t from stage_events where application_id = ? and to_stage = 'applied'",
  );
  const lastEvent = db.prepare("select max(occurred_at) t from stage_events where application_id = ?");
  for (const j of jobs) {
    const key = Object.keys(ids).find((k) => ids[k] === j.id);
    const data = byKey[key];
    const scoredAt = addMin(j.discovered_at, 4 + Math.floor(Math.random() * 20));
    const fa = firstApplied.get(j.id)?.t;
    const le = lastEvent.get(j.id)?.t;
    const appliedAt = fa ? new Date(fa * 1000).toISOString() : null;
    const tailored = ["pipeline", "applied", "ready", "history"].includes(data.plan);
    const readyAt = tailored ? addMin(scoredAt, 30 + Math.floor(Math.random() * 90)) : null;
    const updatedAt = le ? new Date(le * 1000).toISOString() : (readyAt ?? scoredAt);
    // Brand-new discoveries (last ~2 days) stay unviewed so they show as new.
    const viewedAt = data.plan === "discovered" && data.discoveredDaysAgo <= 1 ? null : addMin(j.discovered_at, 120);
    db.prepare(
      `update jobs set processed_at = ?, ready_at = ?, applied_at = ?, updated_at = ?, viewed_at = ?,
         pdf_generated_at = case when pdf_path is not null then ? else pdf_generated_at end,
         skip_reason = coalesce(?, skip_reason), skip_category = coalesce(?, skip_category)
       where id = ?`,
    ).run(
      data.plan === "filtered" ? null : scoredAt,
      readyAt,
      appliedAt,
      updatedAt,
      viewedAt,
      readyAt,
      data.skipReason ?? null,
      data.skipCategory ?? null,
      j.id,
    );
  }

  // LLM usage: move each call to when its job was processed.
  const usage = db.prepare("select id, job_id, feature from llm_usage").all();
  for (const u of usage) {
    const j = u.job_id ? db.prepare("select discovered_at, ready_at from jobs where id = ?").get(u.job_id) : null;
    const at = j
      ? addMin(u.feature === "scoring" ? j.discovered_at : (j.ready_at ?? j.discovered_at), 3 + Math.floor(Math.random() * 15))
      : isoDaysAgo(Math.floor(Math.random() * 20) + 1, 11);
    db.prepare("update llm_usage set created_at = ? where id = ?").run(at, u.id);
  }

  // Notes, jots and prep kits: date them to the conversations they came from.
  const noteDay = { fernway: 7, cobalt: 6, tidewater: 3, brightline: 21 };
  for (const [key, d] of Object.entries(noteDay)) {
    const t = isoDaysAgo(d, 16, 20);
    db.prepare("update job_notes set created_at = ?, updated_at = ? where job_id = ?").run(t, t, ids[key]);
  }
  const jots = db.prepare("select id from job_jots where job_id = ? order by created_at").all(ids.fernway);
  jots.forEach((r, i) => db.prepare("update job_jots set created_at = ? where id = ?").run(isoDaysAgo(8, 10, 20 + i * 6), r.id));
  db.prepare("update job_prep_kits set created_at = ?, updated_at = ? where job_id = ?").run(isoDaysAgo(9, 19), isoDaysAgo(2, 20), ids.fernway);
  db.prepare("update job_prep_kits set created_at = ?, updated_at = ? where job_id = ?").run(isoDaysAgo(5, 20), isoDaysAgo(5, 20), ids.cobalt);

  // Search runs: one each weekday morning for ~6 weeks, matching discoveries.
  db.prepare("delete from pipeline_runs").run();
  const config = {
    topN: 15,
    minSuitabilityScore: 60,
    sources: ["indeed", "linkedin", "hiringcafe", "startupjobs", "workingnomads"],
    locationIntent: {
      selectedCountry: "canada",
      country: "canada",
      cityLocations: ["Toronto"],
      workplaceTypes: ["remote", "hybrid"],
      geoScope: "selected_plus_remote_worldwide",
      searchScope: "selected_plus_remote_worldwide",
      matchStrictness: "flexible",
      proximity: null,
    },
  };
  const ins = db.prepare(
    `insert into pipeline_runs (id, tenant_id, user_id, started_at, completed_at, status, jobs_discovered, jobs_processed, error_message, config_snapshot)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (let d = 44; d >= 0; d--) {
    const day = new Date(now - d * 86400000).getUTCDay();
    if (day === 0 || day === 6) continue;
    const found = jobsData.filter((j) => j.discoveredDaysAgo === d).length;
    const start = isoDaysAgo(d, 7, 0);
    const failed = d === 17;
    ins.run(
      randomUUID(),
      TENANT,
      USER,
      start,
      addMin(start, failed ? 2 : 6 + Math.floor(Math.random() * 6)),
      failed ? "failed" : "completed",
      failed ? 0 : 140 + Math.floor(Math.random() * 120),
      failed ? 0 : Math.max(found, Math.floor(Math.random() * 3)),
      failed ? "LinkedIn source timed out after 120s" : null,
      JSON.stringify(config),
    );
  }
});
tx();
db.pragma("wal_checkpoint(TRUNCATE)");
console.log("phase C done");
