"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";

/** Mirrors `electron/ipc.ts` on the main-process side. */
export type DesktopUpdateStatus =
  | { state: "checking" }
  | { state: "available"; version?: string }
  | { state: "not-available" }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version?: string }
  | { state: "error"; message: string };

interface DesktopBridge {
  isDesktop: boolean;
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    /** Injected by `electron/preload.ts`; absent in a plain browser. */
    desktop?: DesktopBridge;
  }
}

/** One toast slot so progress updates replace each other instead of stacking. */
const TOAST_ID = "desktop-update";

/**
 * Turns auto-update progress into Sonner toasts. Renders nothing in the browser,
 * so the web app is unaffected. macOS never emits these events (unsigned builds
 * are updated manually from GitHub).
 */
export function DesktopUpdateNotifications() {
  const { tr } = useI18n();

  useEffect(() => {
    const bridge = window.desktop;
    if (!bridge?.onUpdateStatus) return;

    return bridge.onUpdateStatus((status) => {
      switch (status.state) {
        case "available":
          toast.info(tr("updates.available", { version: status.version ?? "" }), {
            id: TOAST_ID,
            duration: Infinity,
          });
          break;
        case "downloading":
          toast.loading(tr("updates.downloading", { percent: status.percent }), {
            id: TOAST_ID,
            duration: Infinity,
          });
          break;
        case "downloaded":
          toast.success(tr("updates.downloaded"), {
            id: TOAST_ID,
            duration: Infinity,
          });
          break;
        case "error":
          toast.error(tr("updates.error"), { id: TOAST_ID });
          break;
        default:
          break;
      }
    });
  }, [tr]);

  return null;
}
