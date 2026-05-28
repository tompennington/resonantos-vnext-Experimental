/**
 * ResonantOS Electron PWA — preload script
 *
 * Exposes ONLY the narrow bridge that renderer pages need:
 *   - Platform identifier (for conditional UI)
 *   - Window control actions (minimize / maximize / close)
 *   - Side-panel opener
 *
 * Node, filesystem, IPC internals, and Electron APIs are NOT exposed.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("resonantosElectronPWA", {
  /** e.g. "darwin" | "win32" | "linux" */
  platform: process.platform,

  /**
   * Send a window-control action to the main process.
   * @param {"minimize"|"maximize"|"close"|"quit"} action
   */
  windowControl: (action) =>
    ipcRenderer.invoke("resonantos-pwa:window-controls", action),

  /** Open the side-panel window */
  openSidePanel: () =>
    ipcRenderer.invoke("resonantos-pwa:open-side-panel"),
});
