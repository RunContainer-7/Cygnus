"use strict";

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const RELEASES_PAGE = "https://github.com/RunContainer-7/Cygnus/releases/latest";
const LATEST_RELEASE_API =
  "https://api.github.com/repos/RunContainer-7/Cygnus/releases/latest";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 12_000;
const PORTABLE = Boolean(
  process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE,
);

let log = () => {};
let beforeInstall = async () => {};
let initialized = false;
let checking = false;
let downloading = false;
let installing = false;
let manualCheck = false;
let checkTimer = null;
let status = { state: "idle", currentVersion: "" };

function publicStatus() {
  return { ...status };
}

function publish(patch) {
  status = { ...status, ...patch, currentVersion: app.getVersion() };
  const payload = publicStatus();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("cygnus:update", payload);
    }
  }
}

function errorText(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 320);
}

function compareVersions(left, right) {
  const parts = (value) =>
    String(value)
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function showMessage(message, detail) {
  await dialog.showMessageBox({
    type: "info",
    title: "Cygnus updates",
    message,
    detail,
    buttons: ["Close"],
  });
}

async function checkPortable() {
  checking = true;
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Cygnus/${app.getVersion()}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    const release = await response.json();
    const latest = String(release.tag_name ?? "").replace(/^v/i, "");
    if (latest && compareVersions(latest, app.getVersion()) > 0) {
      publish({
        state: "manual",
        version: latest,
        manualUrl:
          typeof release.html_url === "string" && release.html_url.startsWith("https://github.com/")
            ? release.html_url
            : RELEASES_PAGE,
        message: "This portable build needs the new download.",
      });
      return;
    }
    publish({ state: "idle" });
    if (manualCheck) {
      await showMessage(
        "You're up to date",
        `Cygnus ${app.getVersion()} is the latest version.`,
      );
    }
  } catch (error) {
    const message = `Could not check for updates: ${errorText(error)}`;
    log(message);
    if (manualCheck) {
      publish({ state: "error", message });
      await showMessage("Could not check for updates", message);
    }
  } finally {
    checking = false;
    manualCheck = false;
  }
}

async function checkForUpdates(userInitiated = false) {
  manualCheck = Boolean(userInitiated);
  if (!initialized || !app.isPackaged) {
    return publicStatus();
  }
  if (checking || downloading || installing) {
    return publicStatus();
  }

  if (PORTABLE) {
    await checkPortable();
    return publicStatus();
  }

  checking = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    checking = false;
    const message = `Could not check for updates: ${errorText(error)}`;
    log(message);
    if (manualCheck && status.state !== "error") {
      publish({ state: "error", message });
      await showMessage("Could not check for updates", message);
    }
    manualCheck = false;
  }
  return publicStatus();
}

async function downloadUpdate() {
  if (!app.isPackaged) {
    return { ok: false, error: "Updates are only available in the packaged app." };
  }
  if (PORTABLE) {
    return { ok: false, error: "This portable build uses the download link instead." };
  }
  if (status.state === "downloaded" || status.state === "installing") {
    return { ok: true };
  }
  if (downloading) return { ok: true };

  downloading = true;
  publish({ state: "downloading", percent: 0, message: "Downloading the update…" });
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    downloading = false;
    const message = `Update download failed: ${errorText(error)}`;
    log(message);
    publish({ state: "error", message });
    return { ok: false, error: message };
  }
}

async function installDownloadedUpdate() {
  if (installing) return;
  if (status.state !== "downloaded") {
    return { ok: false, error: "No downloaded update is ready yet." };
  }

  installing = true;
  publish({ state: "installing", message: "Restarting to finish the update…" });
  log(`Installing Cygnus ${status.version ?? "update"} and restarting.`);
  try {
    await beforeInstall();
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  } catch (error) {
    installing = false;
    const message = `Could not install the update: ${errorText(error)}`;
    log(message);
    publish({ state: "error", message });
    return { ok: false, error: message };
  }
}

