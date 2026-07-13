import { app, safeStorage } from "electron";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeAppLog } from "./logger.js";
import type { AppPreferences, ServerProfile } from "../shared/types.js";

type StoredServerProfile = Omit<ServerProfile, "schemaRegistry" | "security"> & {
  schemaRegistry?: {
    url: string;
    auth?: (
      | {
          type: "basic";
          username?: string;
          password?: string;
          passwordEncrypted?: string;
        }
      | {
          type: "bearer";
          token?: string;
          tokenEncrypted?: string;
        }
    );
  };
  security?: {
    ssl?: boolean;
    sasl?: {
      mechanism: "oauthbearer";
      tokenEndpoint: string;
      clientId: string;
      clientSecret?: string;
      clientSecretEncrypted?: string;
      scope?: string;
      audience?: string;
    };
  };
};

export function appIconPath() {
  return path.join(app.getAppPath(), "build/icon.ico");
}

function profilesPath() {
  return path.join(app.getPath("userData"), "servers.json");
}

function preferencesPath() {
  return path.join(app.getPath("userData"), "preferences.json");
}

function recoveryDirectoryPath() {
  return path.join(app.getPath("userData"), ".recovery");
}

function preferencesBackupPath() {
  return path.join(recoveryDirectoryPath(), "preferences.json");
}

function profilesBackupPath() {
  return path.join(recoveryDirectoryPath(), "servers.json");
}

function isNodeErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function writeFileAtomic(filePath: string, data: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, data, "utf8");
  await rm(filePath, { force: true });
  await rename(temporaryPath, filePath);
}

async function rotateExistingJsonFileToBackup(filePath: string, backupPath: string) {
  try {
    const currentFile = await readFile(filePath, "utf8");
    JSON.parse(currentFile);
    await rm(backupPath, { force: true });
    await rename(filePath, backupPath);
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return;
    }
    await writeAppLog("warn", "storage.backup", `Skipped backup rotation for unreadable ${path.basename(filePath)}.`, error);
    await rm(filePath, { force: true });
  }
}

async function writeFileWithBackup(filePath: string, backupPath: string, data: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, data, "utf8");
  await rotateExistingJsonFileToBackup(filePath, backupPath);
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await writeAppLog("error", "storage.write", `Failed to replace ${path.basename(filePath)} after backup rotation. Trying rollback.`, error);
    try {
      await rename(backupPath, filePath);
    } catch (rollbackError) {
      await writeAppLog("error", "storage.write", `Failed to roll back ${path.basename(filePath)} from backup.`, rollbackError);
    }
    throw error;
  }
}

async function restoreFileFromBackup(filePath: string, data: string) {
  await writeFileAtomic(filePath, data);
}

function canUseSafeStorage() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function requireSafeStorage() {
  if (!canUseSafeStorage()) {
    throw new Error("Secure storage is not available on this system. Secret values cannot be saved safely.");
  }
}

function encryptSecret(value: string | undefined) {
  if (!value) return undefined;
  requireSafeStorage();
  return safeStorage.encryptString(value).toString("base64");
}

function decryptSecret(value: string | undefined) {
  if (!value) return undefined;
  requireSafeStorage();
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    throw new Error("Failed to decrypt a saved server secret. Re-enter the server credentials.");
  }
}

function hasProfileSecrets(profile: StoredServerProfile | ServerProfile) {
  return Boolean(
    profile.security?.sasl?.clientSecret ||
    profile.schemaRegistry?.auth?.type === "basic" && profile.schemaRegistry.auth.password ||
    profile.schemaRegistry?.auth?.type === "bearer" && profile.schemaRegistry.auth.token
  );
}

function toStoredProfile(profile: ServerProfile): StoredServerProfile {
  const stored: StoredServerProfile = {
    id: profile.id,
    name: profile.name,
    brokers: profile.brokers
  };
  if (profile.security) {
    stored.security = {
      ssl: profile.security.ssl,
      sasl: profile.security.sasl
        ? {
            mechanism: profile.security.sasl.mechanism,
            tokenEndpoint: profile.security.sasl.tokenEndpoint,
            clientId: profile.security.sasl.clientId,
            clientSecretEncrypted: encryptSecret(profile.security.sasl.clientSecret),
            scope: profile.security.sasl.scope,
            audience: profile.security.sasl.audience
          }
        : undefined
    };
  }
  if (profile.schemaRegistry) {
    stored.schemaRegistry = {
      url: profile.schemaRegistry.url,
      auth: profile.schemaRegistry.auth?.type === "basic"
        ? {
            type: "basic",
            username: profile.schemaRegistry.auth.username,
            passwordEncrypted: encryptSecret(profile.schemaRegistry.auth.password)
          }
        : profile.schemaRegistry.auth?.type === "bearer"
          ? {
              type: "bearer",
              tokenEncrypted: encryptSecret(profile.schemaRegistry.auth.token)
            }
          : undefined
    };
  }
  return stored;
}

