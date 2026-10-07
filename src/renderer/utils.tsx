import React from "react";
import type { ConsumedMessage, TopicSummary } from "../shared/types";
import { topicSortOptions, type TopicSortMode, type TopicWorkView, type View } from "./uiTypes";

export function previewValue(value: string) {
  if (!value) return "(empty)";
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
}

export function formatHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return "-";
  return JSON.stringify(headers);
}

export function previewHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return "-";
  const text = entries.map(([key, value]) => `${key}=${value}`).join(", ");
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

export function parseTopicCount(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

export function formatCount(value?: string) {
  const count = Number(parseTopicCount(value));
  if (!Number.isFinite(count)) return "-";
  return formatCompactNumber(count);
}

export function formatCompactNumber(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function isTopicWorkView(view: View): view is TopicWorkView {
  return view === "info" || view === "consume" || view === "produce" || view === "settings";
}

export function getTopicSortLabel(value: TopicSortMode) {
  return topicSortOptions.find((option) => option.value === value)?.label ?? "Name A-Z";
}

export function sortTopics(topics: TopicSummary[], sortMode: TopicSortMode, favoriteTopicNames: string[]) {
  const favorites = new Set(favoriteTopicNames);
  return [...topics].sort((left, right) => {
    if (sortMode === "favoritesFirst") {
      const favoriteDiff = Number(favorites.has(right.name)) - Number(favorites.has(left.name));
      if (favoriteDiff !== 0) return favoriteDiff;
      return left.name.localeCompare(right.name);
    }
    if (sortMode === "messagesDesc") {
      const countCompare = compareBigInt(parseTopicCount(right.messageCount), parseTopicCount(left.messageCount));
      if (countCompare !== 0) return countCompare;
    }
    if (sortMode === "partitionsDesc") {
      const partitionCompare = right.partitions - left.partitions;
      if (partitionCompare !== 0) return partitionCompare;
    }
    return left.name.localeCompare(right.name);
  });
}

export function compareBigInt(left: bigint, right: bigint) {
  return left > right ? 1 : left < right ? -1 : 0;
}

export function getPartitionColor(partition: number) {
  const colors = ["#0891b2", "#0f766e", "#7c3aed", "#ca8a04", "#dc2626", "#2563eb", "#16a34a", "#c026d3"];
  return colors[Math.abs(partition) % colors.length];
}

export function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("ko-KR", { hour12: false });
}

export function formatMessagePayload(message: ConsumedMessage) {
  const parsedValue = parseJson(message.value);
  const payload: Record<string, unknown> = {
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    timestamp: message.timestamp,
    key: message.key,
    value: parsedValue,
    headers: message.headers
  };
  if (message.decoded) {
    payload.decoded = message.decoded;
  }
  return payload;
}

export function parseJson(value: string) {
  if (!value) return "";
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function formatProduceValue(value: string) {
  const parsed = parseJson(value);
  return typeof parsed === "string" ? value : JSON.stringify(parsed, null, 2);
}

export function validateJsonLikeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }
  try {
    JSON.parse(trimmed);
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Value JSON format is invalid. ${detail}`;
  }
}

export function parseProduceHeaders(value: string): Record<string, string> | string {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Headers must be a JSON object.";
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, headerValue]) => headerValue !== null && headerValue !== undefined)
        .map(([key, headerValue]) => [key, typeof headerValue === "string" ? headerValue : JSON.stringify(headerValue)])
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Headers JSON format is invalid. ${detail}`;
  }
}

export function sanitizeFontFamily(value: string) {
  return value.replace(/[;{}]/g, "").trim();
}

export function stringifyPrimitive(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return String(value);
}

export function renderHighlightedText(text: string, query: string) {
  if (!query) return text;
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let index = normalizedText.indexOf(normalizedQuery);
  while (index >= 0) {
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(<mark key={`${text}-${index}`}>{text.slice(index, index + query.length)}</mark>);
    cursor = index + query.length;
    index = normalizedText.indexOf(normalizedQuery, cursor);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function renderRawJsonText(text: string, query: string) {
  const nodes: React.ReactNode[] = [];
  const epochPattern = /\b\d{10,13}\b/g;
  let cursor = 0;
  let match = epochPattern.exec(text);

  while (match) {
    const value = match[0];
    const index = match.index;
    if (index > cursor) {
      nodes.push(<React.Fragment key={`text-${cursor}`}>{renderHighlightedText(text.slice(cursor, index), query)}</React.Fragment>);
    }
    nodes.push(
      <span key={`epoch-${index}`} className="epoch-token" title={getEpochTitle(value)}>
        {renderHighlightedText(value, query)}
      </span>
    );
    cursor = index + value.length;
    match = epochPattern.exec(text);
  }

  if (cursor < text.length) {
    nodes.push(<React.Fragment key={`text-${cursor}`}>{renderHighlightedText(text.slice(cursor), query)}</React.Fragment>);
  }

  return nodes;
}

export function getEpochTitle(value: unknown) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\d{10,13}$/.test(text)) return undefined;
  const millis = text.length === 10 ? Number(text) * 1000 : Number(text);
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString("ko-KR", { hour12: false });
}
