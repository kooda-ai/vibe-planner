/**
 * Pending tool approvals.
 *
 * The chat response is a one-way NDJSON stream, so when a tool needs the user's
 * permission the agent pauses on a promise and the decision arrives through a
 * second request (`POST /api/projects/[id]/chat/approve`). The registry lives on
 * `globalThis` so it survives Next's dev-mode HMR — otherwise a reload of the
 * route module would strand every waiting promise.
 */

/** How long the agent waits for a decision before denying the call. */
export const APPROVAL_TIMEOUT_MS = 120_000;

interface PendingApproval {
  /** Resolves `waitForApproval` with the user's decision. */
  decide: (approved: boolean) => void;
}

interface ApprovalGlobal {
  __plannerToolApprovals?: Map<string, PendingApproval>;
}

const globalStore = globalThis as unknown as ApprovalGlobal;

function registry(): Map<string, PendingApproval> {
  if (!globalStore.__plannerToolApprovals) {
    globalStore.__plannerToolApprovals = new Map();
  }
  return globalStore.__plannerToolApprovals;
}

/**
 * Registers a pending decision and resolves `true`/`false` when the user
 * answers. A timeout (or an abort) resolves `false`, i.e. "denied".
 */
export function waitForApproval(
  callId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      registry().delete(callId);
      signal?.removeEventListener("abort", onAbort);
      resolve(false);
    }, APPROVAL_TIMEOUT_MS);

    function onAbort() {
      clearTimeout(timer);
      registry().delete(callId);
      resolve(false);
    }

    registry().set(callId, {
      decide: (approved) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        registry().delete(callId);
        resolve(approved);
      },
    });

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Resolves a pending approval; returns false when the id is unknown/expired. */
export function resolveApproval(callId: string, approved: boolean): boolean {
  const pending = registry().get(callId);
  if (!pending) return false;
  pending.decide(approved);
  return true;
}
