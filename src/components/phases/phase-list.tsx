"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/phases/copy-button";
import { PhaseCard } from "@/components/phases/phase-card";
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
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatAllPhases } from "@/lib/format-phase";
import { useI18n } from "@/lib/i18n";
import type { Phase, PhaseStatus, Project } from "@/lib/types";

interface PhaseListProps {
  project: Project;
  phases: Phase[];
  onAddPhase: () => Promise<void>;
  onUpdatePhase: (
    phaseId: string,
    patch: {
      title?: string;
      description?: string | null;
      notes?: string | null;
      status?: PhaseStatus;
    },
  ) => Promise<void>;
  onDeletePhase: (phaseId: string) => Promise<void>;
  onMovePhase: (phaseId: string, direction: -1 | 1) => void;
  onReorder: (ids: string[]) => Promise<void>;
  onAddTask: (phaseId: string, content: string) => Promise<void>;
  onUpdateTask: (
    phaseId: string,
    taskId: string,
    patch: TaskPatch,
  ) => Promise<void>;
  onToggleTask: (phaseId: string, taskId: string, done: boolean) => Promise<void>;
  onDeleteTask: (phaseId: string, taskId: string) => Promise<void>;
}

export function PhaseList(props: PhaseListProps) {
  const {
    project,
    phases,
    onAddPhase,
    onDeletePhase,
    onMovePhase,
    onReorder,
    onDeleteTask,
    onUpdateTask,
    onToggleTask,
    onAddTask,
    onUpdatePhase,
  } = props;

  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Phase | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = phases.findIndex((phase) => phase.id === active.id);
    const newIndex = phases.findIndex((phase) => phase.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(phases, oldIndex, newIndex);
    try {
      await onReorder(next.map((phase) => phase.id));
    } catch {
      toast.error(t.phases.reorderFailed);
    }
  }

  async function handleAdd() {
    setAdding(true);
    try {
      await onAddPhase();
    } catch {
      toast.error(t.phases.saveFailed);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="phase-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t.phases.title}</h2>
          <p className="text-xs text-muted-foreground">
            {t.phases.taskProgress
              .replace(
                "{done}",
                String(phases.filter((phase) => phase.status === "done").length),
              )
              .replace("{total}", String(phases.length))}
          </p>
        </div>
        <CopyButton
          text={formatAllPhases(project, phases, {
            tasks: t.phases.tasks,
            notes: t.phases.notes,
            description: t.phases.description,
          })}
          label={t.phases.copyAll}
          successMessage={t.phases.copyAllDone}
          testId="copy-all-button"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {phases.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {t.phases.empty}
              </CardContent>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={phases.map((phase) => phase.id)}
                strategy={verticalListSortingStrategy}
              >
                {phases.map((phase, index) => (
                  <SortablePhaseCard
                    key={phase.id}
                    project={project}
                    phase={phase}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === phases.length - 1}
                    onUpdate={onUpdatePhase}
                    onDelete={setPendingDelete}
                    onMove={onMovePhase}
                    onAddTask={onAddTask}
                    onUpdateTask={onUpdateTask}
                    onToggleTask={onToggleTask}
                    onDeleteTask={onDeleteTask}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => void handleAdd()}
            disabled={adding}
            data-testid="add-phase-button"
          >
            {adding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {t.phases.addPhase}
          </Button>
        </div>
      </ScrollArea>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.phases.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.phases.deleteDescription.replace(
                "{title}",
                pendingDelete?.title ?? "",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  await onDeletePhase(pendingDelete.id);
                  toast.success(t.phases.deleted);
                } catch {
                  toast.error(t.phases.saveFailed);
                }
                setPendingDelete(null);
              }}
              data-testid="confirm-delete-phase"
            >
              {t.phases.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortablePhaseCard({
  project,
  phase,
  index,
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMove,
  onAddTask,
  onUpdateTask,
  onToggleTask,
  onDeleteTask,
}: {
  project: Project;
  phase: Phase;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: PhaseListProps["onUpdatePhase"];
  onDelete: (phase: Phase) => void;
  onMove: (phaseId: string, direction: -1 | 1) => void;
  onAddTask: PhaseListProps["onAddTask"];
  onUpdateTask: PhaseListProps["onUpdateTask"];
  onToggleTask: PhaseListProps["onToggleTask"];
  onDeleteTask: PhaseListProps["onDeleteTask"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: phase.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <PhaseCard
        project={project}
        phase={phase}
        index={index}
        isFirst={isFirst}
        isLast={isLast}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onMove={onMove}
        onAddTask={onAddTask}
        onUpdateTask={onUpdateTask}
        onToggleTask={(phaseId, taskId, done) => onToggleTask(phaseId, taskId, done)}
        onDeleteTask={(phaseId, taskId) => onDeleteTask(phaseId, taskId)}
      />
    </div>
  );
}
