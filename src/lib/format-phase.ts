import type { Phase, Project, Task } from "./types";

export interface FormatLabels {
  tasks: string;
  notes: string;
  description: string;
}

const DEFAULT_LABELS: FormatLabels = {
  tasks: "Tasks",
  notes: "Notes",
  description: "Description",
};

/** Indents a multi-line block so it stays nested under its list item. */
function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? prefix + line : ""))
    .join("\n");
}

function formatTask(task: Task, labels: FormatLabels): string {
  const lines = [`- [${task.done ? "x" : " "}] ${task.content}`];
  if (task.description?.trim()) {
    lines.push(indent(`${labels.description}: ${task.description.trim()}`, "  "));
  }
  if (task.notes?.trim()) {
    lines.push(indent(`${labels.notes}: ${task.notes.trim()}`, "  "));
  }
  return lines.join("\n");
}

function formatTasks(tasks: Task[], labels: FormatLabels): string {
  if (!tasks.length) return "";
  return [`${labels.tasks}:`, ...tasks.map((task) => formatTask(task, labels))].join(
    "\n",
  );
}

/**
 * Renders a single phase in the copy template:
 *
 *   # Project name
 *
 *   ## Phase 1: Title
 *
 *   Description
 *
 *   Tasks:
 *   - [ ] Todo
 *     Description: ...
 *     Notes: ...
 *   - [x] Done
 *
 *   Notes:
 *   ...
 */
export function formatPhase(
  project: Pick<Project, "name">,
  phase: Phase,
  index: number,
  labels: FormatLabels = DEFAULT_LABELS,
): string {
  const blocks: string[] = [
    `# ${project.name}`,
    "",
    `## Phase ${index + 1}: ${phase.title}`,
  ];

  if (phase.description?.trim()) {
    blocks.push("", phase.description.trim());
  }

  const tasks = formatTasks(phase.tasks, labels);
  if (tasks) blocks.push("", tasks);

  if (phase.notes?.trim()) {
    blocks.push("", `${labels.notes}:`, phase.notes.trim());
  }

  return blocks.join("\n");
}

/** Concatenates every phase into one document, sharing the `# project` heading. */
export function formatAllPhases(
  project: Pick<Project, "name">,
  phases: Phase[],
  labels: FormatLabels = DEFAULT_LABELS,
): string {
  if (!phases.length) return "";
  return phases
    .map((phase, index) => formatPhase(project, phase, index, labels))
    .join("\n\n---\n\n");
}
