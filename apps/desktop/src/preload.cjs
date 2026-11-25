// Electron's sandboxed preload contract is CommonJS, not ESM.
// oxlint-disable-next-line typescript/no-require-imports
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("boardroomSketch", {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  updates: {
    check: () => ipcRenderer.invoke("updates:check"),
    install: () => ipcRenderer.invoke("updates:install"),
    onProgress(callback) {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on("updates:progress", listener);
      return () => ipcRenderer.removeListener("updates:progress", listener);
    },
  },
});
