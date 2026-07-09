import { dialog, type BrowserWindow } from "electron";
import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  normalizeImportedServers,
  normalizePreferences,
  preserveExistingSecrets,
  readPreferences,
  readProfiles,
  readProfilesForExport,
  writePreferences,
  writeProfiles
} from "./storage.js";
import type { AppSettingsBundle, ImportSettingsResult, ServerProfile } from "../shared/types.js";
import type { EncryptedAppSettingsBundle, ExportSettingsOptions, ImportSettingsOptions } from "../shared/types.js";

const SETTINGS_EXPORT_KDF_ITERATIONS = 310_000;
const pbkdf2Async = promisify(pbkdf2);

async function deriveSettingsExportKey(password: string, salt: Buffer) {
  return pbkdf2Async(password, salt, SETTINGS_EXPORT_KDF_ITERATIONS, 32, "sha256");
}

async function encryptSettingsBundle(bundle: AppSettingsBundle, password: string): Promise<EncryptedAppSettingsBundle> {
  if (!password) {
    throw new Error("Enter an export password to include secrets.");
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await deriveSettingsExportKey(password, salt), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(bundle), "utf8"),
    cipher.final()
  ]);
  return {
    version: 2,
    encrypted: true,
    algorithm: "aes-256-gcm",
    kdf: "pbkdf2-sha256",
    iterations: SETTINGS_EXPORT_KDF_ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64")
  };
}

async function decryptSettingsBundle(bundle: EncryptedAppSettingsBundle, password?: string): Promise<AppSettingsBundle> {
  if (!password) {
    throw new Error("This settings file is encrypted. Enter the export password to import it.");
  }
  if (bundle.algorithm !== "aes-256-gcm" || bundle.kdf !== "pbkdf2-sha256") {
    throw new Error("Unsupported encrypted settings file.");
  }
  try {
    const salt = Buffer.from(bundle.salt, "base64");
    const iv = Buffer.from(bundle.iv, "base64");
    const decipher = createDecipheriv("aes-256-gcm", await pbkdf2Async(password, salt, bundle.iterations, 32, "sha256"), iv);
    decipher.setAuthTag(Buffer.from(bundle.authTag, "base64"));
    const json = Buffer.concat([
      decipher.update(Buffer.from(bundle.data, "base64")),
      decipher.final()
    ]).toString("utf8");
    return JSON.parse(json) as AppSettingsBundle;
  } catch {
    throw new Error("Failed to decrypt settings. Check the export password.");
  }
}

function isEncryptedSettingsBundle(value: unknown): value is EncryptedAppSettingsBundle {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "encrypted" in value && value.encrypted === true);
}

export function createSettingsTransferActions(options: {
  getWindow: () => BrowserWindow | null;
  stopActiveConsumer: () => Promise<void>;
}) {
  async function exportSettingsToFile(exportOptions: ExportSettingsOptions = {}) {
    const window = options.getWindow();
    if (!window) return null;
    const includeSecrets = Boolean(exportOptions.includeSecrets);
    const result = await dialog.showSaveDialog(window, {
      title: includeSecrets ? "Export encrypted KafkaPilot settings" : "Export KafkaPilot settings",
      defaultPath: includeSecrets
        ? `kafkapilot-settings-with-secrets-${new Date().toISOString().slice(0, 10)}.json`
        : `kafkapilot-settings-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    const bundle: AppSettingsBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      servers: includeSecrets ? await readProfiles() : await readProfilesForExport(),
      preferences: await readPreferences()
    };
    const exportPayload = includeSecrets
      ? await encryptSettingsBundle(bundle, exportOptions.password ?? "")
      : bundle;
    await writeFile(result.filePath, JSON.stringify(exportPayload, null, 2), "utf8");
    return result.filePath;
  }

  async function importSettingsFromFile(importOptions: ImportSettingsOptions = {}): Promise<ImportSettingsResult | null> {
    const window = options.getWindow();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      title: "Import KafkaPilot settings",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const file = await readFile(result.filePaths[0], "utf8");
    const parsed = JSON.parse(file) as Partial<AppSettingsBundle> | Partial<EncryptedAppSettingsBundle> | ServerProfile[];
    const settingsBundle = isEncryptedSettingsBundle(parsed)
      ? await decryptSettingsBundle(parsed, importOptions.password)
      : parsed as Partial<AppSettingsBundle> | ServerProfile[];
    const existingServers = await readProfiles();
    const normalizedServers = normalizeImportedServers(Array.isArray(settingsBundle) ? settingsBundle : settingsBundle.servers);
    const servers = preserveExistingSecrets(normalizedServers, existingServers);
    const preferences = normalizePreferences(Array.isArray(settingsBundle) ? undefined : settingsBundle.preferences);
    await writeProfiles(servers);
    await writePreferences(preferences);
    await options.stopActiveConsumer();
    return { servers, preferences };
  }

  return {
    exportSettingsToFile,
    importSettingsFromFile
  };
}
