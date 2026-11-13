import type {
  ProfileDataState,
  ProfileRoleInsight,
  RoleTag,
} from "@shared/types";
import type React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CardHeading, EmptyState, TOO_EARLY_COPY } from "./parts";
import { ScoreRing } from "./StrengthRing";

/** Tag fills use semantic pairs that are contrast-tested in every theme. */
const TAG_CLASS: Record<RoleTag, string> = {
  "Core fit": "border-transparent bg-success text-success-foreground",
  "Step up": "border-transparent bg-info text-info-foreground",
  Adjacent: "border-transparent bg-secondary text-secondary-foreground",
  Stretch: "border-transparent bg-warning text-warning-foreground",
};

/**
 * Jobs feed for a role family. The Jobs page does not filter by family yet;
 * the param is carried so it can.
 */
export const roleJobsHref = (familyId: string) =>
  `/jobs/ready?family=${encodeURIComponent(familyId)}`;

const RoleTile: React.FC<{ role: ProfileRoleInsight }> = ({ role }) => (
  <li className="flex flex-col gap-3 rounded-(--radius) border p-4">
    <div className="flex items-start gap-3">
      <ScoreRing
        value={role.fit}
        size="sm"
        label={`Fit ${Math.round(role.fit)} out of 100`}
      />
      <div className="min-w-0 space-y-1">
        <h3 className="font-heading font-(weight:--heading-weight) leading-tight">
          {role.label}
        </h3>
        <Badge className={cn("hover:opacity-90", TAG_CLASS[role.tag])}>
          {role.tag}
        </Badge>
      </div>
    </div>
    <dl className="space-y-1 text-sm">
      <div>
        <dt className="inline font-semibold">Why: </dt>
        <dd className="inline">{role.why}</dd>
      </div>
      <div>
        <dt className="inline font-semibold">Gap: </dt>
        <dd className="inline">{role.gap}</dd>
      </div>
    </dl>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">
        {role.openCount} open in your feed
      </span>
      {role.openCount > 0 ? (
        <Link
          to={roleJobsHref(role.familyId)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          See jobs<span className="sr-only"> for {role.label}</span>
        </Link>
      ) : null}
    </div>
  </li>
);

export const RolesCard: React.FC<{
  dataState: ProfileDataState;
  roles: ProfileRoleInsight[];
}> = ({ dataState, roles }) => {
  const scored = roles.reduce((sum, r) => sum + r.jobCount, 0);
  return (
    <Card aria-labelledby="about-roles">
      <CardContent className="space-y-4 pt-(--density-pad)">
        <CardHeading
          id="about-roles"
          title="Roles that fit you"
          subtitle={
            dataState === "ok" && roles.length
              ? `Grouped from ${scored} scored job${scored === 1 ? "" : "s"} in your searches`
              : undefined
          }
        />
        {dataState !== "ok" ? (
          <EmptyState>{TOO_EARLY_COPY}</EmptyState>
        ) : roles.length === 0 ? (
          <EmptyState>
            No clear role families yet. Run a few more searches and they'll show
            up here.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {roles.slice(0, 4).map((role) => (
              <RoleTile key={role.familyId} role={role} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
