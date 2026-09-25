"use client";

import { ArrowLeft, MoreVertical, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ChatPanel } from "@/components/chat/chat-panel";
import { PhaseList } from "@/components/phases/phase-list";
import type { TaskPatch } from "@/components/phases/task-list";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createPhase,
  createTask,
  deletePhase,
  deleteProject,
  deleteTask,
  fetchProject,
  fetchSettings,
  reorderPhases,
  updatePhase,
  updateProject,
  updateTask,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Phase, PhaseStatus, ProjectDetail } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const { t } = useI18n();
  const isMobile = useIsMobile();

  const [data, setData] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [hasProvider, setHasProvider] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [tab, setTab] = useState("chat");

  const load = useCallback(async () => {
    try {
      const detail = await fetchProject(projectId);
      setData(detail);
      setEditName(detail.project.name);
      setEditDescription(detail.project.description ?? "");
      setNotFound(false);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const reloadPhases = useCallback(async () => {
    try {
      const detail = await fetchProject(projectId);
      setData((prev) => (prev ? { ...prev, phases: detail.phases } : detail));
    } catch {
      // Ignore; the next explicit action will surface the error.
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchSettings()
      .then((settings) =>
        setHasProvider(
          settings.providers.some((provider) => provider.hasApiKey),
        ),
      )
      .catch(() => setHasProvider(false));
  }, []);

  function replacePhases(phases: Phase[]) {
    setData((prev) => (prev ? { ...prev, phases } : prev));
  }

  async function handleAddPhase() {
    const { phase } = await createPhase(projectId, {
      title: t.phases.newPhaseTitle,
    });
    setData((prev) =>
      prev ? { ...prev, phases: [...prev.phases, { ...phase, tasks: [] }] } : prev,
    );
  }

  async function handleUpdatePhase(
    phaseId: string,
    patch: {
      title?: string;
      description?: string | null;
      notes?: string | null;
      status?: PhaseStatus;
    },
  ) {
    const { phase } = await updatePhase(phaseId, patch);
    setData((prev) =>
      prev
        ? {
            ...prev,
            phases: prev.phases.map((item) =>
              item.id === phaseId ? { ...phase, tasks: phase.tasks } : item,
            ),
          }
        : prev,
    );
  }

  async function handleDeletePhase(phaseId: string) {
    await deletePhase(phaseId);
    setData((prev) =>
      prev
        ? { ...prev, phases: prev.phases.filter((item) => item.id !== phaseId) }
        : prev,
    );
    await reloadPhases();
  }

  function handleMovePhase(phaseId: string, direction: -1 | 1) {
    if (!data) return;
    const index = data.phases.findIndex((item) => item.id === phaseId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= data.phases.length) {
      toast.error(
        direction === -1 ? t.phases.moveUpFirst : t.phases.moveDownLast,
      );
      return;
    }
    const next = [...data.phases];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    replacePhases(next.map((item, i) => ({ ...item, order: i })));
    void reorderPhases(
      projectId,
      next.map((item) => item.id),
    ).catch(() => {
      toast.error(t.phases.reorderFailed);
      void reloadPhases();
    });
  }

  async function handleReorder(ids: string[]) {
    const ordered = ids
      .map((id, index) => {
        const phase = data?.phases.find((item) => item.id === id);
        return phase ? { ...phase, order: index } : null;
      })
      .filter((phase): phase is Phase => Boolean(phase));
    replacePhases(ordered);
    await reorderPhases(projectId, ids);
  }

  async function handleAddTask(phaseId: string, content: string) {
    const { task } = await createTask(phaseId, { content });
    setData((prev) =>
      prev
        ? {
            ...prev,
            phases: prev.phases.map((item) =>
              item.id === phaseId
                ? { ...item, tasks: [...item.tasks, task] }
                : item,
            ),
          }
        : prev,
    );
  }

  async function handleUpdateTask(
    phaseId: string,
    taskId: string,
    patch: TaskPatch,
  ) {
    const { task } = await updateTask(taskId, patch);
    setData((prev) =>
      prev
        ? {
            ...prev,
            phases: prev.phases.map((item) =>
              item.id === phaseId
                ? {
                    ...item,
                    tasks: item.tasks.map((current) =>
                      current.id === taskId ? task : current,
                    ),
                  }
                : item,
            ),
          }
        : prev,
    );
  }

  async function handleToggleTask(phaseId: string, taskId: string, done: boolean) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            phases: prev.phases.map((item) =>
              item.id === phaseId
                ? {
                    ...item,
                    tasks: item.tasks.map((task) =>
                      task.id === taskId ? { ...task, done } : task,
                    ),
                  }
                : item,
            ),
          }
        : prev,
    );
    try {
      await updateTask(taskId, { done });
    } catch {
      toast.error(t.phases.saveFailed);
      await reloadPhases();
    }
  }

  async function handleDeleteTask(phaseId: string, taskId: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            phases: prev.phases.map((item) =>
              item.id === phaseId
                ? { ...item, tasks: item.tasks.filter((task) => task.id !== taskId) }
                : item,
            ),
          }
        : prev,
    );
    try {
      await deleteTask(taskId);
    } catch {
      toast.error(t.phases.saveFailed);
      await reloadPhases();
    }
  }

  async function saveProjectEdits() {
    if (!editName.trim()) {
      toast.error(t.createProject.nameRequired);
      return;
    }
    try {
      const { project } = await updateProject(projectId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setData((prev) => (prev ? { ...prev, project } : prev));
      setEditing(false);
      toast.success(t.project.updated);
    } catch {
      toast.error(t.project.renameFailed);
    }
  }

  async function removeProject() {
    try {
      await deleteProject(projectId);
      toast.success(t.project.deleted);
      router.push("/");
    } catch {
      toast.error(t.common.error);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1800px] space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[70vh] rounded-xl" />
          <Skeleton className="h-[70vh] rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <h1 className="text-lg font-semibold">{t.project.notFound}</h1>
        <Button asChild variant="outline">
          <Link href="/">{t.project.back}</Link>
        </Button>
      </div>
    );
  }

  const { project, phases, messages } = data;

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="icon" asChild aria-label={t.project.back}>
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <h1
          className="truncate text-lg font-semibold tracking-tight"
          data-testid="project-title"
        >
          {project.name}
        </h1>
        {project.description ? (
          <p className="truncate text-xs text-muted-foreground">
            {project.description}
          </p>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t.project.editProject}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)} data-testid="edit-project">
            <Pencil className="mr-2 h-4 w-4" />
            {t.project.editProject}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              window.open(`/api/projects/${projectId}/export`, "_blank")
            }
            data-testid="export-project"
          >
            {t.project.export}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDeleteProject(true)}
            data-testid="delete-project"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t.project.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const phaseList = (
    <PhaseList
      project={project}
      phases={phases}
      onAddPhase={handleAddPhase}
      onUpdatePhase={handleUpdatePhase}
      onDeletePhase={handleDeletePhase}
      onMovePhase={handleMovePhase}
      onReorder={handleReorder}
      onAddTask={handleAddTask}
      onUpdateTask={handleUpdateTask}
      onToggleTask={handleToggleTask}
      onDeleteTask={handleDeleteTask}
    />
  );

  const chatPanel = (
    <ChatPanel
      projectId={projectId}
      projectName={project.name}
      messages={messages}
      loading={false}
      hasProvider={hasProvider}
      onPlanApplied={reloadPhases}
    />
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b px-4 py-3">{header}</div>

      {isMobile ? (
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat" data-testid="tab-chat">
                {t.project.tabsChat}
              </TabsTrigger>
              <TabsTrigger value="phases" data-testid="tab-phases">
                {t.project.tabsPhases}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="chat" className="mt-3 min-h-0 flex-1">
            {chatPanel}
          </TabsContent>
          <TabsContent value="phases" className="mt-3 min-h-0 flex-1">
            {phaseList}
          </TabsContent>
        </Tabs>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={45} minSize={28}>
            {chatPanel}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={55} minSize={30}>
            {phaseList}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.project.editTitle}</DialogTitle>
            <DialogDescription>{t.createProject.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">{t.createProject.name}</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                data-testid="edit-project-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">
                {t.createProject.projectDescription}
              </Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                data-testid="edit-project-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void saveProjectEdits()} data-testid="save-project">
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteProject} onOpenChange={setConfirmDeleteProject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.project.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.project.deleteDescription.replace("{name}", project.name)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void removeProject()}
              data-testid="confirm-delete-project"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
