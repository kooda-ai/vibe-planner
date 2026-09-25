"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/phases/copy-button";
import { PhaseStatusBadge } from "@/components/phases/phase-status-badge";
import { TaskList } from "@/components/phases/task-list";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPhase } from "@/lib/format-phase";
import { useI18n } from "@/lib/i18n";
import { PHASE_STATUSES, type Phase, type PhaseStatus, type Project } from "@/lib/types";

export function PhaseCard({
  project,
  phase,
  index,
  isFirst,
  isLast,
  dragHandleProps,
  isDragging,
  onUpdate,
  onDelete,
  onMove,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}: {
  project: Project;
  phase: Phase;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  onUpdate: (
    phaseId: string,
    patch: {
      title?: string;
      description?: string | null;
      notes?: string | null;
      status?: PhaseStatus;
    },
  ) => Promise<void>;
  onDelete: (phase: Phase) => void;
  onMove: (phaseId: string, direction: -1 | 1) => void;
  onAddTask: (phaseId: string, content: string) => Promise<void>;
  onToggleTask: (
    phaseId: string,
    taskId: string,
    done: boolean,
  ) => Promise<void>;
  onDeleteTask: (phaseId: string, taskId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [title, setTitle] = useState(phase.title);
  const [description, setDescription] = useState(phase.description ?? "");
  const [notes, setNotes] = useState(phase.notes ?? "");
  const [renaming, setRenaming] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTitle(phase.title), [phase.title]);
  useEffect(() => setDescription(phase.description ?? ""), [phase.description]);
  useEffect(() => setNotes(phase.notes ?? ""), [phase.notes]);
  useEffect(() => {
    if (renaming) titleRef.current?.focus();
  }, [renaming]);

  const tasks = phase.tasks;
  const doneTasks = tasks.filter((task) => task.done).length;
  const percent = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;

  async function commit(
    patch: Parameters<typeof onUpdate>[1],
    successMessage?: string,
  ) {
    try {
      await onUpdate(phase.id, patch);
      if (successMessage) toast.success(successMessage);
    } catch {
      toast.error(t.phases.saveFailed);
    }
  }

  function commitTitle() {
    const next = title.trim();
    setRenaming(false);
    if (!next || next === phase.title) {
      setTitle(phase.title);
      return;
    }
    void commit({ title: next });
  }

  return (
    <div
      className={
        "rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow " +
        (isDragging ? "opacity-60 shadow-lg" : "")
      }
      data-testid="phase-card"
      data-phase-id={phase.id}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          {...dragHandleProps}
          aria-label={phase.title}
          className="mt-1 cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
          data-testid="phase-drag-handle"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-1 text-muted-foreground hover:text-foreground"
          aria-label={phase.title}
          data-testid="phase-collapse-toggle"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Phase {index + 1}
            </span>
            <PhaseStatusBadge status={phase.status} />
            {tasks.length ? (
              <span className="text-xs text-muted-foreground">
                {doneTasks}/{tasks.length}
              </span>
            ) : null}
          </div>

          {renaming ? (
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitTitle();
                if (event.key === "Escape") {
                  setTitle(phase.title);
                  setRenaming(false);
                }
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="phase-title-input"
            />
          ) : (
            <h3
              className="mt-1 truncate text-sm font-semibold"
              title={phase.title}
              onDoubleClick={() => setRenaming(true)}
              data-testid="phase-title"
            >
              {phase.title || t.phases.untitled}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-1">
          <CopyButton
            text={formatPhase(project, phase, index, {
              tasks: t.phases.tasks,
              notes: t.phases.notes,
            })}
            label={t.phases.copy}
            successMessage={t.phases.copyPhaseDone.replace("{title}", phase.title)}
            testId="copy-phase-button"
          />

          <Select
            value={phase.status}
            onValueChange={(value) => void commit({ status: value as PhaseStatus })}
          >
            <SelectTrigger
              className="h-8 w-[38px] justify-center px-0 [&>span]:hidden [&>svg]:h-3.5 [&>svg]:w-3.5"
              aria-label={t.phases.statusLabel}
              data-testid="phase-status-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHASE_STATUSES.map((status) => (
                <SelectItem key={status} value={status} data-testid={`status-${status}`}>
                  {t.phases.status[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t.phases.menu.label}
                data-testid="phase-menu-trigger"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setRenaming(true)}
                data-testid="phase-menu-rename"
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t.phases.rename}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isFirst}
                onClick={() => onMove(phase.id, -1)}
                data-testid="phase-menu-move-up"
              >
                <ArrowUp className="mr-2 h-4 w-4" />
                {t.phases.menu.moveUp}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isLast}
                onClick={() => onMove(phase.id, 1)}
                data-testid="phase-menu-move-down"
              >
                <ArrowDown className="mr-2 h-4 w-4" />
                {t.phases.menu.moveDown}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(phase)}
                data-testid="phase-menu-delete"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t.phases.menu.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {tasks.length ? (
        <div className="px-3">
          <Progress value={percent} className="h-1" />
        </div>
      ) : null}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent>
          <div className="space-y-4 border-t p-3">
            <div className="grid gap-1.5">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onBlur={() => {
                  const next = description.trim() || null;
                  if (next !== (phase.description ?? null)) {
                    void commit({ description: next });
                  }
                }}
                placeholder={t.phases.descriptionPlaceholder}
                rows={2}
                className="text-sm"
                data-testid="phase-description-input"
              />
            </div>

            <TaskList
              phaseId={phase.id}
              tasks={tasks}
              onAdd={onAddTask}
              onToggle={(task, done) => onToggleTask(phase.id, task.id, done)}
              onDelete={(task) => onDeleteTask(phase.id, task.id)}
            />

            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t.phases.notes}
              </label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={() => {
                  const next = notes.trim() || null;
                  if (next !== (phase.notes ?? null)) {
                    void commit({ notes: next });
                  }
                }}
                placeholder={t.phases.notesPlaceholder}
                rows={3}
                className="text-sm"
                data-testid="phase-notes-input"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
