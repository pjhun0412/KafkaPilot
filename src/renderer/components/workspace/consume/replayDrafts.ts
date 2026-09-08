import type { ConsumedMessage } from "../../../../shared/types";
import type { ReplayDraft, ReplayPayloadOptions } from "../../../replayTypes";
import { formatProduceValue } from "../../../utils";

export type ReplaySourceKind = "single" | "selected" | "filtered" | "all";

export type ReplayOrder = "grid" | "original" | "timestamp";

export type ReplayFieldOverride = {
  id: string;
  path: string;
  value: string;
};

export type ReplayOverrideTreeNode = {
  children: Map<string, ReplayOverrideTreeNode>;
  fullPath: string;
  leafPath?: string;
  name: string;
};

export function createReplayOverrideTree(paths: string[]) {
  const root: ReplayOverrideTreeNode = { name: "", fullPath: "", children: new Map() };
  for (const path of paths) {
    const segments = path.split(".").filter(Boolean);
    let current = root;
    segments.forEach((segment, index) => {
      const fullPath = segments.slice(0, index + 1).join(".");
      if (!current.children.has(segment)) {
        current.children.set(segment, { name: segment, fullPath, children: new Map() });
      }
      current = current.children.get(segment) as ReplayOverrideTreeNode;
      if (index === segments.length - 1) current.leafPath = path;
    });
  }
  return root;
}

export function getReplayOverrideLeafPaths(node: ReplayOverrideTreeNode): string[] {
  if (node.leafPath && node.children.size === 0) return [node.leafPath];
  return Array.from(node.children.values()).flatMap(getReplayOverrideLeafPaths);
}

export function getDefaultReplayOverrideValue(path: string) {
  const leaf = path.split(".").at(-1)?.toLowerCase() ?? "";
  if (leaf === "year") return "${date:yyyy}";
  if (leaf === "month") return "${date:MM}";
  if (leaf === "day") return "${date:dd}";
  if (leaf === "hour") return "${date:HH}";
  if (leaf === "minute") return "${date:mm}";
  if (leaf === "second") return "${date:ss}";
  if (leaf === "millisecond") return "${date:SSS}";
  if (leaf.includes("time") || leaf.includes("timestamp")) return "${timestamp}";
  return "";
}

export function parseReplayOverrideValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

export function setValueAtPath(target: unknown, path: string, value: unknown) {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0 || typeof target !== "object" || target === null || Array.isArray(target)) return false;
  let cursor = target as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) return false;
    const next = cursor[segment];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  const leaf = segments.at(-1);
  if (!leaf) return false;
  cursor[leaf] = value;
  return true;
}

export function compareMessageOffset(left: ConsumedMessage, right: ConsumedMessage) {
  const partitionDiff = left.partition - right.partition;
  if (partitionDiff !== 0) return partitionDiff;
  const leftOffset = Number(left.offset);
  const rightOffset = Number(right.offset);
  if (Number.isFinite(leftOffset) && Number.isFinite(rightOffset)) return leftOffset - rightOffset;
  return left.offset.localeCompare(right.offset, undefined, { numeric: true });
}

export function getReplayOrderedMessages(messages: ConsumedMessage[], order: ReplayOrder) {
  if (order === "grid") return [...messages];
  if (order === "timestamp") {
    return [...messages].sort((left, right) => {
      const timeDiff = Date.parse(left.timestamp) - Date.parse(right.timestamp);
      return timeDiff || compareMessageOffset(left, right);
    });
  }
  return [...messages].sort(compareMessageOffset);
}

export function createReplayDraft(message: ConsumedMessage, payload: ReplayPayloadOptions): ReplayDraft {
  return {
    key: payload.key ? message.key : "",
    headers: payload.headers ? JSON.stringify(message.headers ?? {}, null, 2) : "{}",
    value: payload.value
      ? message.decoded?.value === undefined ? formatProduceValue(message.value) : JSON.stringify(message.decoded.value, null, 2)
      : ""
  };
}
