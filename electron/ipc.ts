/** Channel + payload contracts shared by the main process and the preload bridge. */
export const UPDATE_STATUS_CHANNEL = "desktop:update-status";

/** Progress of a desktop auto-update, forwarded to the renderer for toasts. */
export type UpdateStatus =
  | { state: "checking" }
  | { state: "available"; version?: string }
  | { state: "not-available" }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version?: string }
  | { state: "error"; message: string };
