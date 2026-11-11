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

### Commute rule (Toronto area)

For jobs whose location matches `location.commuteBlocklist` and that are not flagged remote, the description decides. A weekly in-office signal (the word "hybrid", "N days a week", "fully on-site", or hybrid/on-site in the location or work-from-home type) drops the job, even if the posting also says remote-first. Remote or occasional-travel wording (for example "remote role", "quarterly") sends the job to the AI check, which sees an `Arrangement:` excerpt. With no signal either way the job is dropped. Negated phrases such as "no hybrid requirement" are ignored.

### Posting age

`maxPostingAgeDays` (Filtered → Rules → General → "Max posting age") drops
jobs posted longer ago than that many days, before any AI is used. Empty or
`null` means no limit. Jobs without a posting date always pass. Aggregators
such as HiringCafe can surface postings weeks after they went up, so this
catches stale roles however often you run the pipeline.

### US-only jobs

With `location.dropUsOnly` on (the "Drop US-only jobs" switch in Rules), a job whose location names only US places ("Chicago, Illinois, U.S. | Remote", "Austin, TX") is dropped, unless the posting mentions Canada anywhere. If it does, the job goes to the AI check, which keeps it only if the role can be done from Canada. Locations that include Canada ("United States or Canada", "North America") are never dropped by this rule. A description that requires living in the US or US work authorization is dropped too, unless the location or text points to Canada (then it is only flagged).

### Company notes

`companyNotes` (Rules → "Company notes", one `Company: note` per line) records things you know that a posting may not say, such as "Float: hybrid, 3 days a week in the Toronto office". Jobs from that company always go to the AI check (even with an include title), and the AI treats the note as true. Names match as a whole word or run together ("Float" matches "Floatfinancial"). Use the company blocklist instead for companies you would never work for.

### Re-check scored jobs

Rule changes only apply to new jobs during a run. To apply them to jobs that are already scored and still in Discovered, use Filtered → "Re-check scored jobs". It runs the saved rules only (free, no AI), lists what would move, and moves those jobs to Filtered after a second click. They keep their score and scoring reason, and Restore brings them back as they were.

### Skip reasons

Clicking Skip on a job (job page or the job panel) now asks for an optional reason. It is saved in the `skip_reason` column and shown next to the Skipped status. The keyboard shortcut and bulk skip still skip without asking.
