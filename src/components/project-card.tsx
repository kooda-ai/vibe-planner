"use client";

import { ArrowRight, ListChecks } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";
import type { ProjectSummary } from "@/lib/types";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const { tr, locale } = useI18n();
  const total = project.phaseCount;
  const percent = total ? Math.round((project.doneCount / total) * 100) : 0;

  const updated = new Date(project.updatedAt).toLocaleDateString(
    locale === "tr" ? "tr-TR" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block focus:outline-none"
      data-testid="project-card"
    >
      <Card className="h-full transition-colors group-hover:border-primary/50 group-focus-visible:border-primary">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold" data-testid="project-card-name">
                {project.name}
              </h3>
              {project.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {project.description}
                </p>
              ) : null}
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                {total
                  ? tr("projectCard.progress", {
                      done: project.doneCount,
                      total,
                    })
                  : tr("projectCard.noPhases")}
              </span>
              <span data-testid="project-card-percent">{percent}%</span>
            </div>
            <Progress value={percent} className="h-2" />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span data-testid="project-card-tasks">
              {tr("projectCard.taskProgress", {
                done: project.doneTaskCount,
                total: project.taskCount,
              })}
            </span>
            <span>{tr("projectCard.updated", { date: updated })}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
