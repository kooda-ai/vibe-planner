"use client";

import { FolderOpen, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CreateProjectDialog } from "@/components/create-project-dialog";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchProjects } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ProjectSummary } from "@/lib/types";

export default function DashboardPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchProjects();
      setProjects(data.projects);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="dashboard-title">
            {t.dashboard.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t.dashboard.subtitle}
          </p>
        </div>
        <CreateProjectDialog onCreated={load} />
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {t.dashboard.loadError}
              </p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                {t.common.retry}
              </Button>
            </CardContent>
          </Card>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Sparkles className="h-6 w-6 text-muted-foreground" />
              </span>
              <h2 className="text-lg font-medium">{t.dashboard.emptyTitle}</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {t.dashboard.emptyDescription}
              </p>
              <CreateProjectDialog onCreated={load} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>

      <footer className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <FolderOpen className="h-3.5 w-3.5" />
        {t.app.tagline}
      </footer>
    </div>
  );
}
