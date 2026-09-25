"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

export function TaskList({
  phaseId,
  tasks,
  onAdd,
  onToggle,
  onDelete,
}: {
  phaseId: string;
  tasks: Task[];
  onAdd: (phaseId: string, content: string) => Promise<void>;
  onToggle: (task: Task, done: boolean) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

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
          <li key={task.id} className="group flex items-start gap-2 py-0.5">
            <Checkbox
              id={`task-${task.id}`}
              checked={task.done}
              disabled={pendingId === task.id}
              onCheckedChange={(value) => void toggle(task, Boolean(value))}
              className="mt-0.5"
              data-testid="task-checkbox"
            />
            <label
              htmlFor={`task-${task.id}`}
              className={cn(
                "min-w-0 flex-1 cursor-pointer text-sm leading-5",
                task.done && "text-muted-foreground line-through",
              )}
            >
              {task.content}
            </label>
            <button
              type="button"
              onClick={() => void onDelete(task)}
              aria-label={t.phases.removeTask}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              data-testid="delete-task"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </li>
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