async function openDownloadPage() {
  const target = status.manualUrl || RELEASES_PAGE;
  try {
    if (new URL(target).hostname !== "github.com") throw new Error("Unexpected download host.");
    await shell.openExternal(target);
  } catch (error) {
    log(`Could not open update page: ${errorText(error)}`);
    await shell.openExternal(RELEASES_PAGE);
  }
}

function registerIpc() {
  ipcMain.handle("cygnus:update-get", () => publicStatus());
  ipcMain.handle("cygnus:update-check", () => checkForUpdates(true));
  ipcMain.handle("cygnus:update-download", () => downloadUpdate());
  ipcMain.handle("cygnus:update-install", () => installDownloadedUpdate());
  ipcMain.handle("cygnus:update-open", () => openDownloadPage());
}

function wireUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (message) => log(`[updater] ${message}`),
    warn: (message) => log(`[updater] ${message}`),
    error: (message) => log(`[updater] ${message}`),
    debug: () => {},
  };

  const override = process.env.CYGNUS_UPDATE_URL?.trim();
  if (override) {
    autoUpdater.setFeedURL({ provider: "generic", url: override });
    log(`Using update feed override: ${override}`);
  }

  autoUpdater.on("checking-for-update", () => {
    if (status.state === "idle") publish({ state: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    checking = false;
    manualCheck = false;
    publish({
      state: "available",
      version: info.version,
      percent: 0,
      message: "A new version of Cygnus is ready.",
    });
    log(`Update available: ${info.version}`);
  });

  autoUpdater.on("update-not-available", async () => {
    checking = false;
    publish({ state: "idle" });
    if (manualCheck) {
      await showMessage(
        "You're up to date",
        `Cygnus ${app.getVersion()} is the latest version.`,
      );
    }
    manualCheck = false;
  });

  autoUpdater.on("download-progress", (progress) => {
    publish({
      state: "downloading",
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      bytesPerSecond: Math.max(0, Math.round(progress.bytesPerSecond)),
      transferred: Math.max(0, Math.round(progress.transferred)),
      total: Math.max(0, Math.round(progress.total)),
      message: "Downloading the update…",
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    downloading = false;
    publish({
      state: "downloaded",
      version: info.version,
      percent: 100,
      message: "Update ready. Restarting…",
    });
    log(`Update ${info.version} downloaded; restarting to install.`);
    setTimeout(() => {
      void installDownloadedUpdate();
    }, 900).unref?.();
  });

  autoUpdater.on("error", async (error) => {
    const message = `Updater error: ${errorText(error)}`;
    log(message);
    checking = false;
    if (downloading) {
      downloading = false;
      publish({ state: "error", message });
      return;
    }
    if (manualCheck) {
      publish({ state: "error", message });
      await showMessage("Could not check for updates", message);
      manualCheck = false;
    } else if (status.state !== "idle") {
      publish({ state: "idle" });
    }
  });
}

function startUpdateChecks() {
  if (!app.isPackaged || checkTimer) return;
  const first = setTimeout(() => {
    void checkForUpdates(false);
  }, FIRST_CHECK_DELAY_MS);
  first.unref?.();
  checkTimer = setInterval(() => {
    void checkForUpdates(false);
  }, CHECK_INTERVAL_MS);
  checkTimer.unref?.();
}

function setupUpdater(options = {}) {
  if (initialized) return;
  initialized = true;
  log = typeof options.logLine === "function" ? options.logLine : () => {};
  beforeInstall =
    typeof options.beforeInstall === "function" ? options.beforeInstall : async () => {};
  status = { state: "idle", currentVersion: app.getVersion() };
  registerIpc();

  if (!app.isPackaged) {
    log("Auto-update is disabled in development.");
    return;
  }

  wireUpdater();
  log(`Auto-update enabled for Cygnus ${app.getVersion()}.`);
}

module.exports = {
  setupUpdater,
  startUpdateChecks,
  checkForUpdates,
  installDownloadedUpdate,
};
