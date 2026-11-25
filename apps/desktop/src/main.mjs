import electronUpdater from "electron-updater";
import { app, BrowserWindow, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { autoUpdater } = electronUpdater;
const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appIdentifier = "dev.thivy.boardroomsketch";
const devUrl = process.env.BOARDROOM_SKETCH_DEV_URL;
const startTimeoutMs = 90_000;

let mainWindow;
let serverProcess;
let availableVersion;
let quitting = false;

// Keep the previous desktop app-data location so upgraded installs retain transcripts and settings.
app.setPath("userData", path.join(app.getPath("appData"), appIdentifier));
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function resourcesRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(appDirectory, "build");
}

function serverPaths() {
  const resources = resourcesRoot();
  return {
    entry: path.join(resources, "server", "server", "index.mjs"),
    bun: path.join(resources, "bun", process.platform === "win32" ? "bun.exe" : "bun"),
  };
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("The server could not allocate a local port."));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function showStartupError(title, detail) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const payload = JSON.stringify({ title, detail });
  void mainWindow.webContents.executeJavaScript(
    `window.__showStartupError?.(${payload.replaceAll("<", "\\u003c")})`,
  );
}

function tail(lines) {
  return lines.slice(-30).join("\n");
}

function recordServerExit(child, output, logPath) {
  child.once("exit", (code, signal) => {
    const reason = signal
      ? `The server stopped after receiving ${signal}.`
      : `The server stopped (exit code ${code ?? "unknown"}).`;
    if (quitting) return;
    showStartupError(reason, `${tail(output)}\n\nLog: ${logPath}`);
  });
}

async function waitForServer(port, child) {
  const deadline = Date.now() + startTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The server stopped before it was ready.");
    }
    if (await isPortListening(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Boardroom Sketch is taking too long to start.");
}

async function startServer() {
  const port = await freePort();
  const dataDirectory = app.getPath("userData");
  const logPath = path.join(dataDirectory, "server.log");
  const { bun, entry } = serverPaths();
  mkdirSync(dataDirectory, { recursive: true });
  writeFileSync(logPath, "");

  const output = [];
  serverProcess = spawn(bun, [entry], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      TRANSCRIPTS_DB: path.join(dataDirectory, "transcripts.db"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const capture = (chunk) => {
    const line = chunk.toString().trimEnd();
    if (!line) return;
    appendFileSync(logPath, `${line}\n`);
    output.push(line);
  };
  serverProcess.stdout.on("data", capture);
  serverProcess.stderr.on("data", capture);
  serverProcess.once("error", (error) => {
    showStartupError(
      "Boardroom Sketch could not start its server.",
      `${error.message}\n\nBun: ${bun}\nServer file: ${entry}\nLog: ${logPath}`,
    );
  });
  recordServerExit(serverProcess, output, logPath);

  try {
    await waitForServer(port, serverProcess);
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  } catch (error) {
    showStartupError(
      error instanceof Error ? error.message : "Boardroom Sketch could not start.",
      `${tail(output)}\n\nBun: ${bun}\nServer file: ${entry}\nLog: ${logPath}`,
    );
  }
}

function registerIpc() {
  const fromMainWindow = (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error("Invalid desktop request.");
  };

  ipcMain.handle("window:minimize", (event) => {
    fromMainWindow(event);
    mainWindow?.minimize();
  });
  ipcMain.handle("window:toggle-maximize", (event) => {
    fromMainWindow(event);
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle("window:close", (event) => {
    fromMainWindow(event);
    mainWindow?.close();
  });
  ipcMain.handle("updates:check", async (event) => {
    fromMainWindow(event);
    if (!app.isPackaged) return null;
    availableVersion = undefined;
    await autoUpdater.checkForUpdates();
    return availableVersion ? { version: availableVersion } : null;
  });
  ipcMain.handle("updates:install", async (event) => {
    fromMainWindow(event);
    if (!app.isPackaged || !availableVersion) throw new Error("No desktop update is available.");
    await autoUpdater.downloadUpdate();
    autoUpdater.quitAndInstall();
  });
}

function registerUpdater() {
  autoUpdater.on("update-available", ({ version }) => {
    availableVersion = version;
  });
  autoUpdater.on("update-not-available", () => {
    availableVersion = undefined;
  });
  autoUpdater.on("download-progress", ({ percent }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updates:progress", { percent: Math.round(percent) });
    }
  });
  autoUpdater.on("error", (error) => {
    console.error(`Desktop update error: ${error.message}`);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: "Boardroom Sketch",
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(appDirectory, "src", "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  await mainWindow.loadFile(path.join(appDirectory, "loading", "index.html"));
  if (devUrl) await mainWindow.loadURL(devUrl);
  else await startServer();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on("before-quit", () => {
    quitting = true;
    if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
      serverProcess.kill();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app
    .whenReady()
    .then(async () => {
      registerIpc();
      registerUpdater();
      await createWindow();
    })
    .catch((error) => {
      console.error("Boardroom Sketch could not open its window.", error);
      app.quit();
    });
}
