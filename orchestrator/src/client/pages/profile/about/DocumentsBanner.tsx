import { COVER_LETTER_STUDIO, RESUME_STUDIO_BASE } from "@client/lib/routes";
import type React from "react";
import { Link } from "react-router-dom";

export const DocumentsBanner: React.FC = () => (
  <section className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius) border border-dashed p-5">
    <div>
      <p className="font-medium">Your documents are built from this page</p>
      <p className="text-sm text-muted-foreground">
        Change something here and the base resume and cover-letter defaults pick
        it up.
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Link
        to={RESUME_STUDIO_BASE}
        className="rounded-(--radius-button) border px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        Open resume
      </Link>
      <Link
        to={COVER_LETTER_STUDIO}
        className="rounded-(--radius-button) border px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        Cover letter voice
      </Link>
    </div>
  </section>
);
