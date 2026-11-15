"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cygnusUpdater", {
  getStatus: () => ipcRenderer.invoke("cygnus:update-get"),
  check: () => ipcRenderer.invoke("cygnus:update-check"),
  download: () => ipcRenderer.invoke("cygnus:update-download"),
  install: () => ipcRenderer.invoke("cygnus:update-install"),
  openDownload: () => ipcRenderer.invoke("cygnus:update-open"),
  onStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("cygnus:update", listener);
    return () => ipcRenderer.removeListener("cygnus:update", listener);
  },
});
