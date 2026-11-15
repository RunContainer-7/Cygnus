"use strict";

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const updater = require("./updater.cjs");

const APP_ID = "com.cygnus.builder";
const isDev = !app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let serverLogStream = null;
let serverLogPath = "";
let serverOrigin = "";
let shuttingDown = false;
let fatalErrorShown = false;

function isAppOrigin(value) {
  try {
    return new URL(value).origin === new URL(serverOrigin).origin;
  } catch {
    return false;
  }
}

function logLine(message) {
  try {
    if (!serverLogPath) return;
    fs.appendFileSync(serverLogPath, `[desktop] ${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never stop the app from starting.
  }
}

function serverRoot() {
  return isDev
    ? path.join(__dirname, "..", ".next", "standalone")
    : path.join(process.resourcesPath, "app");
}

function workspaceDir() {
  return path.join(app.getPath("userData"), "workspaces");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  const requested = Number(process.env.CYGNUS_PORT);
  if (Number.isInteger(requested) && requested > 0 && requested < 65536) {
    if (await isPortFree(requested)) return requested;
  }

  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error("No local port available."))));
    });
  });
}

function createSplash() {
  const splash = new BrowserWindow({
    width: 460,
    height: 288,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: "#05060d",
    title: "Cygnus",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
  return splash;
}

function startServer(port) {
  const entry = path.join(serverRoot(), "server.js");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `The bundled Cygnus server is missing at ${entry}. Run "npm run desktop:build" first.`,
    );
  }

  const dataRoot = app.getPath("userData");
  const workspaces = workspaceDir();
  fs.mkdirSync(workspaces, { recursive: true });
  serverLogPath = path.join(dataRoot, "server.log");
  serverLogStream = fs.createWriteStream(serverLogPath, { flags: "a" });
  logLine(`Starting Cygnus ${app.getVersion()} at ${serverOrigin}`);
  logLine(`Server entry: ${entry}`);
  logLine(`Projects: ${workspaces}`);

  serverProcess = spawn(process.execPath, [entry], {
    cwd: dataRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      CYGNUS_WORKSPACE_DIR: workspaces,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout.pipe(serverLogStream, { end: false });
  serverProcess.stderr.pipe(serverLogStream, { end: false });
  serverProcess.on("error", (error) => logLine(`Server process error: ${error.message}`));
  serverProcess.on("exit", (code, signal) => {
    logLine(`Server exited with code ${code ?? "null"} signal ${signal ?? "none"}.`);
    if (shuttingDown) return;
    void showServerFailure(code, signal);
  });
}

async function waitForServer(timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (shuttingDown) return;
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(
        `The local server stopped before it was ready (exit code ${serverProcess.exitCode}).`,
      );
    }
    try {
      const response = await fetch(`${serverOrigin}/api/projects`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // The server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("The local server did not become ready within 45 seconds.");
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#04050c",
    title: "Cygnus",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.loadURL(serverOrigin);

  mainWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    splashWindow = null;
    mainWindow.show();
    logLine("Main window ready.");
    updater.startUpdateChecks();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (isAppOrigin(url)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 1100,
            height: 800,
            backgroundColor: "#04050c",
            autoHideMenuBar: true,
            webPreferences: {
              preload: path.join(__dirname, "preload.cjs"),
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      }
      if (target.protocol === "http:" || target.protocol === "https:") {
        void shell.openExternal(url);
      }
    } catch {
      // Ignore malformed URLs.
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppOrigin(url)) return;
    event.preventDefault();
    try {
      const target = new URL(url);
      if (target.protocol === "http:" || target.protocol === "https:") {
        void shell.openExternal(url);
      }
    } catch {
      // Ignore malformed URLs.
    }
  });

  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (isAppOrigin(url)) return;
    event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open projects folder",
          click: () => {
            const dir = workspaceDir();
            fs.mkdirSync(dir, { recursive: true });
            void shell.openPath(dir);
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for updates",
          click: () => {
            void updater.checkForUpdates(true);
          },
        },
        { type: "separator" },
        {
          label: "About Cygnus",
          click: () => {
            void dialog.showMessageBox({
              type: "info",
              title: "About Cygnus",
              message: `Cygnus ${app.getVersion()}`,
              detail:
                "Free, open-source AI app builder. Projects stay on this computer.\n\nMIT licensed.",
              buttons: ["Close"],
            });
          },
        },
      ],
    },
  ]);
}

function readLogTail(limit = 4000) {
  try {
    const content = fs.readFileSync(serverLogPath, "utf8");
    return content.slice(-limit);
  } catch {
    return "";
  }
}

async function showServerFailure(code, signal) {
  if (fatalErrorShown) return;
  fatalErrorShown = true;
  const detail = [
    `The bundled local server stopped unexpectedly (code ${code ?? "null"}${
      signal ? `, signal ${signal}` : ""
    }).`,
    "",
    `Log: ${serverLogPath}`,
    "",
    readLogTail(),
  ].join("\n");

  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  await dialog.showMessageBox({
    type: "error",
    title: "Cygnus stopped",
    message: "The local Cygnus server stopped.",
    detail,
    buttons: ["Quit"],
  });
  app.quit();
}

async function handleFatal(error) {
  if (fatalErrorShown) return;
  fatalErrorShown = true;
  const message = error instanceof Error ? error.message : String(error);
  logLine(`FATAL ${message}`);

  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  await dialog.showMessageBox({
    type: "error",
    title: "Cygnus could not start",
    message: "Cygnus could not start.",
    detail: [message, "", serverLogPath ? `Log: ${serverLogPath}` : "", readLogTail()].join("\n"),
    buttons: ["Quit"],
  });
  app.quit();
}

function stopServer() {
  return new Promise((resolve) => {
    const child = serverProcess;
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(finish, 3_000);
    timer.unref?.();

    if (process.platform === "win32" && child.pid) {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", finish);
      killer.once("exit", finish);
      return;
    }

    child.once("exit", finish);
    child.kill("SIGTERM");
  });
}

async function bootstrap() {
  app.setAppUserModelId(APP_ID);
  Menu.setApplicationMenu(buildMenu());
  splashWindow = createSplash();

  const port = await pickPort();
  serverOrigin = `http://127.0.0.1:${port}`;
  startServer(port);
  await waitForServer();
  updater.setupUpdater({
    logLine,
    beforeInstall: async () => {
      shuttingDown = true;
      await stopServer();
      serverLogStream?.end();
    },
  });
  createMainWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shuttingDown = true;
    void stopServer().finally(() => {
      serverLogStream?.end();
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    // During a fatal-startup dialog the splash may close first. Keep the app
    // alive until the user dismisses the error.
    if (!fatalErrorShown) app.quit();
  });

  app.whenReady().then(bootstrap).catch(handleFatal);
}
