import { app, BrowserWindow } from "electron";
app.setName("KafkaPilot"); // dev/prod 모두 동일한 userData 경로 보장
import { checkForUpdates as runUpdateCheck } from "./autoUpdate.js";
import { registerAppSettingsIpcHandlers } from "./ipc/appSettings.js";
import { registerBrokerIpcHandlers } from "./ipc/brokers.js";
import { registerConsumerGroupIpcHandlers } from "./ipc/consumerGroups.js";
import { createConsumeProduceService, nextOffset } from "./ipc/consumeProduce.js";
import { registerMessageExportIpcHandlers } from "./ipc/messageExport.js";
import { registerServerIpcHandlers } from "./ipc/servers.js";
import { registerTopicIpcHandlers } from "./ipc/topics.js";
import { logMainError, pruneOldLogs, writeAppLog } from "./logger.js";
import { clearLiveMapPoints, getLiveMapPoints, openLiveMapWindow, sendLiveMapPoints } from "./liveMapWindow.js";
import { runLegacyMigration } from "./legacyMigration.js";
import { createApplicationMenu, getLiveRecordTitle, resolveMenuLanguage } from "./menu.js";
import { createSettingsTransferActions } from "./settingsTransfer.js";
import { createMainWindow } from "./window.js";
import type {
  AppMenuLanguage,
  UpdateStatus
} from "../shared/types.js";

const devServerUrl = process.env.KAFKA_TOOL_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;
const appUserModelId = "local.kafkapilot";
let isCleaningUpConsumers = false;
let menuLanguage: AppMenuLanguage = app.getLocale().toLowerCase().startsWith("ko") ? "ko" : "en";

void writeAppLog("info", "app", `KafkaPilot starting. version=${app.getVersion()} platform=${process.platform} arch=${process.arch}`);

function sendUpdateStatus(status: UpdateStatus) {
  mainWindow?.webContents.send("updates:status", status);
}

async function checkForUpdates() {
  await runUpdateCheck({
    getWindow: () => mainWindow,
    sendStatus: sendUpdateStatus
  });
}

function rebuildApplicationMenu() {
  createApplicationMenu({
    getWindow: () => mainWindow,
    getLanguage: () => menuLanguage,
    checkForUpdates,
    exportSettingsToFile,
    importSettingsFromFile
  });
}

async function createWindow() {
  await createMainWindow({
    devServerUrl,
    onCreated: (window, preferences) => {
      mainWindow = window;
      menuLanguage = resolveMenuLanguage(preferences.appearance?.language);
      void pruneOldLogs(preferences.diagnostics?.logRetentionDays);
      rebuildApplicationMenu();
      window.on("closed", () => {
        mainWindow = null;
      });
    },
    checkForUpdates,
    sendUpdateStatus
  });
}

const consumeProduceService = createConsumeProduceService({
  getWindow: () => mainWindow,
  getLiveRecordTitle: () => getLiveRecordTitle(menuLanguage)
});
const { exportSettingsToFile, importSettingsFromFile } = createSettingsTransferActions({
  getWindow: () => mainWindow,
  stopActiveConsumer: consumeProduceService.stopActiveConsumer
});

registerServerIpcHandlers();
registerAppSettingsIpcHandlers({
  checkForUpdates,
  createApplicationMenu: rebuildApplicationMenu,
  exportSettingsToFile,
  importSettingsFromFile,
  clearLiveMapPoints,
  getLiveMapPoints,
  openLiveMapWindow,
  sendLiveMapPoints,
  setMenuLanguage: (language) => {
    menuLanguage = language;
  }
});
registerBrokerIpcHandlers();
registerConsumerGroupIpcHandlers();
registerMessageExportIpcHandlers({
  getWindow: () => mainWindow,
  consumeOffsetBatch: consumeProduceService.consumeOffsetBatch,
  nextOffset
});
registerTopicIpcHandlers();
consumeProduceService.registerIpcHandlers();

if (process.platform === "win32") {
  app.setAppUserModelId(appUserModelId);
}

app.whenReady().then(async () => {
  await runLegacyMigration();
  void createWindow();
});

app.on("before-quit", (event) => {
  if (isCleaningUpConsumers || !consumeProduceService.hasActiveConsumers()) {
    return;
  }
  event.preventDefault();
  isCleaningUpConsumers = true;
  void consumeProduceService.stopActiveConsumer()
    .finally(() => {
      isCleaningUpConsumers = false;
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

async function cleanupConsumersAndExit() {
  if (isCleaningUpConsumers) return;
  isCleaningUpConsumers = true;
  await consumeProduceService.stopActiveConsumer();
  process.exit(0);
}

process.on("SIGINT", () => {
  void writeAppLog("info", "app", "SIGINT received.");
  void cleanupConsumersAndExit();
});

process.on("SIGTERM", () => {
  void writeAppLog("info", "app", "SIGTERM received.");
  void cleanupConsumersAndExit();
});

process.on("uncaughtException", (error) => {
  logMainError("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  logMainError("unhandledRejection", reason);
});
