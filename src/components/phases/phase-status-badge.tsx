"use client";

import { Circle, CircleCheck, CircleDashed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { PhaseStatus } from "@/lib/types";

const STYLES: Record<PhaseStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400",
  done: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const ICONS: Record<PhaseStatus, typeof Circle> = {
  pending: CircleDashed,
  in_progress: Circle,
  done: CircleCheck,
};

export function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  const { t } = useI18n();
  const Icon = ICONS[status];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", STYLES[status])}
      data-testid="phase-status-badge"
      data-status={status}
    >
      <Icon className="h-3 w-3" />
      {t.phases.status[status]}
    </Badge>
  );
}
