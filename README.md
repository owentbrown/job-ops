# JobOps (personal fork)

A personal, self-hosted fork of [JobOps](https://github.com/DaKheera47/job-ops) by Shaheer Sarfaraz. It searches job boards every morning, filters and scores what it finds against a profile, writes tailored CVs and cover letters, and tracks applications through to replies.

This fork runs on one Mac in Docker and is used from a laptop and an iPhone. It is not a distribution: there are no published images or releases, and nothing is sent to the original author.

## What's different from upstream

- **Search runs:** a daily schedule that retries when the Mac wakes offline, phone alerts (ntfy) when a site asks for a human check, a 5-minute wait before skipping that site, and per-source timeouts that keep partial results.
- **Filtering before scoring:** pre-score rules, a real "Filtered out" list with counts, and reason chips for skips.
- **Duplicates:** tracking parameters are stripped from job links, reposts are dropped on import, and employer names are matched loosely ("Sonova AG" = "Sonova").
- **Job page:** "Other roles at this company", and a company panel with the Indeed rating, review links and an optional AI company check.
- **Documents:** per-job experience bullets in tailored CVs, one-page cover letters, and sent CVs and letters kept exactly as sent.
- **Profile:** About you (pitch, stories, values, brand) with AI drafts, and a skill map.
- **Phones:** swipe between job lists, and layouts that fit a phone screen.
- **Spend:** estimated AI cost per run, task and job.
- **Settings search:** finds any word shown on a settings page.
- **Privacy:** Umami and OpenPanel analytics are removed, and the update check no longer calls GitHub.

## Running it

Requirements: Docker (OrbStack on macOS) and an API key for an AI provider.

```bash
GITHUB_TOKEN=unused docker compose up -d --build
```

The app is served at `http://localhost:3005`. `docker-compose.override.yml` builds the image as `job-ops:local`, keeps the SQLite database on the `jobops-db` Docker volume and mounts `./config` for the pre-score rules. Files such as PDFs and daily backups go in `./data`.

Optional settings in `.env`:

- `NTFY_TOPIC`: the ntfy topic for phone alerts (`NTFY_SERVER` overrides ntfy.sh).
- `JOBOPS_PUBLIC_URL`: the address the phone opens when an alert is tapped.

### Deploying a change

1. Check that no search run is in progress (`docker logs --since 10m job-ops | grep "Starting pipeline run"`).
2. Build: `GITHUB_TOKEN=unused docker compose build`.
3. Stop with `docker stop -t 30 job-ops`, then back up `jobs.db`, `jobs.db-wal` and `jobs.db-shm` from the `jobops-db` volume.
4. Start: `docker rm -f job-ops && GITHUB_TOKEN=unused docker compose up -d --no-build`.

## Development

Node 22 or later (24 works). From the repo root:

```bash
npm ci
npm --workspace orchestrator run dev
```

Tests: `npm --workspace orchestrator test`. Upstream's documentation still applies to most features: [jobops.dakheera47.com/docs](https://jobops.dakheera47.com/docs/).

## License

**AGPLv3 + Commons Clause**, inherited from upstream. You can self-host, use and modify JobOps freely. You cannot sell the software itself or offer paid hosted services whose value substantially comes from JobOps. See [LICENSE](LICENSE).

Original project built by [Shaheer Sarfaraz](https://github.com/DaKheera47/job-ops).
