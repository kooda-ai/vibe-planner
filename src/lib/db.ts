import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  Message,
  Phase,
  PhaseStatus,
  Plan,
  Project,
  ProjectDetail,
  ProjectSummary,
  Task,
} from "./types";

/**
 * Single point of data access for the whole app.
 *
 * The plan targets Prisma + SQLite (see `prisma/schema.prisma`, which mirrors
 * this exact shape). Persistence is implemented here as a small JSON file
 * store instead, so the app also runs in sandboxes where the Prisma query
 * engine cannot be generated. Swapping the implementation below for Prisma
 * only requires keeping the exported function signatures stable.
 */

interface DBShape {
  projects: Project[];
  phases: Phase[];
  tasks: Task[];
  messages: Message[];
  settings: Record<string, string>;
}

const EMPTY_DB: DBShape = {
  projects: [],
  phases: [],
  tasks: [],
  messages: [],
  settings: {},
};

const DATA_FILE =
  process.env.PLANNER_DATA_FILE ??
  path.join(process.cwd(), ".data", "planner.json");

let cache: DBShape | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Serialises every read-modify-write cycle so concurrent requests can't clobber each other. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

async function load(): Promise<DBShape> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<DBShape>;
    cache = {
      projects: parsed.projects ?? [],
      phases: parsed.phases ?? [],
      // Older files predate the per-task notes/description columns.
      tasks: (parsed.tasks ?? []).map((task) => ({
        ...task,
        description: task.description ?? null,
        notes: task.notes ?? null,
      })),
      messages: parsed.messages ?? [],
      settings: parsed.settings ?? {},
    };
  } catch {
    cache = structuredClone(EMPTY_DB);
  }
  return cache;
}

async function persist(db: DBShape): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

/* -------------------------------------------------------------------------- */
/*                                  Projects                                  */
/* -------------------------------------------------------------------------- */

export function listProjects(): Promise<ProjectSummary[]> {
  return withLock(async () => {
    const db = await load();
    return [...db.projects]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((project) => {
        const phases = db.phases.filter((p) => p.projectId === project.id);
        const phaseIds = new Set(phases.map((p) => p.id));
        const tasks = db.tasks.filter((t) => phaseIds.has(t.phaseId));
        return {
          ...project,
          phaseCount: phases.length,
          doneCount: phases.filter((p) => p.status === "done").length,
          taskCount: tasks.length,
          doneTaskCount: tasks.filter((t) => t.done).length,
        };
      });
  });
}

