import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { UPDATE_STATUS_CHANNEL, type UpdateStatus } from "./ipc";

/**
 * The only surface the renderer gets: no Node, no `ipcRenderer` handle. The web
 * app runs on Electron's secure defaults (`contextIsolation: true`,
 * `nodeIntegration: false`, `sandbox: true`).
 */
contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  /** Subscribes to auto-update progress; returns an unsubscribe function. */
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus) =>
      callback(status);
    ipcRenderer.on(UPDATE_STATUS_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATUS_CHANNEL, listener);
    };
  },
});
