import { app, BrowserWindow } from "electron";
import path from "node:path";
import type { LiveMapPoint } from "../shared/types.js";
import { writeAppLog } from "./logger.js";
import { appIconPath } from "./storage.js";

let liveMapWindow: BrowserWindow | null = null;
const bufferedPoints = new Map<string, LiveMapPoint>();

function storeLiveMapPoints(points: LiveMapPoint[]) {
  for (const point of points) {
    bufferedPoints.set(point.id, point);
  }
}

function getBufferedLiveMapPoints() {
  return Array.from(bufferedPoints.values());
}

function flushLiveMapPoints(points = getBufferedLiveMapPoints()) {
  if (!liveMapWindow || liveMapWindow.isDestroyed() || points.length === 0) return;
  liveMapWindow.webContents.send("live-map:points", points);
}

export async function openLiveMapWindow() {
  if (liveMapWindow && !liveMapWindow.isDestroyed()) {
    liveMapWindow.show();
    liveMapWindow.focus();
    flushLiveMapPoints();
    return;
  }

  const preloadPath = path.join(app.getAppPath(), "dist/preload/liveMapPreload.js");
  liveMapWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    title: "KafkaPilot Map Viewer",
    icon: appIconPath(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  liveMapWindow.on("closed", () => {
    bufferedPoints.clear();
    liveMapWindow = null;
  });
  liveMapWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    void writeAppLog("error", "mapViewer.preload", `Failed to load Map Viewer preload: ${preloadPath}`, error);
  });
  liveMapWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level < 2) return;
    void writeAppLog("warn", "mapViewer.console", `${message} (${sourceId}:${line})`);
  });
  liveMapWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    void writeAppLog("warn", "mapViewer.load", `Map Viewer load failed: ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  // dev 모드에서는 Vite dev server에서 로드 (HMR 지원)
  const devServerUrl = process.env.KAFKA_TOOL_DEV_SERVER_URL;
  if (devServerUrl) {
    await liveMapWindow.loadURL(`${devServerUrl}/map-viewer.html`);
  } else {
    await liveMapWindow.loadFile(path.join(app.getAppPath(), "dist/renderer/map-viewer.html"));
  }
  flushLiveMapPoints();
}

export function sendLiveMapPoints(points: LiveMapPoint[]) {
  if (points.length === 0) return;
  storeLiveMapPoints(points);
  flushLiveMapPoints(points);
}

export function getLiveMapPoints() {
  return getBufferedLiveMapPoints();
}

export function clearLiveMapPoints() {
  bufferedPoints.clear();
}
