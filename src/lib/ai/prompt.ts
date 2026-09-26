import type { ChatMessage } from "./types";
import type { Phase, Project, SkillConfig } from "../types";

/** How many past chat messages are sent as context (simple context window). */
export const CONTEXT_MESSAGE_LIMIT = 20;

const JSON_SCHEMA_GUIDE = `\`\`\`json
{
  "phases": [
    {
      "id": "existing phase id, or null for a new phase",
      "title": "Phase title",
      "description": "What this phase is for and what it covers; the slice definition",
      "notes": "Phase notes: dependencies, risks, decisions, what is out of scope",
      "status": "pending | in_progress | done",
      "tasks": [
        {
          "content": "Task title (short, imperative)",
          "description": "What this task does and how to implement it",
          "notes": "Research notes: findings, file/dir paths, library versions, decisions, gotchas",
          "done": false
        }
      ]
    }
  ]
}
\`\`\``;

const PLAN_STRUCTURE_GUIDE = `DETAILED PLAN STRUCTURE (fill each phase's content with these sections)
Every phase must be detailed enough to be pasted into a vibe coder on its own. Use this order and these headings (plain text or markdown):

- Goal: What works at the end of this slice; 1-3 bullets.
- Out of scope: What is NOT done in this phase (prevents accidental scope creep).
- Context: State coming from previous phases; the existing files and modules involved.
- Preconditions (PRECHECK): What must be verified before starting. If unmet, STOP and report.
- Work: Numbered, concrete tasks; each names the file path and the expected behavior.
- Constraints: Rules that must be followed (existing architecture, schema, naming, security).
- Data model / API: Tables, types and endpoints that change (if any).
- Tests: Tests to write and the scenarios they cover (happy path + edge cases).
- Acceptance criteria: Measurable, verifiable outcomes.
- Watch out: Common mistakes, traps, backwards compatibility.
- Output: The list of files to create/change.
- Verification (VERIFY): Commands to run (lint, typecheck, test) and manual checks.

Also:
- Give each phase 3-7 tasks, and write both a "description" (what to do + how) and "notes" (research note: file paths, library, decision, trap) for every task. Never leave the notes field empty.
- Do not just write a task title; the "description" field must be concrete enough to act on.
- When you are unsure, state your assumption explicitly in the phase notes.
- If needed, expand an existing phase: reuse that phase's id and enrich its content using this structure.`;

/**
 * Renders the active skills as a SKILLS section. Each skill's description tells
 * the model *when* to apply it, and the body is the instruction text itself.
 */
function buildSkillsSection(skills: SkillConfig[]): string {
  if (!skills.length) return "";
  const rendered = skills
    .map((skill) =>
      [
        `- ${skill.name} (/${skill.slug})`,
        skill.description ? `  When to use: ${skill.description}` : null,
        `  Instructions:\n${indent(skill.body)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return `\n\nSKILLS THE USER HAS ENABLED\nApply these instructions in addition to the rules above. They take precedence over the default style when they conflict. A skill may be invoked explicitly with /slug in a message.\n${rendered}`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

export function buildSystemPrompt(
  project: Project,
  phases: Phase[],
  locale: "tr" | "en",
  skills: SkillConfig[] = [],
): string {
  const language = locale === "tr" ? "Turkish" : "English";
  const phaseContext = phases.length
    ? phases
        .map((phase) => {
          const tasks = phase.tasks
            .map((task) => {
              const lines = [`      - [${task.done ? "x" : " "}] ${task.content}`];
              if (task.description) lines.push(`        description: ${task.description}`);
              if (task.notes) lines.push(`        notes: ${task.notes}`);
              return lines.join("\n");
            })
            .join("\n");
          return [
            `  - id: ${phase.id}`,
            `    title: ${phase.title}`,
            `    status: ${phase.status}`,
            phase.description ? `    description: ${phase.description}` : null,
            phase.notes ? `    notes: ${phase.notes}` : null,
            tasks ? `    tasks:\n${tasks}` : null,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n")
    : "  (no phases yet)";

  return `You are a senior product and software planning assistant. The user is preparing a project plan they will paste into a vibe coding tool (e.g. Dyad) step by step.

The project you are working on:
  Name: ${project.name}
  Description: ${project.description || "(none)"}

The project's current phases:
${phaseContext}

YOUR JOB
- Listen to the user's idea and write a fluent, concrete planning write-up.
- Split the plan into actionable phases. Every phase must be copyable on its own and pastable into a vibe coder.
- Language of the write-up: ${language}.
- Do not use markdown headings in the write-up; use short paragraphs and bullet points. Keep the chat easy to read.

${PLAN_STRUCTURE_GUIDE}

OUTPUT FORMAT (very important)
1. First write free-form prose (commentary, suggestions, things to watch out for).
2. At the VERY END of your answer add exactly one \`\`\`json code block. Do not use any other code block and do not mix the JSON into the prose.
3. The JSON must follow this schema:
${JSON_SCHEMA_GUIDE}

PHASE UPDATE RULES
- If you are changing an existing phase, reuse that phase's "id" EXACTLY.
- If you are adding a new phase, set "id": null.
- Do NOT delete phases. Never drop a phase from the answer to remove it; only add or update.
- Write the slice's purpose and scope briefly in the phase "description", and fill the "notes" field with the sections from the detailed plan structure above (goal, out of scope, context, preconditions, constraints, data model/API, tests, acceptance criteria, watch out, output, verification).
- Only provide "status" when it is meaningful; most of the time "pending" is correct.
- Give each phase 3-7 clear, verifiable tasks and fill each task's "description" and "notes" fields.
- If the user is only chatting (not asking for a plan), still end with a \`{"phases": []}\` block.${buildSkillsSection(skills)}`;
}

export function buildChatMessages(options: {
  project: Project;
  phases: Phase[];
  history: ChatMessage[];
  prompt: string;
  locale: "tr" | "en";
  skills?: SkillConfig[];
}): ChatMessage[] {
  const { project, phases, history, prompt, locale, skills } = options;
  return [
    {
      role: "system",
      content: buildSystemPrompt(project, phases, locale, skills ?? []),
    },
    ...history.slice(-CONTEXT_MESSAGE_LIMIT),
    { role: "user", content: prompt },
  ];
}
