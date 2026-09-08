import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import { parseProduceDurationMs, type ProduceTemplateIssue } from "../../../produceTemplate";
import { validateJsonLikeValue } from "../../../utils";
import type { ProduceIntervalConfig } from "./producePanelTypes";

export function createTemplateId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function tryPrettyJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function formatTemplateIssue(issue: ProduceTemplateIssue, language: ReturnType<typeof useAppLanguage>) {
  const fieldKey = issue.field === "key" ? "label.key" : issue.field === "headers" ? "label.headers" : "label.value";
  return `${t(language, fieldKey)} ${issue.token}: ${issue.message}`;
}

export function getJsonValueIssue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  const validationMessage = validateJsonLikeValue(value);
  if (!validationMessage) return null;
  const position = getJsonErrorPosition(validationMessage);
  if (position < 0) {
    return { caretColumn: 0, column: 0, line: 0, message: validationMessage, snippet: "" };
  }
  const location = getTextLocation(value, position);
  const lineText = value.split(/\r?\n/)[location.line - 1] ?? "";
  return {
    caretColumn: Math.max(0, location.column - 1),
    column: location.column,
    line: location.line,
    message: validationMessage,
    snippet: lineText
  };
}

export function getJsonErrorPosition(message: string) {
  const match = /position (\d+)/i.exec(message);
  return match ? Number(match[1]) : -1;
}

export function getTextLocation(value: string, position: number) {
  const prefix = value.slice(0, Math.max(0, position));
  const lines = prefix.split(/\r?\n/);
  return {
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
    line: lines.length
  };
}

export function createProduceIntervalPlan({ intervalMs, totalCount, durationText, stopMode }: ProduceIntervalConfig) {
  const delay = Math.max(100, Math.floor(intervalMs || 100));
  const count = Math.max(1, Math.min(100000, Math.floor(totalCount || 1)));
  const durationMs = parseProduceDurationMs(durationText);
  const estimatedMax = stopMode === "count" ? count : durationMs > 0 ? Math.ceil(durationMs / delay) : 0;
  return { count, delay, durationMs, estimatedMax };
}

export function getIntervalConfigurationIssue(config: ProduceIntervalConfig, templateIssues: ProduceTemplateIssue[], language: Parameters<typeof t>[0]): string | null {
  if (config.intervalMs < 100) return "Every must be at least 100ms.";
  if (config.stopMode === "count" && (!Number.isFinite(config.totalCount) || config.totalCount < 1 || config.totalCount > 100000)) {
    return "Count must be between 1 and 100,000.";
  }
  if (config.stopMode === "duration" && createProduceIntervalPlan(config).durationMs <= 0) {
    return "Duration must be like 30s, 5m, 1h, or 1m30s.";
  }
  if (templateIssues.length > 0) return formatTemplateIssue(templateIssues[0], language);
  return null;
}
