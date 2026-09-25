/**
 * Locates the structured plan inside an AI answer and splits the visible prose
 * away from the machine-readable JSON. Dependency-free, so the server (final
 * extraction) and the client (live streaming render) behave identically.
 */

export interface PlanBlock {
  /** Index where the hidden block starts (inclusive). */
  start: number;
  /** Index where the hidden block ends (exclusive). */
  end: number;
  /** Raw JSON text — may be invalid, or still streaming. */
  json: string;
  /** Info string of the fence, when the block was fenced. */
  info: string | null;
}

/** Matches fenced blocks and captures the info string + body. */
const FENCE = /```([^\n`]*)\n?([\s\S]*?)```/g;

const BARE_START = '{"phases"';

function looksLikePlan(text: string): boolean {
  const trimmed = text.trim().replace(/^```\w*/, "").trim();
  return trimmed.startsWith("{") && trimmed.includes('"phases"');
}

/**
 * The prose is everything before the first fence or bare plan object, so the
 * index is monotonic while the answer streams and never rewinds. A trailing
 * run of one or two backticks is withheld too, so a fence that has only
 * partially arrived is never rendered.
 */
export function visiblePrefix(raw: string): string {
  const block = findPlanBlock(raw);
  let prefix = block ? raw.slice(0, block.start) : raw;
  const partial = prefix.match(/`{1,2}$/);
  if (partial) prefix = prefix.slice(0, prefix.length - partial[0].length);
  // Hold back trailing whitespace so the streamed text already equals the
  // tidied final body (and the visible length never shrinks).
  return prefix.replace(/[ \t\n]+$/, "");
}

/**
 * Finds the plan block. Tolerates answers that use other code fences earlier on
 * and answers whose closing fence never arrived (truncated / still streaming).
 */
export function findPlanBlock(raw: string): PlanBlock | null {
  const blocks: PlanBlock[] = [];
  FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE.exec(raw)) !== null) {
    blocks.push({
      start: match.index,
      end: match.index + match[0].length,
      json: match[2],
      info: match[1].trim().toLowerCase(),
    });
  }

  // Prefer the last fenced block that is explicitly ```json or looks like a plan.
  for (const block of [...blocks].reverse()) {
    if (block.info === "json" || looksLikePlan(block.json)) return block;
  }

  // An unclosed fence after the last complete block is the plan being written.
  const lastBlock = blocks[blocks.length - 1];
  const openFence = raw.indexOf("```", lastBlock ? lastBlock.end : 0);
  if (openFence !== -1) {
    const rest = raw.slice(openFence + 3);
    const newline = rest.indexOf("\n");
    const info = (newline === -1 ? rest : rest.slice(0, newline)).trim();
    if (info === "" || info.toLowerCase() === "json" || rest.trimStart().startsWith("{")) {
      // Drop the info string line so the JSON starts at the object itself.
      const json = rest.trimStart().startsWith("{")
        ? rest
        : rest.slice(newline === -1 ? rest.length : newline + 1);
      return {
        start: openFence,
        end: raw.length,
        json,
        info: info || null,
      };
    }
  }

  // A bare trailing plan object with no fences at all.
  const bare = raw.lastIndexOf(BARE_START);
  if (bare !== -1 && raw.trimEnd().endsWith("}")) {
    return { start: bare, end: raw.length, json: raw.slice(bare), info: null };
  }

  return null;
}

/** Splits a finished answer into the prose shown to the user and the raw JSON. */
export function splitAnswer(raw: string): { body: string; json: string | null } {
  const block = findPlanBlock(raw);
  if (!block) return { body: tidy(raw), json: null };
  const body = raw.slice(0, block.start) + raw.slice(block.end);
  return { body: tidy(body), json: block.json };
}

function tidy(body: string): string {
  return body.replace(/\n{3,}/g, "\n\n").trim();
}