function fromStoredProfile(profile: StoredServerProfile): { profile: ServerProfile; migrated: boolean } {
  let migrated = false;
  // 복호화 실패 시 해당 서버만 시크릿 초기화 (전체 목록 로드는 유지)
  const tryDecrypt = (value: string | undefined) => {
    try { return decryptSecret(value); } catch { return undefined; }
  };
  const clientSecret = profile.security?.sasl?.clientSecret ??
    tryDecrypt(profile.security?.sasl?.clientSecretEncrypted);
  const registryPassword = profile.schemaRegistry?.auth?.type === "basic"
    ? profile.schemaRegistry.auth.password ?? tryDecrypt(profile.schemaRegistry.auth.passwordEncrypted)
    : undefined;
  const registryToken = profile.schemaRegistry?.auth?.type === "bearer"
    ? profile.schemaRegistry.auth.token ?? tryDecrypt(profile.schemaRegistry.auth.tokenEncrypted)
    : undefined;

  if (
    profile.security?.sasl?.clientSecret ||
    profile.schemaRegistry?.auth?.type === "basic" && profile.schemaRegistry.auth.password ||
    profile.schemaRegistry?.auth?.type === "bearer" && profile.schemaRegistry.auth.token
  ) {
    migrated = true;
  }

  return {
    migrated,
    profile: {
      id: profile.id,
      name: profile.name,
      brokers: profile.brokers,
      security: profile.security
        ? {
            ssl: profile.security.ssl,
            sasl: profile.security.sasl
              ? {
                  mechanism: "oauthbearer",
                  tokenEndpoint: profile.security.sasl.tokenEndpoint,
                  clientId: profile.security.sasl.clientId,
                  clientSecret: clientSecret ?? "",
                  scope: profile.security.sasl.scope,
                  audience: profile.security.sasl.audience
                }
              : undefined
          }
        : undefined,
      schemaRegistry: profile.schemaRegistry
        ? {
            url: profile.schemaRegistry.url,
            auth: profile.schemaRegistry.auth?.type === "basic"
              ? {
                  type: "basic",
                  username: profile.schemaRegistry.auth.username,
                  password: registryPassword ?? ""
                }
              : profile.schemaRegistry.auth?.type === "bearer"
                ? {
                    type: "bearer",
                    token: registryToken ?? ""
                  }
                : undefined
          }
        : undefined
    }
  };
}

export function stripServerSecrets(profile: ServerProfile): ServerProfile {
  return {
    ...profile,
    security: profile.security
      ? {
          ...profile.security,
          sasl: profile.security.sasl
            ? {
                ...profile.security.sasl,
                clientSecret: ""
              }
            : undefined
        }
      : undefined,
    schemaRegistry: profile.schemaRegistry
      ? {
          ...profile.schemaRegistry,
          auth: profile.schemaRegistry.auth?.type === "basic"
            ? {
                type: "basic",
                username: profile.schemaRegistry.auth.username,
                password: ""
              }
            : profile.schemaRegistry.auth?.type === "bearer"
              ? {
                  type: "bearer",
                  token: ""
                }
              : undefined
        }
      : undefined
  };
}

export const defaultPreferences: AppPreferences = {
  favoriteTopicsByServer: {},
  consumeDefaults: {
    inspectorMode: "raw",
    inspectorCollapsed: false,
    keyFormat: "text",
    valueFormat: "json",
    payloadEncoding: "utf-8"
  },
  viewerPreferences: {
    retentionDays: 90,
    fontSize: 13,
    fontWeight: 600,
    byServer: {}
  },
  consumeDefaultsByServer: {},
  manualAvroSchemasByServer: {},
  produceTemplatesByServer: {},
  layout: {},
  appearance: {
    fontFamily: "Inter, 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    language: "auto"
  },
  keyboardShortcuts: {},
  diagnostics: {
    logRetentionDays: 14
  },
  releaseNotes: {},
  exportFormatTemplate: "[{timestamp}] {topic}[{partition}]@{offset} key={key} headers={headers} value={value}"
};

