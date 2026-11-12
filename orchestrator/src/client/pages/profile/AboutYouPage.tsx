import { PageFrame } from "@client/components/PageFrame";
import { useDesignResume } from "@client/hooks/useDesignResume";
import { useSettings } from "@client/hooks/useSettings";
import { COVER_LETTER_STUDIO, RESUME_STUDIO_BASE } from "@client/lib/routes";
import { UserRound } from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";

/** Resume summaries are stored as HTML; show them as plain text. */
const htmlToText = (html: string): string => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
};

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="rounded-full bg-muted px-3 py-1 text-sm">{children}</li>
);

export const AboutYouPage: React.FC = () => {
  const { document, isLoading } = useDesignResume();
  const { settings } = useSettings();
  const json = document?.resumeJson;
  const basics = json?.basics;
  const headline = basics?.headline || basics?.name || "Your profile";
  const summary = htmlToText(json?.summary?.content ?? "");
  const strengths = (json?.sections?.skills?.items ?? [])
    .filter((item) => !item.hidden && item.name)
    .map((item) => item.name);
  const targets = settings?.searchTerms?.value ?? [];

  return (
    <PageFrame
      icon={UserRound}
      title="About you"
      subtitle="Who you are and what you're aiming for"
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !document ? (
        <section className="rounded-xl border bg-card p-6">
          <p className="text-sm">Your profile is built from your resume.</p>
          <Link
            to={RESUME_STUDIO_BASE}
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            Import your resume in Document Studio
          </Link>
        </section>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border bg-card p-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              {headline}
            </h2>
            {basics?.location ? (
              <p className="text-sm text-muted-foreground">{basics.location}</p>
            ) : null}
            {summary ? (
              <p className="max-w-3xl text-sm leading-relaxed">{summary}</p>
            ) : null}
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-3 rounded-xl border bg-card p-5">
              <h3 className="text-base font-semibold">Core strengths</h3>
              {strengths.length ? (
                <ul className="flex flex-wrap gap-2">
                  {strengths.map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add skills in your resume.
                </p>
              )}
            </section>
            <section className="space-y-3 rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Target roles</h3>
                <Link
                  to="/jobs/ready"
                  className="text-sm text-primary hover:underline"
                >
                  Edit in Jobs
                </Link>
              </div>
              {targets.length ? (
                <ul className="flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Set search terms on the Jobs page.
                </p>
              )}
            </section>
          </div>
        </>
      )}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-5">
        <div>
          <p className="font-medium">Your documents are built from this page</p>
          <p className="text-sm text-muted-foreground">
            Change your resume and every tailored copy starts from it.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={RESUME_STUDIO_BASE}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            Open resume
          </Link>
          <Link
            to={COVER_LETTER_STUDIO}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            Cover letter voice
          </Link>
        </div>
      </section>
    </PageFrame>
  );
};