export function createProject(input: {
  name: string;
  description?: string | null;
}): Promise<Project> {
  return withLock(async () => {
    const db = await load();
    const now = new Date().toISOString();
    const project: Project = {
      id: newId(),
      name: input.name,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
    db.projects.push(project);
    await persist(db);
    return { ...project };
  });
}

export function getProjectDetail(id: string): Promise<ProjectDetail | null> {
  return withLock(async () => {
    const db = await load();
    const project = db.projects.find((p) => p.id === id);
    if (!project) return null;
    return {
      project: { ...project },
      phases: collectPhases(db, id),
      messages: db.messages
        .filter((m) => m.projectId === id)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map((m) => ({ ...m })),
    };
  });
}

export function updateProject(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<Project | null> {
  return withLock(async () => {
    const db = await load();
    const project = db.projects.find((p) => p.id === id);
    if (!project) return null;
    if (patch.name !== undefined) project.name = patch.name;
    if (patch.description !== undefined) project.description = patch.description;
    project.updatedAt = new Date().toISOString();
    await persist(db);
    return { ...project };
  });
}

export function deleteProject(id: string): Promise<boolean> {
  return withLock(async () => {
    const db = await load();
    const exists = db.projects.some((p) => p.id === id);
    if (!exists) return false;
    const phaseIds = new Set(
      db.phases.filter((p) => p.projectId === id).map((p) => p.id),
    );
    db.projects = db.projects.filter((p) => p.id !== id);
    db.phases = db.phases.filter((p) => p.projectId !== id);
    db.tasks = db.tasks.filter((t) => !phaseIds.has(t.phaseId));
    db.messages = db.messages.filter((m) => m.projectId !== id);
    await persist(db);
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Phases                                   */
/* -------------------------------------------------------------------------- */

function collectPhases(db: DBShape, projectId: string): Phase[] {
  return db.phases
    .filter((p) => p.projectId === projectId)
    .sort((a, b) => a.order - b.order)
    .map((phase) => ({
      ...phase,
      tasks: db.tasks
        .filter((t) => t.phaseId === phase.id)
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ ...t })),
    }));
}

function nextPhaseOrder(db: DBShape, projectId: string): number {
  const orders = db.phases
    .filter((p) => p.projectId === projectId)
    .map((p) => p.order);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export function listPhases(projectId: string): Promise<Phase[]> {
  return withLock(async () => collectPhases(await load(), projectId));
}

export function createPhase(
  projectId: string,
  input: {
    title: string;
    description?: string | null;
    notes?: string | null;
    status?: PhaseStatus;
    tasks?: {
      content: string;
      description?: string | null;
      notes?: string | null;
      done?: boolean;
    }[];
  },
): Promise<Phase | null> {
  return withLock(async () => {
    const db = await load();
    if (!db.projects.some((p) => p.id === projectId)) return null;
    const now = new Date().toISOString();
    const phase: Phase = {
      id: newId(),
      projectId,
      order: nextPhaseOrder(db, projectId),
      title: input.title,
      description: input.description ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "pending",
      tasks: [],
      createdAt: now,
      updatedAt: now,
    };
    db.phases.push(phase);
    (input.tasks ?? []).forEach((task, index) => {
      if (!task.content?.trim()) return;
      db.tasks.push({
        id: newId(),
        phaseId: phase.id,
        order: index,
        content: task.content.trim(),
        description: task.description?.trim() || null,
        notes: task.notes?.trim() || null,
        done: Boolean(task.done),
      });
    });
    await touchProject(db, projectId);
    await persist(db);
    return collectPhases(db, projectId).find((p) => p.id === phase.id) ?? null;
  });
}

export function updatePhase(
  phaseId: string,
  patch: {
    title?: string;
    description?: string | null;
    notes?: string | null;
    status?: PhaseStatus;
    order?: number;
  },
): Promise<Phase | null> {
  return withLock(async () => {
    const db = await load();
    const phase = db.phases.find((p) => p.id === phaseId);
    if (!phase) return null;
    if (patch.title !== undefined) phase.title = patch.title;
    if (patch.description !== undefined) phase.description = patch.description;
    if (patch.notes !== undefined) phase.notes = patch.notes;
    if (patch.status !== undefined) phase.status = patch.status;
    if (patch.order !== undefined) phase.order = patch.order;
    phase.updatedAt = new Date().toISOString();
    await touchProject(db, phase.projectId);
    await persist(db);
    return collectPhases(db, phase.projectId).find((p) => p.id === phaseId) ?? null;
  });
}

export function deletePhase(phaseId: string): Promise<boolean> {
  return withLock(async () => {
    const db = await load();
    const phase = db.phases.find((p) => p.id === phaseId);
    if (!phase) return false;
    db.phases = db.phases.filter((p) => p.id !== phaseId);
    db.tasks = db.tasks.filter((t) => t.phaseId !== phaseId);
    collectPhases(db, phase.projectId).forEach((p, index) => {
      const stored = db.phases.find((x) => x.id === p.id);
      if (stored) stored.order = index;
    });
    await touchProject(db, phase.projectId);
    await persist(db);
    return true;
  });
}

export function reorderPhases(
  projectId: string,
  orderedIds: string[],
): Promise<Phase[]> {
  return withLock(async () => {
    const db = await load();
    const owned = db.phases.filter((p) => p.projectId === projectId);
    const position = new Map(orderedIds.map((id, index) => [id, index]));
    owned.forEach((phase, index) => {
      phase.order = position.get(phase.id) ?? orderedIds.length + index;
      phase.updatedAt = new Date().toISOString();
    });
    await touchProject(db, projectId);
    await persist(db);
    return collectPhases(db, projectId);
  });
}

/* -------------------------------------------------------------------------- */
/*                                    Tasks                                   */
/* -------------------------------------------------------------------------- */

export function createTask(
  phaseId: string,
  input: {
    content: string;
    description?: string | null;
    notes?: string | null;
    done?: boolean;
  },
): Promise<Task | null> {
  return withLock(async () => {
    const db = await load();
    const phase = db.phases.find((p) => p.id === phaseId);
    if (!phase || !input.content?.trim()) return null;
    const orders = db.tasks.filter((t) => t.phaseId === phaseId).map((t) => t.order);
    const task: Task = {
      id: newId(),
      phaseId,
      order: orders.length ? Math.max(...orders) + 1 : 0,
      content: input.content.trim(),
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      done: Boolean(input.done),
    };
    db.tasks.push(task);
    phase.updatedAt = new Date().toISOString();
    await touchProject(db, phase.projectId);
    await persist(db);
    return { ...task };
  });
}

export function updateTask(
  taskId: string,
  patch: {
    content?: string;
    description?: string | null;
    notes?: string | null;
    done?: boolean;
    order?: number;
  },
): Promise<Task | null> {
  return withLock(async () => {
    const db = await load();
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    if (patch.content !== undefined) task.content = patch.content;
    if (patch.description !== undefined) task.description = patch.description;
    if (patch.notes !== undefined) task.notes = patch.notes;
    if (patch.done !== undefined) task.done = patch.done;
    if (patch.order !== undefined) task.order = patch.order;
    const phase = db.phases.find((p) => p.id === task.phaseId);
    if (phase) {
      phase.updatedAt = new Date().toISOString();
      await touchProject(db, phase.projectId);
    }
    await persist(db);
    return { ...task };
  });
}

export function deleteTask(taskId: string): Promise<boolean> {
  return withLock(async () => {
    const db = await load();
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return false;
    db.tasks = db.tasks.filter((t) => t.id !== taskId);
    db.tasks
      .filter((t) => t.phaseId === task.phaseId)
      .sort((a, b) => a.order - b.order)
      .forEach((t, index) => {
        t.order = index;
      });
    const phase = db.phases.find((p) => p.id === task.phaseId);
    if (phase) await touchProject(db, phase.projectId);
    await persist(db);
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Messages                                  */
/* -------------------------------------------------------------------------- */

export function addMessage(input: {
  projectId: string;
  role: "user" | "assistant";
  content: string;
  phasesUpdated?: number;
}): Promise<Message> {
  return withLock(async () => {
    const db = await load();
    const message: Message = {
      id: newId(),
      projectId: input.projectId,
      role: input.role,
      content: input.content,
      createdAt: new Date().toISOString(),
    };
    if (input.phasesUpdated !== undefined) {
      message.phasesUpdated = input.phasesUpdated;
    }
    db.messages.push(message);
    await persist(db);
    return { ...message };
  });
}

/**
 * Applies an AI-produced plan: phases carrying a known `id` are updated in
 * place, unknown/new phases are appended. Nothing is ever deleted.
 */
export function applyPlan(
  projectId: string,
  plan: Plan,
): Promise<{ created: number; updated: number }> {
  return withLock(async () => {
    const db = await load();
    if (!db.projects.some((p) => p.id === projectId)) {
      return { created: 0, updated: 0 };
    }
    let created = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const item of plan.phases) {
      const title = item.title?.trim();
      if (!title) continue;
      const existing = item.id
        ? db.phases.find((p) => p.id === item.id && p.projectId === projectId)
        : undefined;

      if (existing) {
        existing.title = title;
        if (item.description !== undefined) existing.description = item.description;
        if (item.notes !== undefined) existing.notes = item.notes;
        if (item.status) existing.status = item.status;
        existing.updatedAt = now;
        if (item.tasks) {
          // Replace the checklist with the AI's version, preserving done flags
          // by task text so completed work is not lost. Notes the user wrote
          // are kept when the AI does not send new ones.
          const previous = db.tasks.filter((t) => t.phaseId === existing.id);
          const priorByContent = new Map(
            previous.map((t) => [t.content.trim().toLowerCase(), t]),
          );
          db.tasks = db.tasks.filter((t) => t.phaseId !== existing.id);
          item.tasks.forEach((task, index) => {
            const content = task.content?.trim();
            if (!content) return;
            const prior = priorByContent.get(content.toLowerCase());
            db.tasks.push({
              id: newId(),
              phaseId: existing.id,
              order: index,
              content,
              description: task.description?.trim() || prior?.description || null,
              notes: task.notes?.trim() || prior?.notes || null,
              done: task.done ?? prior?.done ?? false,
            });
          });
        }
        updated += 1;
      } else {
        const phase: Phase = {
          id: newId(),
          projectId,
          order: nextPhaseOrder(db, projectId),
          title,
          description: item.description ?? null,
          notes: item.notes ?? null,
          status: item.status ?? "pending",
          tasks: [],
          createdAt: now,
          updatedAt: now,
        };
        db.phases.push(phase);
        (item.tasks ?? []).forEach((task, index) => {
          const content = task.content?.trim();
          if (!content) return;
          db.tasks.push({
            id: newId(),
            phaseId: phase.id,
            order: index,
            content,
            description: task.description?.trim() || null,
            notes: task.notes?.trim() || null,
            done: Boolean(task.done),
          });
        });
        created += 1;
      }
    }

    if (created || updated) await touchProject(db, projectId);
    await persist(db);
    return { created, updated };
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

async function touchProject(db: DBShape, projectId: string): Promise<void> {
  const project = db.projects.find((p) => p.id === projectId);
  if (project) project.updatedAt = new Date().toISOString();
}

export function getSettingsRecord(): Promise<Record<string, string>> {
  return withLock(async () => ({ ...(await load()).settings }));
}

export function saveSettings(patch: Record<string, string>): Promise<void> {
  return withLock(async () => {
    const db = await load();
    db.settings = { ...db.settings, ...patch };
    await persist(db);
  });
}

/* -------------------------------------------------------------------------- */
/*                                Export / Import                             */
/* -------------------------------------------------------------------------- */

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  project: Project;
  phases: Phase[];
  messages: Message[];
}

export function exportProject(id: string): Promise<ExportBundle | null> {
  return withLock(async () => {
    const db = await load();
    const project = db.projects.find((p) => p.id === id);
    if (!project) return null;
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: { ...project },
      phases: collectPhases(db, id),
      messages: db.messages
        .filter((m) => m.projectId === id)
        .map((m) => ({ ...m })),
    };
  });
}

export function importProject(bundle: ExportBundle): Promise<Project> {
  return withLock(async () => {
    const db = await load();
    const now = new Date().toISOString();
    const project: Project = {
      id: newId(),
      name: bundle.project?.name?.trim() || "Imported project",
      description: bundle.project?.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
    db.projects.push(project);

    const phaseIdMap = new Map<string, string>();
    [...(bundle.phases ?? [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((phase, index) => {
        const phaseId = newId();
        phaseIdMap.set(phase.id, phaseId);
        db.phases.push({
          id: phaseId,
          projectId: project.id,
          order: index,
          title: phase.title || `Phase ${index + 1}`,
          description: phase.description ?? null,
          notes: phase.notes ?? null,
          status: phase.status ?? "pending",
          tasks: [],
          createdAt: now,
          updatedAt: now,
        });
        [...(phase.tasks ?? [])]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .forEach((task, taskIndex) => {
            if (!task.content?.trim()) return;
            db.tasks.push({
              id: newId(),
              phaseId,
              order: taskIndex,
              content: task.content,
              description: task.description?.trim() || null,
              notes: task.notes?.trim() || null,
              done: Boolean(task.done),
            });
          });
      });

    (bundle.messages ?? []).forEach((message) => {
      if (!message.content) return;
      db.messages.push({
        id: newId(),
        projectId: project.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        ...(message.phasesUpdated !== undefined
          ? { phasesUpdated: message.phasesUpdated }
          : {}),
        createdAt: message.createdAt ?? now,
      });
    });

    await persist(db);
    return { ...project };
  });
}
