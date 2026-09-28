import { z } from "zod";

export const planningEnvelopeSchema = z.object({
  stage: z.enum(["approach", "phase_titles", "phase_scope", "tasks", "details", "complete"]),
  status: z.string(),
  phaseDraft: z.array(z.string()).default([]),
  questionGroup: z.object({
    questions: z.array(z.object({
      id: z.string(),
      prompt: z.string(),
      multiple: z.boolean().default(false),
      options: z.array(z.object({ label: z.string(), recommended: z.boolean().optional() })).default([]),
      allowFreeText: z.boolean().default(true),
    })),
  }).optional(),
  applyPlan: z.boolean().default(false),
});

export type PlanningEnvelope = z.infer<typeof planningEnvelopeSchema>;
