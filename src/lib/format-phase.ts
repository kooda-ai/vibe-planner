import type { Phase, Project, Task } from "./types";

export interface FormatLabels {
  tasks: string;
  notes: string;
}

const DEFAULT_LABELS: FormatLabels = { tasks: "Görevler", notes: "Notlar" };

function formatTasks(tasks: Task[], labels: FormatLabels): string {
  if (!tasks.length) return "";
  return [
    `${labels.tasks}:`,
    ...tasks.map((task) => `- [${task.done ? "x" : " "}] ${task.content}`),
  ].join("\n");
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
