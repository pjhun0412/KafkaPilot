import { app, shell } from "electron";
import { appendFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

export type LogLevel = "info" | "warn" | "error";

export type RendererLogPayload = {
  level: LogLevel;
  message: string;
  stack?: string;
  source?: string;
};

const LOG_RETENTION_DAYS = 14;

function logsDirectory() {
  return path.join(app.getPath("userData"), "logs");
}

function logFilePath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(logsDirectory(), `kafkapilot-${day}.log`);
}

function redact(value: string) {
  return value
    .replace(/(client[_-]?secret["'\s:=]+)([^"',\s]+)/gi, "$1[REDACTED]")
    .replace(/(password["'\s:=]+)([^"',\s]+)/gi, "$1[REDACTED]")
    .replace(/(token["'\s:=]+)([^"',\s]+)/gi, "$1[REDACTED]")
    .replace(/(authorization["'\s:=]+)([^"',\s]+)/gi, "$1[REDACTED]");
}

function serializeError(error: Error, depth = 0): string {
  const lines = [error.stack || `${error.name}: ${error.message}`];
  const errorRecord = error as Error & Record<string, unknown> & { cause?: unknown };
  const entries = Object.entries(errorRecord).filter(([key]) => key !== "cause");
  if (entries.length > 0) {
    try {
      lines.push(JSON.stringify(Object.fromEntries(entries)));
    } catch {
      lines.push(String(Object.fromEntries(entries)));
    }
  }
  if (errorRecord.cause && depth < 4) {
    lines.push(`Caused by: ${serializeDetail(errorRecord.cause, depth + 1)}`);
  }
  return lines.join("\n");
}

function serializeDetail(detail: unknown, depth = 0) {
  if (!detail) return "";
  if (detail instanceof Error) {
    return serializeError(detail, depth);
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export async function writeAppLog(level: LogLevel, scope: string, message: string, detail?: unknown) {
  const detailText = serializeDetail(detail);
  const lines = [
    `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${redact(message)}`,
    detailText ? redact(detailText) : "",
    ""
  ].filter((line, index) => index !== 1 || line.length > 0);
  try {
    await mkdir(logsDirectory(), { recursive: true });
    await appendFile(logFilePath(), `${lines.join("\n")}\n`, "utf8");
  } catch {
    // Logging must never break the application flow.
  }
}

export async function pruneOldLogs(retentionDays = LOG_RETENTION_DAYS) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  try {
    await mkdir(logsDirectory(), { recursive: true });
    const entries = await readdir(logsDirectory(), { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isFile() && /^kafkapilot-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name))
      .map(async (entry) => {
        const day = entry.name.slice("kafkapilot-".length, "kafkapilot-YYYY-MM-DD".length);
        const time = Date.parse(`${day}T00:00:00.000Z`);
        if (Number.isFinite(time) && time < cutoff) {
          await rm(path.join(logsDirectory(), entry.name), { force: true });
        }
      }));
  } catch {
    // Log pruning is best-effort.
  }
}

export function logMainError(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  void writeAppLog("error", scope, message, error);
}

export function logRendererError(payload: RendererLogPayload) {
  void writeAppLog(payload.level, payload.source ? `renderer:${payload.source}` : "renderer", payload.message, payload.stack);
}

export async function openLogsFolder() {
  await mkdir(logsDirectory(), { recursive: true });
  return shell.openPath(logsDirectory());
}

export function getLogsDirectory() {
  return logsDirectory();
}
