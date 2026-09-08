export type ProduceTemplateDraft = {
  key: string;
  headers: string;
  value: string;
};

export type ProduceTemplateIssue = {
  field: keyof ProduceTemplateDraft;
  message: string;
  token: string;
};

export type ProduceIntervalRequest = {
  draft: ProduceTemplateDraft;
  stopMode: "count" | "duration";
  intervalMs: number;
  count: number;
  durationText: string;
};

const tokenPattern = /\\?\$\{([^}]+)\}/g;

type ParsedOptions = Record<string, string>;

type ParsedToken = {
  expression: string;
  kind: string;
  options: ParsedOptions;
};

function parseOptions(optionText = ""): ParsedOptions {
  return optionText.split("|").reduce<ParsedOptions>((options, option) => {
    const [key, ...valueParts] = option.split("=");
    if (key && valueParts.length > 0) options[key.trim()] = valueParts.join("=").trim();
    return options;
  }, {});
}

function parsePositiveIntegerOption(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseRange(expression: string) {
  const match = /^(-?\d+)\.{2,3}(-?\d+)(?:\|(.+))?$/.exec(expression.trim());
  if (!match) return null;
  const [, startText, endText, optionText = ""] = match;
  const start = Number(startText);
  const end = Number(endText);
  const options = parseOptions(optionText);
  const inferredPad = /^0\d+/.test(startText) || /^0\d+/.test(endText)
    ? Math.max(startText.replace(/^-/, "").length, endText.replace(/^-/, "").length)
    : 0;
  return {
    start,
    end,
    options,
    pad: parsePositiveIntegerOption(options.pad, inferredPad),
    step: parsePositiveIntegerOption(options.step, 1)
  };
}

function parseFloatRange(expression: string) {
  const match = /^(-?\d+(?:\.\d+)?)\.{2,3}(-?\d+(?:\.\d+)?)(?:\|(.+))?$/.exec(expression.trim());
  if (!match) return null;
  const [, startText, endText, optionText = ""] = match;
  return {
    start: Number(startText),
    end: Number(endText),
    options: parseOptions(optionText)
  };
}

function parseToken(token: string): ParsedToken {
  const colonIndex = token.indexOf(":");
  const rawKind = colonIndex >= 0 ? token.slice(0, colonIndex) : token;
  const expression = colonIndex >= 0 ? token.slice(colonIndex + 1) : "";
  const [kind, ...kindOptionParts] = rawKind.split("|");
  return {
    expression,
    kind: kind.trim().toLowerCase(),
    options: parseOptions(kindOptionParts.join("|"))
  };
}

function splitExpressionOptions(expression: string) {
  const [value, ...optionParts] = expression.split("|");
  return {
    options: parseOptions(optionParts.join("|")),
    value
  };
}

function parseOffsetMs(offsetText: string | undefined) {
  const compact = offsetText?.trim().toLowerCase();
  if (!compact) return 0;
  const match = /^([+-]?)(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(compact);
  if (!match) return NaN;
  const [, signText, amountText, unit] = match;
  const sign = signText === "-" ? -1 : 1;
  const amount = Number(amountText);
  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    ms: 1,
    s: 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };
  return sign * amount * multipliers[unit];
}

function dateWithOffset(options: ParsedOptions) {
  const offsetMs = parseOffsetMs(options.offset);
  return new Date(Date.now() + (Number.isFinite(offsetMs) ? offsetMs : 0));
}

function getTokenIssue(token: string) {
  const { expression, kind: normalizedKind, options: tokenOptions } = parseToken(token);
  const dateOptions = splitExpressionOptions(expression).options;
  const offset = tokenOptions.offset ?? dateOptions.offset;

  if (!normalizedKind) return "Token name is empty.";
  if (normalizedKind === "seq") {
    return expression && !parseRange(expression)
      ? "Use ${seq} or ${seq:start..end|step=n|pad=n}."
      : "";
  }
  if (normalizedKind === "number" || normalizedKind === "random") {
    return parseRange(expression) ? "" : "Use a numeric range such as ${random:1..100}.";
  }
  if (normalizedKind === "float") {
    return parseFloatRange(expression) ? "" : "Use a decimal range such as ${float:0..1|fixed=2}.";
  }
  if (normalizedKind === "choice") {
    return expression.split("|").filter(Boolean).length > 0
      ? ""
      : "Provide choices separated by |, such as ${choice:A|B|C}.";
  }
  if (normalizedKind === "timestamp") {
    const { value } = splitExpressionOptions(expression);
    if (offset && !Number.isFinite(parseOffsetMs(offset))) return "Use offset like offset=-3d or offset=+1h.";
    return !value || value === "s" || value === "seconds"
      ? ""
      : "Use ${timestamp} or ${timestamp:s}.";
  }
  if (normalizedKind === "date") {
    return offset && !Number.isFinite(parseOffsetMs(offset)) ? "Use offset like offset=-3d or offset=+1h." : "";
  }
  if (normalizedKind === "now") {
    return offset && !Number.isFinite(parseOffsetMs(offset)) ? "Use offset like offset=-3d or offset=+1h." : "";
  }
  if (normalizedKind === "uuid") {
    return expression ? "Use ${uuid} without options." : "";
  }
  return `Unknown dynamic field: ${normalizedKind || token}.`;
}

function formatPadded(value: number, pad: number) {
  if (!pad) return String(value);
  const sign = value < 0 ? "-" : "";
  return `${sign}${String(Math.abs(value)).padStart(pad, "0")}`;
}

function rangedValue(expression: string, iteration: number) {
  const range = parseRange(expression);
  if (!range) return String(iteration);
  const direction = range.end >= range.start ? 1 : -1;
  const size = Math.floor(Math.abs(range.end - range.start) / range.step) + 1;
  const offset = (Math.max(1, iteration) - 1) % size;
  return formatPadded(range.start + offset * range.step * direction, range.pad);
}

function randomInt(expression: string) {
  const range = parseRange(expression);
  if (!range) return "";
  const low = Math.ceil(Math.min(range.start, range.end));
  const high = Math.floor(Math.max(range.start, range.end));
  return formatPadded(Math.floor(Math.random() * (high - low + 1)) + low, range.pad);
}

function randomFloat(expression: string) {
  const range = parseFloatRange(expression);
  if (!range) return "";
  const min = Math.min(range.start, range.end);
  const max = Math.max(range.start, range.end);
  const value = Math.random() * (max - min) + min;
  const fixed = range.options.fixed ? Number(range.options.fixed) : NaN;
  return Number.isFinite(fixed) ? value.toFixed(Math.max(0, Math.min(12, fixed))) : String(value);
}

function padDatePart(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function formatDate(date: Date, format: string) {
  const replacements: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: padDatePart(date.getMonth() + 1),
    dd: padDatePart(date.getDate()),
    HH: padDatePart(date.getHours()),
    mm: padDatePart(date.getMinutes()),
    ss: padDatePart(date.getSeconds()),
    SSS: padDatePart(date.getMilliseconds(), 3)
  };
  return format.replace(/yyyy|SSS|MM|dd|HH|mm|ss/g, (token) => replacements[token] ?? token);
}

function renderToken(token: string, iteration: number) {
  const { expression, kind: normalizedKind, options: tokenOptions } = parseToken(token);

  if (normalizedKind === "seq") return rangedValue(expression, iteration);
  if (normalizedKind === "number" || normalizedKind === "random") {
    return randomInt(expression);
  }
  if (normalizedKind === "float") return randomFloat(expression);
  if (normalizedKind === "choice") {
    const choices = expression.split("|").filter(Boolean);
    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : "";
  }
  if (normalizedKind === "now") {
    const { options, value: format } = splitExpressionOptions(expression);
    const now = dateWithOffset({ ...tokenOptions, ...options });
    return format ? formatDate(now, format) : now.toISOString();
  }
  if (normalizedKind === "timestamp") {
    const { options, value } = splitExpressionOptions(expression);
    const now = dateWithOffset({ ...tokenOptions, ...options });
    if (!value) return String(now.getTime());
    if (value === "s" || value === "seconds") return String(Math.floor(now.getTime() / 1000));
    return String(now.getTime());
  }
  if (normalizedKind === "date") {
    const { options, value: format } = splitExpressionOptions(expression);
    return formatDate(dateWithOffset({ ...tokenOptions, ...options }), format || "yyyy-MM-dd HH:mm:ss");
  }
  if (normalizedKind === "uuid") return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `\${${token}}`;
}

export function renderProduceTemplateText(input: string, iteration: number) {
  return input.replace(tokenPattern, (match, token: string) => {
    if (match.startsWith("\\")) return match.slice(1);
    return renderToken(token, iteration);
  });
}

export function renderProduceTemplateDraft(draft: ProduceTemplateDraft, iteration: number): ProduceTemplateDraft {
  return {
    key: renderProduceTemplateText(draft.key, iteration),
    headers: renderProduceTemplateText(draft.headers, iteration),
    value: renderProduceTemplateText(draft.value, iteration)
  };
}

export function validateProduceTemplateDraft(draft: ProduceTemplateDraft): ProduceTemplateIssue[] {
  return (Object.keys(draft) as Array<keyof ProduceTemplateDraft>).flatMap((field) => {
    const issues: ProduceTemplateIssue[] = [];
    for (const match of draft[field].matchAll(tokenPattern)) {
      const [rawToken, token] = match;
      if (rawToken.startsWith("\\")) continue;
      const message = getTokenIssue(token);
      if (message) issues.push({ field, message, token: `\${${token}}` });
    }
    return issues;
  });
}

export function getProduceTemplateHints() {
  return ["${seq}", "${seq:1..100|step=5|pad=4}", "${random:1..100}", "${random:1..5|pad=6}", "${float:37.50..37.70|fixed=6}", "${choice:A|B|C}", "${date:yyyy-MM-dd HH:mm:ss|offset=-3d}", "${timestamp|offset=+1h}", "${uuid}"];
}

export function getProduceTemplateExamples() {
  return [
    { syntax: "${seq:1..100|step=5|pad=4}", description: "Sequential or wrapped values with optional step and padding." },
    { syntax: "PVMS${random:1..5|pad=6}", description: "Random integers, optionally padded for IDs." },
    { syntax: "${float:37.50..37.70|fixed=6}", description: "Random decimals for coordinates or measurements." },
    { syntax: "${choice:READY|RUNNING|ERROR}", description: "Randomly picks one value from a list." },
    { syntax: "${date:yyyy-MM-dd HH:mm:ss|offset=-3d}", description: "Formatted local date/time with optional offset." },
    { syntax: "${timestamp|offset=+1h}", description: "Epoch milliseconds or ${timestamp:s} for seconds." },
    { syntax: "${now|offset=-10m}", description: "ISO date/time with optional offset." },
    { syntax: "${uuid}", description: "Random UUID." },
    { syntax: "\\${uuid}", description: "Escapes a token and sends it as literal text." }
  ];
}

export function parseProduceDurationMs(input: string) {
  const compact = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!compact) return 0;
  const durationUnitPattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let total = 0;
  let matched = "";
  for (const match of compact.matchAll(durationUnitPattern)) {
    const amount = Number(match[1]);
    const unit = match[2];
    matched += match[0];
    if (unit === "ms") total += amount;
    if (unit === "s") total += amount * 1000;
    if (unit === "m") total += amount * 60 * 1000;
    if (unit === "h") total += amount * 60 * 60 * 1000;
  }
  return matched === compact ? Math.floor(total) : 0;
}

export function formatProduceElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