export async function readProfiles(): Promise<ServerProfile[]> {
  try {
    const file = await readFile(profilesPath(), "utf8");
    const storedProfiles = JSON.parse(file) as StoredServerProfile[];
    const converted = storedProfiles.map(fromStoredProfile);
    const profiles = converted.map((item) => item.profile);
    if (converted.some((item) => item.migrated)) {
      await writeProfiles(profiles);
    }
    return profiles;
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return [];
    }
    await writeAppLog("warn", "storage.servers", "Failed to read servers.json. Trying backup.", error);
    try {
      const backupFile = await readFile(profilesBackupPath(), "utf8");
      const storedProfiles = JSON.parse(backupFile) as StoredServerProfile[];
      const converted = storedProfiles.map(fromStoredProfile);
      const profiles = converted.map((item) => item.profile);
      if (converted.some((item) => item.migrated)) {
        await writeProfiles(profiles);
      } else {
        await restoreFileFromBackup(profilesPath(), backupFile);
      }
      await writeAppLog("info", "storage.servers", "Restored servers.json from backup.");
      return profiles;
    } catch (backupError) {
      await writeAppLog("error", "storage.servers", "Failed to restore servers.json from backup. Returning empty list.", backupError);
      return [];
    }
  }
}

export async function readProfilesForExport(): Promise<ServerProfile[]> {
  return (await readProfiles()).map(stripServerSecrets);
}

export async function writeProfiles(profiles: ServerProfile[]) {
  if (profiles.some(hasProfileSecrets)) {
    requireSafeStorage();
  }
  await writeFileWithBackup(profilesPath(), profilesBackupPath(), JSON.stringify(profiles.map(toStoredProfile), null, 2));
}

export async function readPreferences(): Promise<AppPreferences> {
  try {
    const file = await readFile(preferencesPath(), "utf8");
    return normalizePreferences(JSON.parse(file) as Partial<AppPreferences>);
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return defaultPreferences;
    }
    await writeAppLog("warn", "storage.preferences", "Failed to read preferences.json. Trying backup preferences.", error);
    try {
      const backupFile = await readFile(preferencesBackupPath(), "utf8");
      const preferences = normalizePreferences(JSON.parse(backupFile) as Partial<AppPreferences>);
      await restoreFileFromBackup(preferencesPath(), JSON.stringify(preferences, null, 2));
      await writeAppLog("info", "storage.preferences", "Restored preferences.json from backup.");
      return preferences;
    } catch (backupError) {
      await writeAppLog("error", "storage.preferences", "Failed to restore preferences.json from backup. Using default preferences.", backupError);
      return defaultPreferences;
    }
  }
}

export async function writePreferences(preferences: AppPreferences) {
  await writeFileWithBackup(preferencesPath(), preferencesBackupPath(), JSON.stringify(normalizePreferences(preferences), null, 2));
}

export function normalizePreferences(preferences?: Partial<AppPreferences>): AppPreferences {
  return {
    favoriteTopicsByServer: preferences?.favoriteTopicsByServer ?? {},
    consumeDefaults: preferences?.consumeDefaults ?? defaultPreferences.consumeDefaults,
    viewerPreferences: preferences?.viewerPreferences ?? defaultPreferences.viewerPreferences,
    consumeDefaultsByServer: preferences?.consumeDefaultsByServer ?? {},
    manualAvroSchemasByServer: preferences?.manualAvroSchemasByServer ?? {},
    produceTemplatesByServer: preferences?.produceTemplatesByServer ?? {},
    layout: preferences?.layout ?? {},
    appearance: preferences?.appearance ?? defaultPreferences.appearance,
    keyboardShortcuts: preferences?.keyboardShortcuts ?? {},
    diagnostics: preferences?.diagnostics ?? defaultPreferences.diagnostics,
    releaseNotes: preferences?.releaseNotes ?? {},
    exportFormatTemplate: preferences?.exportFormatTemplate ?? defaultPreferences.exportFormatTemplate,
    windowBounds: preferences?.windowBounds,
    migratedFromKafkaTool: preferences?.migratedFromKafkaTool
  };
}

