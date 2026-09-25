import { z } from "zod";

import { splitAnswer } from "./plan-block";
import type { Plan, PlanPhase } from "./types";

const planTaskSchema = z.object({
  content: z.string(),
  description: z.string().nullish(),
  notes: z.string().nullish(),
  done: z.boolean().optional(),
});

const planPhaseSchema = z.object({
  id: z.string().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  notes: z.string().nullish(),
  status: z.enum(["pending", "in_progress", "done"]).optional(),
  tasks: z.array(planTaskSchema).optional(),
});

const planSchema = z.object({
  phases: z.array(planPhaseSchema),
});

/**
 * Extracts the plan from a full AI answer.
 *
 * Returns `plan: null` with `invalid: false` when the model simply chatted
 * (no JSON at all), and `invalid: true` when a JSON block was present but
 * unusable — in which case the caller must leave existing phases untouched.
 */
export function extractPlan(raw: string): {
  plan: Plan | null;
  invalid: boolean;
  body: string;
} {
  const { body, json } = splitAnswer(raw);
  if (!json) return { plan: null, invalid: false, body };

  const parsed = tryParse(json);
  if (!parsed) return { plan: null, invalid: true, body };

  const result = planSchema.safeParse(parsed);
  if (!result.success) return { plan: null, invalid: true, body };

  const phases: PlanPhase[] = result.data.phases
    .map((phase) => ({
      id: phase.id ?? null,
      title: phase.title.trim(),
      description: phase.description ?? null,
      notes: phase.notes ?? null,
      status: phase.status,
      tasks: (phase.tasks ?? [])
        .filter((task) => Boolean(task.content?.trim()))
        .map((task) => ({
          content: task.content.trim(),
          description: task.description?.trim() || null,
          notes: task.notes?.trim() || null,
          done: task.done,
        })),
    }))
    .filter((phase) => phase.title.length > 0);

  // A present-but-empty plan (`{"phases": []}`) is a valid chat-only answer.
  return { plan: { phases }, invalid: false, body };
}

function tryParse(text: string): unknown | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}
