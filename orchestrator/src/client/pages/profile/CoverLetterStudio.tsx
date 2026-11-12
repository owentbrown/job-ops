import { AppModeContext } from "@client/components/layout";
import { PageFrame } from "@client/components/PageFrame";
import { SignatureCard } from "@client/components/SignatureCard";
import { useSettings } from "@client/hooks/useSettings";
import { FileText } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";

export const CoverLetterStudio: React.FC<{ switcher: React.ReactNode }> = ({
  switcher,
}) => {
  const { settings, isLoading } = useSettings();
  const { appMode } = React.useContext(AppModeContext);
  const tone = settings?.chatStyleTone?.value || "Not set";
  const formality = settings?.chatStyleFormality?.value || "Not set";
  const doNotUse = settings?.chatStyleDoNotUse?.value || "Nothing yet";

  return (
    <PageFrame
      icon={FileText}
      title="Document Studio"
      subtitle="The base documents every application starts from"
    >
      {switcher}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Your voice</h2>
            <p className="text-sm text-muted-foreground">
              Used for all AI writing: cover letters, chat and tailoring.
            </p>
          </div>
          <Link
            to="/settings#chat"
            className="text-sm text-primary hover:underline"
          >
            Edit voice
          </Link>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Tone</dt>
              <dd className="font-medium">{tone}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Formality</dt>
              <dd className="font-medium">{formality}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Never say</dt>
              <dd className="font-medium">{doNotUse}</dd>
            </div>
          </dl>
        )}
      </section>
      {appMode !== "hosted" ? (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold">Signature</h2>
          <SignatureCard />
        </section>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Letters are written per job. Open a job and use its Cover letter tab.
      </p>
    </PageFrame>
  );
};