export function mergePreferences(current: AppPreferences, next: AppPreferences): AppPreferences {
  return {
    ...current,
    ...next,
    favoriteTopicsByServer: next.favoriteTopicsByServer ?? current.favoriteTopicsByServer,
    consumeDefaults: {
      ...(current.consumeDefaults ?? {}),
      ...(next.consumeDefaults ?? {})
    },
    viewerPreferences: {
      ...(current.viewerPreferences ?? {}),
      ...(next.viewerPreferences ?? {}),
      byServer: next.viewerPreferences?.byServer ?? current.viewerPreferences?.byServer ?? {}
    },
    consumeDefaultsByServer: next.consumeDefaultsByServer ?? current.consumeDefaultsByServer,
    manualAvroSchemasByServer: next.manualAvroSchemasByServer ?? current.manualAvroSchemasByServer,
    produceTemplatesByServer: next.produceTemplatesByServer ?? current.produceTemplatesByServer,
    layout: {
      ...(current.layout ?? {}),
      ...(next.layout ?? {})
    },
    appearance: {
      ...(current.appearance ?? {}),
      ...(next.appearance ?? {})
    },
    keyboardShortcuts: {
      ...(current.keyboardShortcuts ?? {}),
      ...(next.keyboardShortcuts ?? {})
    },
    diagnostics: {
      ...(current.diagnostics ?? {}),
      ...(next.diagnostics ?? {})
    },
    releaseNotes: {
      ...(current.releaseNotes ?? {}),
      ...(next.releaseNotes ?? {})
    },
    windowBounds: next.windowBounds ?? current.windowBounds
  };
}

export function normalizeImportedServers(servers: unknown): ServerProfile[] {
  if (!Array.isArray(servers)) {
    throw new Error("Settings file does not contain a servers array.");
  }
  return servers.map((server) => {
    const item = server as Partial<ServerProfile>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const brokers = Array.isArray(item.brokers)
      ? item.brokers.map((broker) => String(broker).trim()).filter(Boolean)
      : [];
    if (!name || brokers.length === 0) {
      throw new Error("Server settings file contains an invalid server entry.");
    }
    return {
      id: typeof item.id === "string" && item.id.trim() ? item.id : randomUUID(),
      name,
      brokers,
      security: item.security,
      schemaRegistry: item.schemaRegistry
    };
  });
}

function sameServerIdentity(left: ServerProfile, right: ServerProfile) {
  return left.id === right.id ||
    left.name === right.name && left.brokers.join(",") === right.brokers.join(",");
}

function isEmpty(value: string | undefined) {
  return !value || value.trim().length === 0;
}

export function preserveExistingSecrets(importedServers: ServerProfile[], existingServers: ServerProfile[]) {
  return importedServers.map((server) => {
    const existing = existingServers.find((item) => sameServerIdentity(item, server));
    if (!existing) return server;
    return {
      ...server,
      security: server.security
        ? {
            ...server.security,
            sasl: server.security.sasl
              ? {
                  ...server.security.sasl,
                  clientSecret: isEmpty(server.security.sasl.clientSecret)
                    ? existing.security?.sasl?.clientSecret ?? ""
                    : server.security.sasl.clientSecret
                }
              : undefined
          }
        : server.security,
      schemaRegistry: server.schemaRegistry
        ? {
            ...server.schemaRegistry,
            auth: server.schemaRegistry.auth?.type === "basic"
              ? {
                  ...server.schemaRegistry.auth,
                  password: isEmpty(server.schemaRegistry.auth.password)
                    ? existing.schemaRegistry?.auth?.type === "basic" ? existing.schemaRegistry.auth.password ?? "" : ""
                    : server.schemaRegistry.auth.password
                }
              : server.schemaRegistry.auth?.type === "bearer"
                ? {
                    ...server.schemaRegistry.auth,
                    token: isEmpty(server.schemaRegistry.auth.token)
                      ? existing.schemaRegistry?.auth?.type === "bearer" ? existing.schemaRegistry.auth.token ?? "" : ""
                      : server.schemaRegistry.auth.token
                  }
                : undefined
          }
        : server.schemaRegistry
    };
  });
}

export async function getProfile(serverId: string) {
  const profiles = await readProfiles();
  const profile = profiles.find((item) => item.id === serverId);
  if (!profile) {
    throw new Error("Registered server not found.");
  }
  return profile;
}
