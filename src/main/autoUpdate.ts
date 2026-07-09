import { app, dialog, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateStatus } from "../shared/types.js";

let autoUpdaterConfigured = false;

type AutoUpdateParams = {
  getWindow: () => BrowserWindow | null;
  sendStatus: (status: UpdateStatus) => void;
};

export function configureAutoUpdater({ getWindow, sendStatus }: AutoUpdateParams) {
  if (autoUpdaterConfigured) return;
  autoUpdaterConfigured = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendStatus({ status: "checking", message: "Checking for updates..." });
  });

  autoUpdater.on("update-available", (info) => {
    sendStatus({
      status: "available",
      message: `Downloading new version ${info.version}...`,
      version: info.version
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    sendStatus({
      status: "not-available",
      message: `You are on the latest version. (${info.version})`,
      version: info.version
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent);
    sendStatus({
      status: "download-progress",
      message: `Downloading update ${percent}%`,
      percent
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendStatus({
      status: "downloaded",
      message: `Update ${info.version} downloaded`,
      version: info.version
    });
    const window = getWindow();
    if (!window) return;
    void dialog.showMessageBox(window, {
      type: "info",
      buttons: ["Restart and update", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `KafkaPilot ${info.version} is ready to install.`,
      detail: "Restart now to apply the update."
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on("error", (error) => {
    sendStatus({
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  });
}

export async function checkForUpdates(params: AutoUpdateParams) {
  configureAutoUpdater(params);
  if (!app.isPackaged) {
    params.sendStatus({
      status: "error",
      message: "Update checks only work in the packaged app."
    });
    return;
  }
  await autoUpdater.checkForUpdates();
}

export function installUpdate() {
  autoUpdater.quitAndInstall(false, true);
}
