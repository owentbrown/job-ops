# config/

## prefilter.json

The rules for the pre-score filter. Before the (paid) LLM scoring step, these
rules, and an optional batched AI title check, mark clearly irrelevant jobs as
`skipped` with a reason. Nothing is ever deleted, and you can restore any
filtered job from the Filtered page.

Edit it in the app (Filtered -> Rules) or by hand. The file is re-read on every
run and again after Resume, so edits made while a run is paused apply to that
run.

### When runs pause

- A normal run (Run button) pauses for review before scoring when
  `pauseBeforeScoring` is on. Resume it from the card on the Jobs page or from
  the Rules tab.
- A missing or invalid file also pauses the run. Fix it, then Resume. The run
  never falls back to "score everything".
- Webhook-triggered runs pause the same way. They stay "running" until resumed,
  and later webhook calls do nothing in the meantime.
- `npm run pipeline:run` (CLI) skips the review pause, since starting it is the
  go-ahead. A missing or invalid file makes that run fail with an error.

### What is never filtered

- Manually added jobs.
- Jobs you restored from the Filtered page.

### Caveat: "Clear skipped jobs"

The upstream maintenance action "Clear skipped jobs" hard-deletes every job
with status `skipped`, and filtered jobs have that status. Do not use it if you
want to keep the audit trail.

### Dry run against your real data

Run the rules read-only against a COPY of the database. Never point it at the
live file.

```bash
cp data/jobs.db /tmp/jobs-copy.db
cd orchestrator
npx tsx scripts/prefilter-dry-run.ts /tmp/jobs-copy.db        # unscored jobs
npx tsx scripts/prefilter-dry-run.ts /tmp/jobs-copy.db --all  # discovered + skipped
```

It prints one line per job (drop / keep / undecided with the reason) and a
summary. Set `PREFILTER_CONFIG_PATH` to test a different rules file.
