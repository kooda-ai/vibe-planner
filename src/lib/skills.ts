import type { SkillConfig } from "./types";

/** Maximum length of a derived slug; keeps `/slash` commands readable. */
const MAX_SLUG_LENGTH = 40;

/**
 * Turns a skill name into a lowercase slug usable as a `/slash` command.
 * Non-ASCII characters are folded where possible, then anything left that is
 * not `a-z0-9` becomes a dash.
 */
export function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii.slice(0, MAX_SLUG_LENGTH) || "skill";
}

/**
 * Picks a slug that is not taken yet, appending `-2`, `-3`, … when needed so
 * two skills can never collide on the same `/slash` command.
 */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

const SLASH = /(^|\s)\/([a-z0-9][a-z0-9-]*)/gi;

/**
 * Finds `/slug` invocations in a chat message and returns the matching skills,
 * de-duplicated and in the order they were written. Unknown slugs are ignored
 * (they stay in the prompt as ordinary text).
 */
export function findSlashSkills(
  prompt: string,
  skills: SkillConfig[],
): SkillConfig[] {
  const found: SkillConfig[] = [];
  SLASH.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLASH.exec(prompt)) !== null) {
    const slug = match[2].toLowerCase();
    const skill = skills.find((candidate) => candidate.slug === slug);
    if (skill && !found.some((item) => item.id === skill.id)) found.push(skill);
  }
  return found;
}

/**
 * The skills that apply to a chat turn: the project's selection (or every
 * enabled skill when the project has no explicit selection), plus anything
 * forced with `/slug`.
 */
export function resolveActiveSkills(options: {
  skills: SkillConfig[];
  projectSkillIds: string[] | null;
  prompt: string;
}): SkillConfig[] {
  const { skills, projectSkillIds, prompt } = options;
  const enabled = skills.filter((skill) => skill.enabled);
  const scoped =
    projectSkillIds && projectSkillIds.length
      ? enabled.filter((skill) => projectSkillIds.includes(skill.id))
      : enabled;

  const merged = [...scoped];
  for (const forced of findSlashSkills(prompt, enabled)) {
    if (!merged.some((skill) => skill.id === forced.id)) merged.push(forced);
  }
  return merged;
}

/** Skills eligible to be offered as `/slash` suggestions in a project. */
export function suggestSkills(
  skills: SkillConfig[],
  projectSkillIds: string[] | null,
  query: string,
): SkillConfig[] {
  const scoped =
    projectSkillIds && projectSkillIds.length
      ? skills.filter((skill) => projectSkillIds.includes(skill.id))
      : skills;
  const needle = query.toLowerCase();
  return scoped
    .filter((skill) => skill.enabled)
    .filter(
      (skill) =>
        !needle ||
        skill.slug.includes(needle) ||
        skill.name.toLowerCase().includes(needle),
    );
}
