import type { ConsumedMessage } from "../shared/types";
import type { ConsumeFilterField } from "./uiTypes";
import { formatHeaders, formatTimestamp, parseJson } from "./utils";

type MessageSearchField = Exclude<ConsumeFilterField, "all" | "headersEmpty"> | "topic" | "decoded";
type MessagePathOperator = "==" | "!=" | ">" | ">=" | "<" | "<=" | "~=" | "exists" | "!exists";
type MessageTextSearchTerm = {
  kind: "text";
  field: MessageSearchField | "empty" | "has" | null;
  value: string;
  negated: boolean;
  regex: RegExp | null;
};
type MessagePathSearchTerm = {
  kind: "path";
  path: string;
  operator: MessagePathOperator;
  value: string;
  negated: boolean;
};
type MessageSearchTerm = MessageTextSearchTerm | MessagePathSearchTerm;

const messageFilterAliases: Record<string, MessageTextSearchTerm["field"]> = {
  all: null,
  k: "key",
  key: "key",
  v: "value",
  value: "value",
  h: "headers",
  header: "headers",
  headers: "headers",
  offset: "offset",
  off: "offset",
  partition: "partition",
  p: "partition",
  timestamp: "timestamp",
  time: "timestamp",
  ts: "timestamp",
  topic: "topic",
  decoded: "decoded",
  avro: "decoded",
  empty: "empty",
  has: "has"
};

const messageValueCache = new WeakMap<ConsumedMessage, { raw: string; parsed: unknown }>();

export function filterMessages(messages: ConsumedMessage[], filterText: string, filterField: ConsumeFilterField) {
  const query = filterText.trim();
  const terms = parseMessageFilterTerms(query);
  if (filterField !== "headersEmpty" && terms.length === 0) return messages;
  return messages.filter((message) => {
    if (filterField === "headersEmpty" && Object.keys(message.headers ?? {}).length > 0) {
      return false;
    }
    if (terms.length === 0) return true;
    return terms.every((term) => {
      const matched = matchMessageSearchTerm(message, term, filterField);
      return term.negated ? !matched : matched;
    });
  });
}

export function getMessageFilterHelpText() {
  return 'Examples: key:PR1001 value:OK !error /timeout/i empty:headers value.proc_id == "PR0116" decoded.speed >= 80 headers.traceId exists';
}

function parseMessageFilterTerms(query: string): MessageSearchTerm[] {
  const tokens = splitSearchTokens(query);
  const terms: MessageSearchTerm[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const compactPathTerm = parseCompactPathFilterToken(tokens[index]);
    if (compactPathTerm) {
      terms.push(compactPathTerm);
      continue;
    }
    const spacedPathTerm = parseSpacedPathFilterToken(tokens, index);
    if (spacedPathTerm) {
      terms.push(spacedPathTerm.term);
      index += spacedPathTerm.consumed - 1;
      continue;
    }
    const textTerm = parseMessageFilterToken(tokens[index]);
    if (textTerm) terms.push(textTerm);
  }
  return terms;
}

