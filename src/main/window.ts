import { app, BrowserWindow } from "electron";
import path from "node:path";
import { logMainError, writeAppLog } from "./logger.js";
import { appIconPath, readPreferences, writePreferences } from "./storage.js";
import type { AppPreferences, UpdateStatus } from "../shared/types.js";

export async function createMainWindow(options: {
  devServerUrl?: string;
  onCreated: (window: BrowserWindow, preferences: AppPreferences) => void;
  checkForUpdates: () => Promise<void>;
  sendUpdateStatus: (status: UpdateStatus) => void;
}) {
  let windowBoundsSaveTimer: NodeJS.Timeout | null = null;
  const preloadPath = path.join(app.getAppPath(), "dist/preload/preload.js");
  const preferences = await readPreferences();
  const windowBounds = preferences.windowBounds;
  const window = new BrowserWindow({
    width: windowBounds?.width ?? 1320,
    height: windowBounds?.height ?? 860,
    x: windowBounds?.x,
    y: windowBounds?.y,
    minWidth: 1100,
    minHeight: 720,
    title: "KafkaPilot",
    icon: appIconPath(),
    autoHideMenuBar: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  async function saveWindowBounds() {
    if (window.isDestroyed()) return;
    const bounds = window.getNormalBounds();
    const maximized = window.isMaximized();
    const latestPreferences = await readPreferences();
    await writePreferences({
      ...latestPreferences,
      windowBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized
      }
    });
  }

  function scheduleWindowBoundsSave() {
    if (windowBoundsSaveTimer) {
      clearTimeout(windowBoundsSaveTimer);
    }
    windowBoundsSaveTimer = setTimeout(() => {
      windowBoundsSaveTimer = null;
      void saveWindowBounds();
    }, 400);
  }

  if (windowBounds?.maximized) {
    window.maximize();
  }
  options.onCreated(window, preferences);

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("Renderer failed to load", { errorCode, errorDescription, validatedURL });
    void writeAppLog("error", "renderer-load", "Renderer failed to load", { errorCode, errorDescription, validatedURL });
  });

  window.webContents.on("console-message", (_event, level, message) => {
    console.log(`Renderer console[${level}]: ${message}`);
    if (level >= 2) {
      void writeAppLog(level >= 3 ? "error" : "warn", "renderer-console", message);
    }
  });

  window.on("resize", scheduleWindowBoundsSave);
  window.on("move", scheduleWindowBoundsSave);
  window.on("maximize", scheduleWindowBoundsSave);
  window.on("unmaximize", scheduleWindowBoundsSave);
  window.on("close", () => {
    void saveWindowBounds();
  });

  try {
    if (options.devServerUrl) {
      await window.loadURL(options.devServerUrl);
      window.webContents.openDevTools({ mode: "detach" });
      return window;
    }
    await window.loadFile(path.join(app.getAppPath(), "dist/renderer/index.html"));
  } catch (error) {
    console.error("Failed to load renderer", error);
    logMainError("window.load", error);
  }

  if (app.isPackaged) {
    setTimeout(() => {
      void options.checkForUpdates().catch((error) => {
        logMainError("auto-update.check", error);
        options.sendUpdateStatus({
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      });
    }, 3000);
  }

  return window;
}
