import type React from "react";

export const SectionHeader: React.FC<{
  index: string;
  title: string;
  id: string;
  children?: React.ReactNode;
}> = ({ index, title, id, children }) => (
  <div className="mb-4 flex items-baseline justify-between gap-4">
    <h2 id={id} className="flex items-baseline gap-3">
      <span className="font-mono text-xs text-muted-foreground">{index}</span>
      <span className="font-heading text-[length:calc(var(--heading-size)-4px)] font-(weight:--heading-weight) leading-tight tracking-tight">
        {title}
      </span>
    </h2>
    {children}
  </div>
);