function splitSearchTokens(query: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  for (let index = 0; index < query.length; index += 1) {
    const char = query[index];
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (!quote && char === "/" && isRegexPrefix(current)) {
      const end = findRegexEnd(query, index);
      if (end !== -1) {
        current += query.slice(index, end + 1);
        index = end;
        continue;
      }
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (quote === char) {
      quote = null;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function isRegexPrefix(prefix: string) {
  const field = prefix.replace(/^[!-]/, "");
  return field === "" || (field.endsWith(":") && Object.prototype.hasOwnProperty.call(messageFilterAliases, field.slice(0, -1).toLowerCase()));
}

function findRegexEnd(query: string, start: number) {
  let inCharacterClass = false;
  for (let index = start + 1; index < query.length; index += 1) {
    const char = query[index];
    if (char === "\\") { index += 1; continue; }
    if (char === "[") inCharacterClass = true;
    if (char === "]") inCharacterClass = false;
    if (char !== "/" || inCharacterClass) continue;
    let end = index + 1;
    while (end < query.length && /[a-z]/i.test(query[end])) end += 1;
    if (end === query.length || /\s/.test(query[end])) return end - 1;
  }
  return -1;
}

function parseMessageFilterToken(token: string): MessageTextSearchTerm | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const negated = trimmed.startsWith("!") || (trimmed.startsWith("-") && !/^-?\d/.test(trimmed));
  const withoutNegation = negated ? trimmed.slice(1) : trimmed;
  const separatorIndex = withoutNegation.indexOf(":");
  const rawField = separatorIndex > 0 ? withoutNegation.slice(0, separatorIndex).toLowerCase() : "";
  const field = rawField ? messageFilterAliases[rawField] : null;
  const rawValue = rawField && field !== undefined ? withoutNegation.slice(separatorIndex + 1) : withoutNegation;
  const regex = parseRegexLiteral(rawValue);
  return {
    kind: "text",
    field: rawField && field !== undefined ? field : null,
    value: regex ? rawValue : rawValue.toLowerCase(),
    negated,
    regex
  };
}

function parseCompactPathFilterToken(token: string): MessagePathSearchTerm | null {
  const match = token.match(/^([!-]?)([a-zA-Z][\w-]*(?:\.[\w$-]+|\[[^\]]+\])*)\s*(==|!=|>=|<=|>|<|~=)\s*(.+)$/);
  if (!match) return null;
  const [, negation, path, operator, value] = match;
  if (!isMessagePath(path)) return null;
  return {
    kind: "path",
    path,
    operator: operator as MessagePathOperator,
    value,
    negated: Boolean(negation)
  };
}

function parseSpacedPathFilterToken(tokens: string[], index: number): { term: MessagePathSearchTerm; consumed: number } | null {
  const pathToken = tokens[index];
  const operatorToken = tokens[index + 1];
  if (!pathToken || !operatorToken) return null;
  const negated = pathToken.startsWith("!") || pathToken.startsWith("-");
  const path = negated ? pathToken.slice(1) : pathToken;
  if (!isMessagePath(path)) return null;
  if (operatorToken === "exists" || operatorToken === "!exists") {
    return { consumed: 2, term: { kind: "path", path, operator: operatorToken, value: "", negated } };
  }
  if (!["==", "!=", ">", ">=", "<", "<=", "~="].includes(operatorToken)) return null;
  const valueToken = tokens[index + 2];
  if (valueToken === undefined) return null;
  return {
    consumed: 3,
    term: { kind: "path", path, operator: operatorToken as MessagePathOperator, value: valueToken, negated }
  };
}

function isMessagePath(path: string) {
  return /^(value|decoded|headers|key|topic|offset|partition|timestamp)(\.|$|\[)/.test(path);
}

function parseRegexLiteral(value: string) {
  if (!value.startsWith("/") || value.lastIndexOf("/") <= 0) return null;
  const lastSlash = value.lastIndexOf("/");
  const pattern = value.slice(1, lastSlash);
  const flags = value.slice(lastSlash + 1) || "i";
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function matchMessageSearchTerm(message: ConsumedMessage, term: MessageSearchTerm, selectedField: ConsumeFilterField) {
  if (term.kind === "path") return matchMessagePathTerm(message, term);
  if (term.field === "empty") return matchEmptyMessageField(message, term.value);
  if (term.field === "has") return !matchEmptyMessageField(message, term.value);
  const values = getMessageSearchValues(message, term.field, selectedField);
  const regex = term.regex;
  if (regex) return values.some((value) => {
    regex.lastIndex = 0;
    return regex.test(value);
  });
  return values.some((value) => value.toLowerCase().includes(term.value));
}

function matchMessagePathTerm(message: ConsumedMessage, term: MessagePathSearchTerm) {
  const actual = getMessagePathValue(message, term.path);
  const exists = actual !== undefined && actual !== null;
  if (term.operator === "exists") return exists;
  if (term.operator === "!exists") return !exists;
  if (!exists) return false;
  const expected = parseFilterComparisonValue(term.value);
  if (term.operator === "~=") return String(actual).toLowerCase().includes(String(expected).toLowerCase());
  if (term.operator === "==" || term.operator === "!=") {
    const equals = compareFilterValues(actual, expected) === 0;
    return term.operator === "==" ? equals : !equals;
  }
  const compared = compareFilterValues(actual, expected);
  if (term.operator === ">") return compared > 0;
  if (term.operator === ">=") return compared >= 0;
  if (term.operator === "<") return compared < 0;
  if (term.operator === "<=") return compared <= 0;
  return false;
}

function getMessagePathValue(message: ConsumedMessage, path: string): unknown {
  const [root, ...pathParts] = normalizeFilterPath(path).split(".");
  let value: unknown;
  if (root === "value") value = getCachedMessageValue(message);
  if (root === "decoded") value = message.decoded?.value ?? message.decoded;
  if (root === "headers") value = message.headers;
  if (root === "key") value = message.key;
  if (root === "topic") value = message.topic;
  if (root === "offset") value = message.offset;
  if (root === "partition") value = message.partition;
  if (root === "timestamp") value = message.timestamp;
  return pathParts.reduce((current, part) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    if (typeof current === "object") return (current as Record<string, unknown>)[part];
    return undefined;
  }, value);
}

function getCachedMessageValue(message: ConsumedMessage) {
  const cached = messageValueCache.get(message);
  if (cached && cached.raw === message.value) return cached.parsed;
  const parsed = parseJson(message.value);
  messageValueCache.set(message, { raw: message.value, parsed });
  return parsed;
}

function normalizeFilterPath(path: string) {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/\[['"]?([^'"\]]+)['"]?\]/g, ".$1")
    .replace(/^\./, "");
}

function parseFilterComparisonValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed !== "" && /^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function compareFilterValues(actual: unknown, expected: unknown) {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    return actualNumber === expectedNumber ? 0 : actualNumber > expectedNumber ? 1 : -1;
  }
  const actualTime = Date.parse(String(actual));
  const expectedTime = Date.parse(String(expected));
  if (Number.isFinite(actualTime) && Number.isFinite(expectedTime)) {
    return actualTime === expectedTime ? 0 : actualTime > expectedTime ? 1 : -1;
  }
  const actualText = String(actual).toLowerCase();
  const expectedText = String(expected).toLowerCase();
  return actualText === expectedText ? 0 : actualText > expectedText ? 1 : -1;
}

function matchEmptyMessageField(message: ConsumedMessage, value: string) {
  const field = value.toLowerCase();
  if (field === "header" || field === "headers" || field === "h") return Object.keys(message.headers ?? {}).length === 0;
  if (field === "key" || field === "k") return message.key.length === 0;
  if (field === "value" || field === "v") return message.value.length === 0;
  return false;
}

function getMessageSearchValues(message: ConsumedMessage, explicitField: MessageSearchField | null, selectedField: ConsumeFilterField) {
  const effectiveField = explicitField ?? (selectedField === "headersEmpty" ? "all" : selectedField);
  if (effectiveField === "key") return [message.key];
  if (effectiveField === "value") return [message.value, message.decoded?.value !== undefined ? JSON.stringify(message.decoded.value) : ""];
  if (effectiveField === "headers") return [formatHeaders(message.headers), ...Object.entries(message.headers ?? {}).flatMap(([key, value]) => [key, value, `${key}=${value}`])];
  if (effectiveField === "offset") return [message.offset];
  if (effectiveField === "partition") return [String(message.partition)];
  if (effectiveField === "timestamp") return [message.timestamp, formatTimestamp(message.timestamp)];
  if (effectiveField === "topic") return [message.topic];
  if (effectiveField === "decoded") return [message.decoded ? JSON.stringify(message.decoded) : ""];
  return [
    message.topic,
    message.key,
    message.value,
    message.decoded ? JSON.stringify(message.decoded) : "",
    message.offset,
    String(message.partition),
    message.timestamp,
    formatTimestamp(message.timestamp),
    formatHeaders(message.headers)
  ];
}
