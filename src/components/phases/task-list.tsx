"use client";

import { ChevronDown, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

export type TaskPatch = {
  content?: string;
  description?: string | null;
  notes?: string | null;
  done?: boolean;
};

export function TaskList({
  phaseId,
  tasks,
  onAdd,
  onUpdate,
  onToggle,
  onDelete,
}: {
  phaseId: string;
  tasks: Task[];
  onAdd: (phaseId: string, content: string) => Promise<void>;
  onUpdate: (phaseId: string, taskId: string, patch: TaskPatch) => Promise<void>;
  onToggle: (task: Task, done: boolean) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      await onAdd(phaseId, content);
      setDraft("");
    } catch {
      toast.error(t.phases.saveFailed);
    } finally {
      setAdding(false);
    }
  }

  async function toggle(task: Task, done: boolean) {
    setPendingId(task.id);
    try {
      await onToggle(task, done);
    } catch {
      toast.error(t.phases.saveFailed);
    } finally {
      setPendingId(null);
    }
  }

  async function save(task: Task, patch: TaskPatch) {
    setPendingId(task.id);
    try {
      await onUpdate(phaseId, task.id, patch);
      setExpandedId(null);
      toast.success(t.phases.taskSaved);
    } catch {
      toast.error(t.phases.saveFailed);
    } finally {
      setPendingId(null);
    }
  }

  const done = tasks.filter((task) => task.done).length;

  return (
    <div className="space-y-2" data-testid="task-list">
      {tasks.length ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t.phases.tasks}</span>
          <span data-testid="task-progress">
            {t.phases.taskProgress
              .replace("{done}", String(done))
              .replace("{total}", String(tasks.length))}
          </span>
        </div>
      ) : null}

      <ul className="space-y-1">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            open={expandedId === task.id}
            busy={pendingId === task.id}
            onToggleOpen={() =>
              setExpandedId((current) => (current === task.id ? null : task.id))
            }
            onToggle={(value) => void toggle(task, value)}
            onDelete={() => void onDelete(task)}
            onSave={(patch) => void save(task, patch)}
          />
        ))}
      </ul>

      <form onSubmit={add} className="flex items-center gap-2 pt-1">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t.phases.taskPlaceholder}
          className="h-8 text-sm"
          data-testid="new-task-input"
        />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={!draft.trim() || adding}
          aria-label={t.phases.addTask}
          data-testid="add-task-button"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

function TaskRow({
  task,
  open,
  busy,
  onToggleOpen,
  onToggle,
  onDelete,
  onSave,
}: {
  task: Task;
  open: boolean;
  busy: boolean;
  onToggleOpen: () => void;
  onToggle: (done: boolean) => void;
  onDelete: () => void;
  onSave: (patch: TaskPatch) => void;
}) {
  const { t } = useI18n();
  const [description, setDescription] = useState(task.description ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const hasDetails = Boolean(task.description?.trim() || task.notes?.trim());

  function openEditor() {
    setDescription(task.description ?? "");
    setNotes(task.notes ?? "");
    onToggleOpen();
  }

  return (
    <li className="rounded-md py-0.5" data-testid="task-item">
      <div className="group flex items-start gap-2">
        <Checkbox
          id={`task-${task.id}`}
          checked={task.done}
          disabled={busy}
          onCheckedChange={(value) => onToggle(Boolean(value))}
          className="mt-0.5"
          data-testid="task-checkbox"
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`task-${task.id}`}
            className={cn(
              "cursor-pointer text-sm leading-5",
              task.done && "text-muted-foreground line-through",
            )}
          >
            {task.content}
          </label>

          {task.description?.trim() ? (
            <p
              className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground"
              data-testid="task-description"
            >
              {task.description}
            </p>
          ) : null}
          {task.notes?.trim() ? (
            <p
              className="mt-1 whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground"
              data-testid="task-notes"
            >
              {task.notes}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={openEditor}
          aria-label={t.phases.taskDetails}
          title={t.phases.taskDetails}
          className={cn(
            "mt-0.5 transition-opacity focus-visible:opacity-100",
            hasDetails
              ? "text-muted-foreground hover:text-foreground"
              : "opacity-0 group-hover:opacity-100",
          )}
          data-testid="task-details-toggle"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={onDelete}
          aria-label={t.phases.removeTask}
          className="mt-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          data-testid="delete-task"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>

      {open ? (
        <div
          className="mt-2 space-y-2 rounded-md border border-dashed p-2"
          data-testid="task-details-editor"
        >
          <div className="grid gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t.phases.taskDescription}
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t.phases.taskDescriptionPlaceholder}
              rows={2}
              className="text-sm"
              data-testid="task-description-input"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t.phases.taskNotes}
            </label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t.phases.taskNotesPlaceholder}
              rows={3}
              className="text-sm"
              data-testid="task-notes-input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onToggleOpen}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                onSave({
                  description: description.trim() || null,
                  notes: notes.trim() || null,
                })
              }
              data-testid="save-task-details"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t.common.save}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
