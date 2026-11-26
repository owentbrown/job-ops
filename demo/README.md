# Demo copy (fictional persona: Jordan Lee)

A separate copy of the app for showing in interviews. It has its own container,
port and database, and never touches your real jobs.

- **Open:** http://localhost:3006 (login in `demo/.build/credentials.txt`)
- **Start:** `docker compose -f demo/docker-compose.yml up -d`
- **Stop:** `docker compose -f demo/docker-compose.yml stop`
- **Rebuild from scratch:** `bash demo/build-demo.sh --reset` (about 10 minutes, a few cents of AI usage)

On your phone over Tailscale it's the same address as the real app, with port 3006 instead of 3005.

## The persona

**Jordan Lee**, Senior Product Manager in Toronto with 8 years in fintech and insurance.
Fictional employers: Maplewave Financial, Harbourline Insurance, Ledgerly, Bayfield Consulting.
All companies and jobs are made up. Links use `example.com` domains.

The app's own AI did the scoring, briefs, tailored résumés, cover letter and prep kits from this data,
so what you show is real output, not mock-ups.

## A 5-minute walkthrough

1. **Overview:** the funnel (applied, screening, interview, offer), what needs action, pace and reply rate.
2. **Jobs → To review:** scores from 90 down to 5. Open a high one (Arbor, 70) and a low one
   (Sparrow HR, 30: deep API work) to show the reasoning. The French-only Banque Westgate job is
   automatically scored 5.
3. **Filtered out:** jobs the free pre-filter dropped before any AI cost (titles, locations), with reasons.
4. **Jobs → To apply → Clearpath Wealth (88):** the brief, then the tailored résumé PDF and cover letter.
5. **Applications board:** every application by stage. Tidewater Mutual is at offer.
6. **Fernway Health (interview stage):** prep kit cards, notes ("Panel prep"), jots from the hiring
   manager call, timeline. Good moment to show "call mode" on the prep kit.
7. **Profile → About you:** brand line, proof points, profile strength, and the skill map:
   Lead with (cross-functional leadership, regulated financial services, data, onboarding),
   Prove these (team leadership: 63% of jobs ask, Jordan only lists it), Hidden strengths
   (pricing, vendor management, business cases…) and Nice to have (agile, technical fluency).

Live AI moments that work well (each costs a fraction of a cent):
- **Ask Ghostwriter** on any job ("What should I know before speaking with Fernway Health?").
- **Recalculate match** or **Rescore** on a job after editing it.
- **Add a job:** paste any real job posting text to show import and scoring live. (It stays in the demo.)

## Avoid during a demo

- **Company check** and the Glassdoor / Indeed / Reddit links: the companies are fictional, so searches come back empty.
- **Find jobs / Repeat last search:** runs a real job search and pulls real postings into the demo.
- **Emails / Inbox:** no mailbox is connected in the demo.
