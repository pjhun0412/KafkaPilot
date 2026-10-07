import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Columns3, Copy, Filter, Folder, MapPin, Search, Send, Settings2, X } from "lucide-react";
import type { ConsumedMessage } from "../../../../shared/types";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import { createLiveMapPoint, getMapCoordinateFromSelection, normalizeMapFieldMapping } from "../../../mapPreview";
import type { MapFieldMapping } from "../../../mapPreview";
import { formatMessagePayload } from "../../../messagePreview";
import { collectValuePaths, getMessageValuePayload } from "../../../consumeValuePaths";
import { getProduceTemplateExamples, renderProduceTemplateDraft, validateProduceTemplateDraft } from "../../../produceTemplate";
import { startReplayJob } from "../../../replayJobs";
import type { ReplayDraft, ReplayPayloadOptions, ReplayTargetServer } from "../../../replayTypes";
import type { MessageInspectorMode, MessagePayloadFormat, MessagePayloadTarget, MessagePreviewEncoding, MessagePreviewMode } from "../../../uiTypes";
import { formatProduceValue, getEpochTitle, parseProduceHeaders, renderHighlightedText, renderRawJsonText, stringifyPrimitive, validateJsonLikeValue } from "../../../utils";

type MapFieldPickerId = "x" | "y" | "identity" | "heading" | "speed";
type ReplaySourceKind = "single" | "selected" | "filtered" | "all";
type ReplayOrder = "grid" | "original" | "timestamp";
type ReplayFieldOverride = {
  id: string;
  path: string;
  value: string;
};
type ReplayOverrideTreeNode = {
  children: Map<string, ReplayOverrideTreeNode>;
  fullPath: string;
  leafPath?: string;
  name: string;
};

function getPathSegments(path: string) {
  return path.split(".").filter(Boolean);
}

function formatMapFieldPath(path: string) {
  if (!path) return "";
  const segments = getPathSegments(path);
  const leaf = segments.at(-1) ?? path;
  const parent = segments.at(-2) ?? "";
  return parent ? `${leaf} (...${parent})` : leaf;
}

function getAutoMapFieldPath(paths: string[], kind: MapFieldPickerId) {
  const patterns: Record<MapFieldPickerId, RegExp[]> = {
    x: [/longitude$/i, /lng$/i, /lon$/i, /xM$/],
    y: [/latitude$/i, /lat$/i, /yM$/],
    identity: [/vehicleID$/i, /vehicleId$/i, /terminalID$/i, /terminalId$/i],
    heading: [/heading$/i, /bearing$/i, /direction$/i],
    speed: [/egoVehicleSpeedMps$/i, /speedMps$/i, /speed$/i]
  };
  return paths.find((path) => patterns[kind].some((pattern) => pattern.test(path))) ?? "";
}

function getValueColumnPathFromTreePath(path: string) {
  const valuePrefix = "message.value.";
  if (!path.startsWith(valuePrefix)) return null;
  const valuePath = path.slice(valuePrefix.length);
  return valuePath ? valuePath : null;
}

function createReplayOverrideTree(paths: string[]) {
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

function getReplayOverrideLeafPaths(node: ReplayOverrideTreeNode): string[] {
  if (node.leafPath && node.children.size === 0) return [node.leafPath];
  return Array.from(node.children.values()).flatMap(getReplayOverrideLeafPaths);
}

function getDefaultReplayOverrideValue(path: string) {
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

function parseReplayOverrideValue(value: string) {
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

function setValueAtPath(target: unknown, path: string, value: unknown) {
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

function compareMessageOffset(left: ConsumedMessage, right: ConsumedMessage) {
  const partitionDiff = left.partition - right.partition;
  if (partitionDiff !== 0) return partitionDiff;
  const leftOffset = Number(left.offset);
  const rightOffset = Number(right.offset);
  if (Number.isFinite(leftOffset) && Number.isFinite(rightOffset)) return leftOffset - rightOffset;
  return left.offset.localeCompare(right.offset, undefined, { numeric: true });
}

function getReplayOrderedMessages(messages: ConsumedMessage[], order: ReplayOrder) {
  if (order === "grid") return [...messages];
  if (order === "timestamp") {
    return [...messages].sort((left, right) => {
      const timeDiff = Date.parse(left.timestamp) - Date.parse(right.timestamp);
      return timeDiff || compareMessageOffset(left, right);
    });
  }
  return [...messages].sort(compareMessageOffset);
}

export function MessageInspector(props: {
  serverId: string;
  serverName: string;
  replayTargets: ReplayTargetServer[];
  mode: MessageInspectorMode;
  previewTarget: MessagePayloadTarget;
  previewMode: MessagePreviewMode;
  valueFormat: MessagePayloadFormat;
  previewEncoding: MessagePreviewEncoding;
  search: string;
  payload: unknown;
  rawText: string;
  valueText: string;
  selectedMessage: ConsumedMessage | null;
  selectedReplayMessages: ConsumedMessage[];
  filteredReplayMessages: ConsumedMessage[];
  allReplayMessages: ConsumedMessage[];
  mapFieldMapping: MapFieldMapping | null;
  valueColumnPaths: string[];
  onMode: (mode: MessageInspectorMode) => void;
  onPreviewTarget: (target: MessagePayloadTarget) => void;
  onPreviewMode: (mode: MessagePreviewMode) => void;
  onPreviewEncoding: (encoding: MessagePreviewEncoding) => void;
  onSearch: (value: string) => void;
  onApplyFilter: (value: string) => void;
  onSendToProduce: (message: ConsumedMessage, targetTopic?: string, targetServerId?: string, payload?: ReplayPayloadOptions) => void;
  onReplayMessage: (serverId: string, topic: string, draft: ReplayDraft) => Promise<void>;
  onConnectReplayServer: (serverId: string) => Promise<boolean>;
  onMapFieldMapping: (mapping: MapFieldMapping | null) => void;
  onValueColumnPath: (path: string) => void;
  onCollapse: () => void;
}) {
  const language = useAppLanguage();
  const [isMapSettingsOpen, setIsMapSettingsOpen] = useState(false);
  const [isReplayOpen, setIsReplayOpen] = useState(false);
  const [isProduceMenuOpen, setIsProduceMenuOpen] = useState(false);
  const [isReplayServerPickerOpen, setIsReplayServerPickerOpen] = useState(false);
  const [isReplayTopicPickerOpen, setIsReplayTopicPickerOpen] = useState(false);
  const [connectingReplayServerId, setConnectingReplayServerId] = useState("");
  const [replayServerId, setReplayServerId] = useState("");
  const [replayTopic, setReplayTopic] = useState("");
  const [replayTopicQuery, setReplayTopicQuery] = useState("");
  const [replayPayload, setReplayPayload] = useState<ReplayPayloadOptions>({
    key: true,
    headers: true,
    value: true
  });
  const [replaySourceKind, setReplaySourceKind] = useState<ReplaySourceKind>("single");
  const [replayMessages, setReplayMessages] = useState<ConsumedMessage[]>([]);
  const [replayDraft, setReplayDraft] = useState<ReplayDraft>({
    key: "",
    headers: "{}",
    value: ""
  });
  const [replayNotice, setReplayNotice] = useState("");
  const [replayApplyDynamicFields, setReplayApplyDynamicFields] = useState(false);
  const [replayFieldOverrides, setReplayFieldOverrides] = useState<ReplayFieldOverride[]>([]);
  const [replayOverrideSearch, setReplayOverrideSearch] = useState("");
  const [expandedReplayOverrideGroups, setExpandedReplayOverrideGroups] = useState<Set<string>>(() => new Set());
  const [replayOrder, setReplayOrder] = useState<ReplayOrder>("original");
  const [replayStopOnFirstError, setReplayStopOnFirstError] = useState(false);
  const [replayDelayEnabled, setReplayDelayEnabled] = useState(false);
  const [replayDelayMs, setReplayDelayMs] = useState("10");
  const [activeMapFieldPicker, setActiveMapFieldPicker] = useState<MapFieldPickerId | null>(null);
  const [mapFieldPickerQuery, setMapFieldPickerQuery] = useState("");
  const [mapSettingsNotice, setMapSettingsNotice] = useState("");
  const [mapSettingsDraft, setMapSettingsDraft] = useState<MapFieldMapping>({
    xPath: "",
    yPath: "",
    projection: "wgs84"
  });
  const produceMenuRef = useRef<HTMLDivElement | null>(null);
  const replayServerPickerRef = useRef<HTMLDivElement | null>(null);
  const replayTopicPickerRef = useRef<HTMLDivElement | null>(null);
  const inspectorSelectableRef = useRef<HTMLElement | null>(null);
  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }
  const previewText = formatMessagePayload(
    props.selectedMessage,
    props.previewTarget,
    props.previewMode,
    props.previewEncoding,
    props.previewMode === "json"
  );
  const valueCopyText = formatMessagePayload(
    props.selectedMessage,
    "value",
    props.valueFormat,
    props.previewEncoding,
    props.valueFormat === "json"
  );
  const mapPoint = useMemo(
    () => (props.selectedMessage ? createLiveMapPoint(props.selectedMessage, props.payload, undefined, props.mapFieldMapping) ?? createLiveMapPoint(props.selectedMessage) : null),
    [props.mapFieldMapping, props.payload, props.selectedMessage]
  );
  const mapFieldPaths = useMemo(() => Array.from(collectValuePaths(props.payload)).sort((left, right) => left.localeCompare(right)), [props.payload]);
  const autoMapFieldPaths = useMemo(() => ({
    x: getAutoMapFieldPath(mapFieldPaths, "x"),
    y: getAutoMapFieldPath(mapFieldPaths, "y"),
    identity: getAutoMapFieldPath(mapFieldPaths, "identity"),
    heading: getAutoMapFieldPath(mapFieldPaths, "heading"),
    speed: getAutoMapFieldPath(mapFieldPaths, "speed")
  }), [mapFieldPaths]);
  const canShowTree = Boolean(props.payload);
  const showEncoding = props.mode === "preview" && props.previewMode === "text" && (props.previewTarget === "key" || props.previewTarget === "value");

  function createReplayDraft(message: ConsumedMessage, payload: ReplayPayloadOptions): ReplayDraft {
    return {
      key: payload.key ? message.key : "",
      headers: payload.headers ? JSON.stringify(message.headers ?? {}, null, 2) : "{}",
      value: payload.value
        ? message.decoded?.value === undefined ? formatProduceValue(message.value) : JSON.stringify(message.decoded.value, null, 2)
        : ""
    };
  }
  const isSingleReplay = replayMessages.length <= 1;
  const replaySourceTopic = replayMessages[0]?.topic ?? props.selectedMessage?.topic ?? "";
  const replayOffsetRange = useMemo(() => {
    const offsets = replayMessages.map((message) => Number(message.offset)).filter(Number.isFinite);
    if (offsets.length === 0) return "-";
    const min = Math.min(...offsets);
    const max = Math.max(...offsets);
    return min === max ? String(min) : `${min} ~ ${max}`;
  }, [replayMessages]);
  const selectedReplayServer = useMemo(() => {
    return props.replayTargets.find((target) => target.id === replayServerId)
      ?? props.replayTargets.find((target) => target.id === props.serverId)
      ?? props.replayTargets.find((target) => target.connected)
      ?? props.replayTargets[0];
  }, [props.replayTargets, props.serverId, replayServerId]);
  const replayTopicOptions = useMemo(() => {
    const query = replayTopicQuery.trim().toLowerCase();
    return (selectedReplayServer?.topics ?? [])
      .map((topic) => topic.name)
      .filter((name) => !query || name.toLowerCase().includes(query))
      .sort((left, right) => left.localeCompare(right));
  }, [replayTopicQuery, selectedReplayServer?.topics]);
  const replayTemplateExamples = useMemo(() => getProduceTemplateExamples(), []);
  const replayOverrideSource = useMemo(() => {
    const sourceMessage = replayMessages[0] ?? props.selectedMessage;
    return sourceMessage ? getMessageValuePayload(sourceMessage) : null;
  }, [props.selectedMessage, replayMessages]);
  const replayOverridePaths = useMemo(() => Array.from(collectValuePaths(replayOverrideSource)).sort((left, right) => left.localeCompare(right)), [replayOverrideSource]);
  const replayOverrideTreePaths = useMemo(() => {
    const query = replayOverrideSearch.trim().toLowerCase();
    if (!query) return replayOverridePaths;
    return replayOverridePaths.filter((path) => path.toLowerCase().includes(query));
  }, [replayOverridePaths, replayOverrideSearch]);
  const replayOverrideTree = useMemo(() => createReplayOverrideTree(replayOverrideTreePaths), [replayOverrideTreePaths]);
  const replaySourceOptions = useMemo(() => [
    {
      kind: "single" as const,
      label: t(language, "replay.sourceSingle"),
      count: props.selectedMessage ? 1 : 0,
      messages: props.selectedMessage ? [props.selectedMessage] : []
    },
    {
      kind: "selected" as const,
      label: t(language, "replay.sourceSelected"),
      count: props.selectedReplayMessages.length,
      messages: props.selectedReplayMessages
    },
    {
      kind: "filtered" as const,
      label: t(language, "replay.sourceFiltered"),
      count: props.filteredReplayMessages.length,
      messages: props.filteredReplayMessages
    },
    {
      kind: "all" as const,
      label: t(language, "replay.sourceAll"),
      count: props.allReplayMessages.length,
      messages: props.allReplayMessages
    }
  ], [language, props.allReplayMessages, props.filteredReplayMessages, props.selectedMessage, props.selectedReplayMessages]);

  useEffect(() => {
    function selectInspectorContents(element: HTMLElement) {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      element.focus({ preventScroll: true });
    }

    function selectAllInspectorText(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "a" || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (eventTarget?.closest("input, textarea, select, [contenteditable='true']")) return;
      const selection = window.getSelection();
      const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
      const focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement;
      const selectedElement = anchorElement?.closest<HTMLElement>(".message-view, .message-tree")
        ?? focusElement?.closest<HTMLElement>(".message-view, .message-tree")
        ?? eventTarget?.closest<HTMLElement>(".message-view, .message-tree")
        ?? inspectorSelectableRef.current;
      if (!selectedElement || !document.body.contains(selectedElement)) return;
      event.preventDefault();
      event.stopPropagation();
      selectInspectorContents(selectedElement);
    }

    function copySelectedInspectorText(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
      const selection = window.getSelection();
      const selectedText = selection?.toString() ?? "";
      if (!selection || selection.isCollapsed || !selectedText) return;
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
      const focusElement = focusNode instanceof Element ? focusNode : focusNode?.parentElement;
      const isInspectorSelection = Boolean(
        anchorElement?.closest(".message-inspector")
        || focusElement?.closest(".message-inspector")
      );
      if (!isInspectorSelection) return;
      event.preventDefault();
      void navigator.clipboard.writeText(selectedText);
    }

    window.addEventListener("keydown", selectAllInspectorText, true);
    window.addEventListener("keydown", copySelectedInspectorText, true);
    return () => {
      window.removeEventListener("keydown", selectAllInspectorText, true);
      window.removeEventListener("keydown", copySelectedInspectorText, true);
    };
  }, []);

  function rememberInspectorSelectable(element: HTMLElement) {
    inspectorSelectableRef.current = element;
  }

  useEffect(() => {
    function closeProduceMenu(event: PointerEvent) {
      if (!produceMenuRef.current || produceMenuRef.current.contains(event.target as Node)) return;
      setIsProduceMenuOpen(false);
    }

    window.addEventListener("pointerdown", closeProduceMenu);
    return () => window.removeEventListener("pointerdown", closeProduceMenu);
  }, []);

  useEffect(() => {
    function closeReplayServerPicker(event: PointerEvent) {
      if (!replayServerPickerRef.current || replayServerPickerRef.current.contains(event.target as Node)) return;
      setIsReplayServerPickerOpen(false);
    }

    window.addEventListener("pointerdown", closeReplayServerPicker);
    return () => window.removeEventListener("pointerdown", closeReplayServerPicker);
  }, []);

  useEffect(() => {
    function closeReplayTopicPicker(event: PointerEvent) {
      if (!replayTopicPickerRef.current || replayTopicPickerRef.current.contains(event.target as Node)) return;
      setIsReplayTopicPickerOpen(false);
    }

    window.addEventListener("pointerdown", closeReplayTopicPicker);
    return () => window.removeEventListener("pointerdown", closeReplayTopicPicker);
  }, []);

  useEffect(() => {
    if (!isReplayOpen || !selectedReplayServer) return;
    const topicNames = selectedReplayServer.topics.map((topic) => topic.name);
    if (topicNames.length === 0 || topicNames.includes(replayTopic)) return;
    setReplayTopic(props.selectedMessage && topicNames.includes(props.selectedMessage.topic)
      ? props.selectedMessage.topic
      : topicNames[0] ?? "");
  }, [isReplayOpen, props.selectedMessage, replayTopic, selectedReplayServer]);

  async function openLiveMap() {
    if (!props.selectedMessage) return;
    if (!mapPoint) {
      openMapSettings(t(language, "label.mapFieldMappingRequired"));
      return;
    }
    const focusedPoint = mapPoint ? { ...mapPoint, focus: true } : null;
    if (focusedPoint) {
      await window.kafkaApi.sendLiveMapPoints([focusedPoint]);
    }
    await window.kafkaApi.openLiveMap();
  }

  function openMapSettings(notice = "") {
    setMapSettingsDraft(props.mapFieldMapping ?? {
      xPath: "",
      yPath: "",
      projection: "wgs84"
    });
    setActiveMapFieldPicker(null);
    setMapFieldPickerQuery("");
    setMapSettingsNotice(notice);
    setIsMapSettingsOpen(true);
  }

  function applyReplaySource(kind: ReplaySourceKind, messages: ConsumedMessage[]) {
    if (messages.length === 0) return;
    const sourceMessage = messages[0] as ConsumedMessage;
    setReplaySourceKind(kind);
    setReplayMessages(messages);
    setReplayDraft(createReplayDraft(sourceMessage, replayPayload));
    setReplayNotice("");
  }

  function changeReplaySource(kind: ReplaySourceKind) {
    const option = replaySourceOptions.find((item) => item.kind === kind);
    if (!option || option.messages.length === 0) return;
    applyReplaySource(kind, option.messages);
  }

  function openReplayDialog() {
    const defaultOption = replaySourceOptions.find((option) => option.kind === "selected" && option.count > 0)
      ?? replaySourceOptions.find((option) => option.kind === "single" && option.count > 0)
      ?? replaySourceOptions.find((option) => option.kind === "filtered" && option.count > 0)
      ?? replaySourceOptions.find((option) => option.kind === "all" && option.count > 0);
    if (!defaultOption) return;
    const sourceMessage = defaultOption.messages[0] as ConsumedMessage;
    const payload = { key: true, headers: true, value: true };
    const targetServer = props.replayTargets.find((target) => target.id === props.serverId)
      ?? props.replayTargets.find((target) => target.connected)
      ?? props.replayTargets[0];
    const targetTopics = targetServer?.topics.map((topic) => topic.name) ?? [];
    setReplayServerId(targetServer?.id ?? props.serverId);
    setReplayTopic(targetTopics.includes(sourceMessage.topic) ? sourceMessage.topic : targetTopics[0] ?? "");
    setReplayTopicQuery("");
    setReplayPayload(payload);
    setReplaySourceKind(defaultOption.kind);
    setReplayMessages(defaultOption.messages);
    setReplayDraft(createReplayDraft(sourceMessage, payload));
    setReplayNotice("");
    setReplayApplyDynamicFields(false);
    setReplayFieldOverrides([]);
    setReplayOverrideSearch("");
    setExpandedReplayOverrideGroups(new Set());
    setReplayOrder("original");
    setReplayStopOnFirstError(false);
    setReplayDelayEnabled(false);
    setReplayDelayMs("10");
    setIsReplayServerPickerOpen(false);
    setIsReplayTopicPickerOpen(false);
    setIsProduceMenuOpen(false);
    setIsReplayOpen(true);
  }

  async function submitReplay() {
    if (replayMessages.length === 0 || !replayTopic.trim() || !selectedReplayServer) return;
    const delayMs = replayDelayEnabled ? Math.max(0, Math.floor(Number(replayDelayMs) || 0)) : 0;
    const orderedMessages = getReplayOrderedMessages(replayMessages, replayOrder);
    const drafts: ReplayDraft[] = [];
    const activeOverrides = replayFieldOverrides
      .map((override) => ({ ...override, path: override.path.trim() }))
      .filter((override) => override.path);
    for (let index = 0; index < orderedMessages.length; index += 1) {
      const message = orderedMessages[index];
      if (!message) continue;
      if (isSingleReplay) {
        const draft = {
          key: replayPayload.key ? replayDraft.key : "",
          headers: replayPayload.headers ? replayDraft.headers : "{}",
          value: replayPayload.value ? replayDraft.value : ""
        };
        const templateIssue = validateProduceTemplateDraft(draft)[0];
        if (templateIssue) {
          setReplayNotice(`${templateIssue.token}: ${templateIssue.message}`);
          return;
        }
        drafts.push(renderProduceTemplateDraft(draft, 1));
      } else {
        let draft = createReplayDraft(message, replayPayload);
        if (replayApplyDynamicFields) {
          for (const override of activeOverrides) {
            const templateIssue = validateProduceTemplateDraft({ key: "", headers: "{}", value: override.value })[0];
            if (templateIssue) {
              setReplayNotice(`${templateIssue.token}: ${templateIssue.message}`);
              return;
            }
          }
          if (replayPayload.value && activeOverrides.length > 0) {
            try {
              const valueObject = JSON.parse(draft.value) as unknown;
              for (const override of activeOverrides) {
                const renderedOverride = renderProduceTemplateDraft({ key: "", headers: "{}", value: override.value }, index + 1).value;
                const applied = setValueAtPath(valueObject, override.path.replace(/^value\./, ""), parseReplayOverrideValue(renderedOverride));
                if (!applied) {
                  setReplayNotice(t(language, "replay.invalidOverridePath", { path: override.path }));
                  return;
                }
              }
              draft = { ...draft, value: JSON.stringify(valueObject, null, 2) };
            } catch {
              setReplayNotice(t(language, "replay.overrideRequiresJson"));
              return;
            }
          }
          draft = renderProduceTemplateDraft(draft, index + 1);
        }
        drafts.push(draft);
      }
    }
    for (const draft of drafts) {
      const valueError = validateJsonLikeValue(draft.value);
      if (valueError) {
        setReplayNotice(valueError);
        return;
      }
      const headers = parseProduceHeaders(draft.headers);
      if (typeof headers === "string") {
        setReplayNotice(headers);
        return;
      }
    }
    setReplayNotice("");
    startReplayJob({
      sourceServerId: props.serverId,
      sourceServerName: props.serverName,
      sourceTopic: orderedMessages[0]?.topic ?? replayMessages[0]?.topic ?? "",
      targetServerId: selectedReplayServer.id,
      targetServerName: selectedReplayServer.name,
      targetTopic: replayTopic.trim(),
      drafts,
      messageLabels: orderedMessages.map((message) => `${message.topic}[${message.partition}]@${message.offset}`),
      delayMs,
      stopOnFirstError: replayStopOnFirstError,
      send: props.onReplayMessage
    });
    setIsReplayOpen(false);
  }

  function toggleReplayPayload(key: keyof ReplayPayloadOptions) {
    setReplayPayload((current) => {
      const next = { ...current, [key]: !current[key] };
      if (props.selectedMessage) {
        setReplayDraft((draft) => {
          const original = createReplayDraft(props.selectedMessage as ConsumedMessage, next);
          return { ...draft, [key]: next[key] ? original[key] : key === "headers" ? "{}" : "" };
        });
      }
      return next;
    });
  }

  function addReplayFieldOverride() {
    setReplayApplyDynamicFields(true);
    setReplayFieldOverrides((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, path: "", value: "${timestamp}" }
    ]);
  }

  function toggleReplayOverridePath(path: string) {
    setReplayFieldOverrides((current) => {
      if (current.some((override) => override.path === path)) return current.filter((override) => override.path !== path);
      return [
        ...current,
        { id: `${Date.now()}-${current.length}`, path, value: getDefaultReplayOverrideValue(path) }
      ];
    });
  }

  function toggleReplayOverrideGroup(path: string) {
    setExpandedReplayOverrideGroups((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function toggleReplayOverrideGroupSelection(node: ReplayOverrideTreeNode) {
    const leafPaths = getReplayOverrideLeafPaths(node);
    setReplayFieldOverrides((current) => {
      const currentByPath = new Map(current.map((override) => [override.path, override]));
      const allSelected = leafPaths.every((path) => currentByPath.has(path));
      if (allSelected) {
        for (const path of leafPaths) currentByPath.delete(path);
      } else {
        for (const path of leafPaths) {
          if (!currentByPath.has(path)) {
            currentByPath.set(path, { id: `${Date.now()}-${path}`, path, value: getDefaultReplayOverrideValue(path) });
          }
        }
      }
      return Array.from(currentByPath.values());
    });
  }

  function updateReplayFieldOverride(id: string, patch: Partial<ReplayFieldOverride>) {
    setReplayFieldOverrides((current) => current.map((override) => override.id === id ? { ...override, ...patch } : override));
  }

  function removeReplayFieldOverride(id: string) {
    setReplayFieldOverrides((current) => current.filter((override) => override.id !== id));
  }

  function renderReplayOverrideNode(node: ReplayOverrideTreeNode, depth: number) {
    const children = Array.from(node.children.values()).sort((left, right) => left.name.localeCompare(right.name));
    const hasChildren = children.length > 0;
    const isExpanded = replayOverrideSearch.trim().length > 0 || expandedReplayOverrideGroups.has(node.fullPath);
    const selectedPaths = new Set(replayFieldOverrides.map((override) => override.path));

    if (!hasChildren) {
      const path = node.leafPath ?? node.fullPath;
      return (
        <label key={path} className="replay-override-tree-row leaf" style={{ paddingLeft: 8 + depth * 24 }}>
          <span className="replay-override-tree-indent" />
          <input
            type="checkbox"
            checked={selectedPaths.has(path)}
            onChange={() => toggleReplayOverridePath(path)}
          />
          <span className="replay-override-leaf-spacer" />
          <span className="replay-override-leaf-name" title={path}>{node.name}</span>
        </label>
      );
    }

    const leafPaths = getReplayOverrideLeafPaths(node);
    const selectedLeafCount = leafPaths.filter((path) => selectedPaths.has(path)).length;
    const isGroupChecked = leafPaths.length > 0 && selectedLeafCount === leafPaths.length;
    const isGroupMixed = selectedLeafCount > 0 && selectedLeafCount < leafPaths.length;
    return (
      <div key={node.fullPath} className="replay-override-tree-group">
        <div className="replay-override-tree-row group" style={{ paddingLeft: 8 + depth * 24 }}>
          <button
            type="button"
            className="replay-override-tree-expander"
            onClick={() => toggleReplayOverrideGroup(node.fullPath)}
            aria-label={isExpanded ? "Collapse group" : "Expand group"}
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <input
            type="checkbox"
            checked={isGroupChecked}
            ref={(input) => {
              if (input) input.indeterminate = isGroupMixed;
            }}
            onChange={() => toggleReplayOverrideGroupSelection(node)}
          />
          <Folder size={13} />
          <span className="replay-override-group-name" title={node.fullPath}>{node.name}</span>
          <span className="replay-override-group-count">{selectedLeafCount}/{leafPaths.length}</span>
        </div>
        {isExpanded && children.map((child) => renderReplayOverrideNode(child, depth + 1))}
      </div>
    );
  }

  async function changeReplayServer(serverId: string) {
    const target = props.replayTargets.find((item) => item.id === serverId);
    const topicNames = target?.topics.map((topic) => topic.name) ?? [];
    setReplayServerId(serverId);
    setIsReplayServerPickerOpen(false);
    setIsReplayTopicPickerOpen(false);
    setReplayTopic((current) => {
      if (current && topicNames.includes(current)) return current;
      if (props.selectedMessage && topicNames.includes(props.selectedMessage.topic)) return props.selectedMessage.topic;
      return topicNames[0] ?? "";
    });
    setReplayTopicQuery("");
    if (target && !target.connected) {
      setConnectingReplayServerId(serverId);
      try {
        await props.onConnectReplayServer(serverId);
      } finally {
        setConnectingReplayServerId("");
      }
    }
  }

  function updateMapSettingsDraft(patch: Partial<MapFieldMapping>) {
    setMapSettingsDraft((current) => ({ ...current, ...patch }));
  }

  function applyMapSettings() {
    const normalized = normalizeMapFieldMapping(mapSettingsDraft);
    if (!normalized || !getMapCoordinateFromSelection(props.payload, normalized)) {
      setMapSettingsNotice(t(language, "label.mapFieldMappingInvalid"));
      return;
    }
    props.onMapFieldMapping(normalized);
    setMapSettingsNotice("");
    setIsMapSettingsOpen(false);
  }

  function clearMapSettings() {
    props.onMapFieldMapping(null);
    setMapSettingsDraft({ xPath: "", yPath: "", projection: "wgs84" });
  }

  function closeFieldPicker() {
    setActiveMapFieldPicker(null);
    setMapFieldPickerQuery("");
  }

  function openFieldPicker(id: MapFieldPickerId) {
    setActiveMapFieldPicker((current) => current === id ? null : id);
    setMapFieldPickerQuery("");
  }

  function getMapFieldPickerPaths(value: string) {
    const query = mapFieldPickerQuery.trim().toLowerCase();
    const filtered = query
      ? mapFieldPaths.filter((path) => path.toLowerCase().includes(query) || formatMapFieldPath(path).toLowerCase().includes(query))
      : mapFieldPaths;
    return Array.from(new Set([value, ...filtered].filter(Boolean))).sort((left, right) => formatMapFieldPath(left).localeCompare(formatMapFieldPath(right)));
  }

  function selectMapField(value: string, onChange: (value: string) => void) {
    onChange(value);
    closeFieldPicker();
  }

  function renderMapFieldPicker(params: {
    id: MapFieldPickerId;
    value: string;
    autoPath?: string;
    required?: boolean;
    placement?: "top" | "bottom";
    onChange: (value: string) => void;
  }) {
    const isOpen = activeMapFieldPicker === params.id;
    const display = params.value
      ? formatMapFieldPath(params.value)
      : params.required
        ? t(language, "label.selectField")
        : params.autoPath
          ? `${t(language, "label.autoDetect")} (${formatMapFieldPath(params.autoPath)})`
          : t(language, "label.autoDetectFailed");
    const paths = getMapFieldPickerPaths(params.value);
    return (
      <div className="map-field-picker">
        <button
          type="button"
          className={params.value ? "map-field-picker-trigger selected" : "map-field-picker-trigger"}
          onClick={() => openFieldPicker(params.id)}
          title={params.value || params.autoPath || display}
        >
          <span>{display}</span>
          <ChevronDown size={14} />
        </button>
        {isOpen && (
          <div className={params.placement === "top" ? "map-field-picker-popover open-up" : "map-field-picker-popover"}>
            <label className="map-field-picker-search">
              <Search size={13} />
              <input
                value={mapFieldPickerQuery}
                onChange={(event) => setMapFieldPickerQuery(event.target.value)}
                placeholder={t(language, "placeholder.searchMapFields")}
                autoFocus
              />
            </label>
            {!params.required && (
              <button
                type="button"
                className="map-field-picker-option muted"
                title={params.autoPath || ""}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectMapField("", params.onChange);
                }}
              >
                <span>{params.autoPath ? `${t(language, "label.autoDetect")} (${formatMapFieldPath(params.autoPath)})` : t(language, "label.autoDetectFailed")}</span>
              </button>
            )}
            <div className="map-field-picker-list">
              {paths.map((path) => (
                <button
                  type="button"
                  className={path === params.value ? "map-field-picker-option selected" : "map-field-picker-option"}
                  key={path}
                  title={path}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectMapField(path, params.onChange);
                  }}
                >
                  <strong>{formatMapFieldPath(path)}</strong>
                  <span>{path}</span>
                </button>
              ))}
              {paths.length === 0 && <div className="map-field-picker-empty">{t(language, "label.noSettingsMatched")}</div>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="message-inspector">
      <div className="message-inspector-toolbar">
        <div className="segmented compact-segmented">
          <button className={props.mode === "raw" ? "active" : ""} onClick={() => props.onMode("raw")}>{t(language, "label.raw")}</button>
          <button className={props.mode === "tree" ? "active" : ""} onClick={() => props.onMode("tree")}>{t(language, "label.tree")}</button>
          <button className={props.mode === "preview" ? "active" : ""} onClick={() => props.onMode("preview")}>{t(language, "label.preview")}</button>
        </div>
        <div className="message-inspector-options">
          {props.mode === "preview" && (
            <>
              <select
                className="preview-mode-select preview-target-select"
                value={props.previewTarget}
                onChange={(event) => props.onPreviewTarget(event.target.value as MessagePayloadTarget)}
                aria-label={t(language, "label.previewTarget")}
              >
                <option value="value">{t(language, "label.value")}</option>
                <option value="key">{t(language, "label.key")}</option>
                <option value="headers">{t(language, "label.headers")}</option>
                <option value="message">{t(language, "label.message")}</option>
              </select>
              <select
                className="preview-mode-select"
                value={props.previewMode}
                onChange={(event) => props.onPreviewMode(event.target.value as MessagePreviewMode)}
                aria-label={t(language, "label.previewMode")}
              >
                <option value="text">{t(language, "label.previewText")}</option>
                <option value="json">{t(language, "label.previewJson")}</option>
                <option value="hex">{t(language, "label.previewHex")}</option>
                <option value="base64">{t(language, "label.previewBase64")}</option>
                <option value="metadata">{t(language, "label.previewMetadata")}</option>
              </select>
            </>
          )}
          {showEncoding && (
            <select
              className="preview-mode-select preview-encoding-select"
              value={props.previewEncoding}
              onChange={(event) => props.onPreviewEncoding(event.target.value as MessagePreviewEncoding)}
              aria-label={t(language, "label.previewEncoding")}
            >
              <option value="utf-8">UTF-8</option>
              <option value="euc-kr">EUC-KR</option>
            </select>
          )}
        </div>
        <input className="message-inspector-search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder={t(language, "placeholder.searchPayload")} />
        <div className="message-inspector-actions">
          <button className="ghost compact" onClick={() => void copyText(props.rawText)} disabled={!props.rawText}><Copy size={14} /> JSON</button>
          <button className="ghost compact" onClick={() => void copyText(valueCopyText)} disabled={!valueCopyText}><Copy size={14} /> {t(language, "label.value")}</button>
          {props.mode === "preview" && (
            <button className="ghost compact" onClick={() => void copyText(previewText)} disabled={!previewText}><Copy size={14} /> {t(language, "label.preview")}</button>
          )}
          <button
            className="ghost compact"
            onClick={() => void openLiveMap()}
            disabled={!props.selectedMessage}
            title={mapPoint ? t(language, "title.openLiveMap") : t(language, "label.mapFieldMappingRequired")}
          >
            <MapPin size={14} /> Map
          </button>
          <button
            className={props.mapFieldMapping ? "ghost compact active" : "ghost compact"}
            onClick={() => openMapSettings()}
            disabled={!props.selectedMessage}
            title={t(language, "title.mapFieldSettings")}
          >
            <Settings2 size={14} /> {t(language, "label.mapSettings")}
          </button>
          <div className="produce-action-menu-wrap" ref={produceMenuRef}>
            <button
              className="ghost compact"
              onClick={() => setIsProduceMenuOpen((current) => !current)}
              disabled={!props.selectedMessage}
              aria-expanded={isProduceMenuOpen}
            >
              <Send size={14} /> Produce <ChevronDown size={13} />
            </button>
            {isProduceMenuOpen && (
              <div className="produce-action-menu">
                <button
                  type="button"
                  onClick={() => {
                    if (props.selectedMessage) props.onSendToProduce(props.selectedMessage);
                    setIsProduceMenuOpen(false);
                  }}
                >
                  <strong>{t(language, "replay.produceCurrent")}</strong>
                  <span>{props.selectedMessage?.topic ?? "-"}</span>
                </button>
                <button type="button" onClick={() => openReplayDialog()}>
                  <strong>{t(language, "replay.chooseTarget")}</strong>
                  <span>{t(language, "replay.chooseTargetHelp")}</span>
                </button>
              </div>
            )}
          </div>
          <button className="ghost compact icon-only" onClick={props.onCollapse} title={t(language, "title.collapseMessageViewer")} aria-label={t(language, "title.collapseMessageViewer")}><ChevronDown size={15} /></button>
        </div>
      </div>
      {isReplayOpen && (
        <div className="modal-backdrop replay-target-backdrop" role="presentation" onMouseDown={() => setIsReplayOpen(false)}>
          <section className="replay-target-modal" role="dialog" aria-modal="true" aria-labelledby="replay-target-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <div>
                <span className="eyebrow">{props.selectedMessage?.topic ?? "Topic"}</span>
                <h2 id="replay-target-title">{t(language, "replay.title")}</h2>
              </div>
              <button className="modal-close" onClick={() => setIsReplayOpen(false)} title={t(language, "title.close")}>
                <X size={16} />
              </button>
            </div>
            <div className="replay-route-grid">
              {replayNotice && <div className="replay-notice" role="alert">{replayNotice}</div>}
              <section className="replay-route-card">
                <h3>{t(language, "label.source")}</h3>
                <div className="replay-source-modes" role="group" aria-label={t(language, "replay.sourceMode")}>
                  {replaySourceOptions.map((option) => (
                    <button
                      key={option.kind}
                      type="button"
                      className={replaySourceKind === option.kind ? "active" : ""}
                      disabled={option.count === 0}
                      onClick={() => changeReplaySource(option.kind)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.count}</span>
                    </button>
                  ))}
                </div>
                <dl>
                  <div><dt>{t(language, "label.cluster")}</dt><dd>{props.serverName}</dd></div>
                  <div><dt>{t(language, "label.topic")}</dt><dd>{replaySourceTopic || "-"}</dd></div>
                  <div><dt>{t(language, "label.count")}</dt><dd>{replayMessages.length || "-"}</dd></div>
                  <div><dt>Offset</dt><dd>{replayOffsetRange}</dd></div>
                </dl>
              </section>
              <section className="replay-route-card">
                <h3>{t(language, "label.target")}</h3>
                <div className="replay-target-server-picker" ref={replayServerPickerRef}>
                  <span>{t(language, "replay.targetServer")}</span>
                  <button
                    type="button"
                    className="replay-server-select-trigger"
                    disabled={Boolean(connectingReplayServerId)}
                    onClick={() => setIsReplayServerPickerOpen((current) => !current)}
                  >
                    <span className={selectedReplayServer?.connected ? "replay-server-status connected" : "replay-server-status disconnected"}>
                      {selectedReplayServer?.connected ? "" : <X size={9} strokeWidth={3} />}
                    </span>
                    <strong>{selectedReplayServer?.name ?? "-"}</strong>
                    <small>
                      {connectingReplayServerId === selectedReplayServer?.id
                        ? t(language, "replay.connectingServer")
                        : selectedReplayServer?.connected
                          ? t(language, "title.connected")
                          : t(language, "replay.connectOnSelect")}
                    </small>
                    <ChevronDown size={14} />
                  </button>
                  {isReplayServerPickerOpen && (
                    <div className="replay-server-list" role="listbox" aria-label={t(language, "replay.targetServer")}>
                      {props.replayTargets.map((target) => {
                        const isSelected = target.id === selectedReplayServer?.id;
                        const isConnecting = target.id === connectingReplayServerId;
                        return (
                          <button
                            key={target.id}
                            type="button"
                            className={isSelected ? "selected" : ""}
                            disabled={Boolean(connectingReplayServerId)}
                            onClick={() => void changeReplayServer(target.id)}
                          >
                            <span className={target.connected ? "replay-server-status connected" : "replay-server-status disconnected"}>
                              {target.connected ? "" : <X size={9} strokeWidth={3} />}
                            </span>
                            <strong>{target.name}</strong>
                            <small>{isConnecting ? t(language, "replay.connectingServer") : target.connected ? t(language, "title.connected") : t(language, "replay.connectOnSelect")}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="replay-target-topic-picker" ref={replayTopicPickerRef}>
                  <span>{t(language, "replay.targetTopic")}</span>
                  <button
                    type="button"
                    className="replay-topic-select-trigger"
                    onClick={() => setIsReplayTopicPickerOpen((current) => !current)}
                    disabled={!selectedReplayServer?.connected || selectedReplayServer.topics.length === 0}
                  >
                    <strong>{replayTopic || t(language, "replay.noTopics")}</strong>
                    {replayTopic === props.selectedMessage?.topic && selectedReplayServer?.id === props.serverId && <small>{t(language, "label.source")}</small>}
                    <ChevronDown size={14} />
                  </button>
                  {isReplayTopicPickerOpen && (
                    <div className="replay-topic-popover">
                      <label className="replay-target-search">
                        <Search size={14} />
                        <input
                          value={replayTopicQuery}
                          onChange={(event) => setReplayTopicQuery(event.target.value)}
                          placeholder={t(language, "placeholder.searchReplayTopic")}
                          autoFocus
                        />
                      </label>
                      <div className="replay-topic-list" role="listbox" aria-label={t(language, "replay.targetTopic")}>
                        {replayTopicOptions.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      className={topic === replayTopic ? "selected" : ""}
                      onClick={() => {
                        setReplayTopic(topic);
                        setIsReplayTopicPickerOpen(false);
                      }}
                    >
                      <span>{topic}</span>
                      {topic === props.selectedMessage?.topic && selectedReplayServer?.id === props.serverId && <small>{t(language, "label.source")}</small>}
                    </button>
                        ))}
                        {replayTopicOptions.length === 0 && <div className="replay-topic-empty">{t(language, "replay.noTopics")}</div>}
                      </div>
                    </div>
                  )}
                </div>
              </section>
              <section className="replay-route-card replay-payload-card">
                <h3>{t(language, "label.payload")}</h3>
                <label><input type="checkbox" checked={replayPayload.key} onChange={() => toggleReplayPayload("key")} /> {t(language, "label.key")}</label>
                <label><input type="checkbox" checked={replayPayload.headers} onChange={() => toggleReplayPayload("headers")} /> {t(language, "label.headers")}</label>
                <label><input type="checkbox" checked={replayPayload.value} onChange={() => toggleReplayPayload("value")} /> {t(language, "label.value")}</label>
              </section>
              <section className="replay-route-card replay-options-card">
                <h3>{t(language, "label.options")}</h3>
                <div className="replay-order-control" role="group" aria-label={t(language, "replay.order")}>
                  {(["grid", "original", "timestamp"] as ReplayOrder[]).map((order) => (
                    <button
                      key={order}
                      type="button"
                      className={replayOrder === order ? "active" : ""}
                      onClick={() => setReplayOrder(order)}
                      title={t(language, `replay.order.${order}.help`)}
                      aria-label={`${t(language, `replay.order.${order}`)}: ${t(language, `replay.order.${order}.help`)}`}
                    >
                      {t(language, `replay.order.${order}`)}
                    </button>
                  ))}
                </div>
                <p className="replay-option-help">{t(language, `replay.order.${replayOrder}.help`)}</p>
                <label><input type="checkbox" checked={replayStopOnFirstError} onChange={(event) => setReplayStopOnFirstError(event.target.checked)} /> {t(language, "replay.stopOnFirstError")}</label>
                <label className="replay-delay-control">
                  <input
                    type="checkbox"
                    checked={replayDelayEnabled}
                    onChange={(event) => setReplayDelayEnabled(event.target.checked)}
                  />
                  <span>{t(language, "replay.delayEnabled")}</span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={replayDelayMs}
                    onChange={(event) => setReplayDelayMs(event.target.value)}
                    disabled={!replayDelayEnabled}
                    aria-label={t(language, "replay.delayMs")}
                  />
                  <span>{t(language, "replay.delayUnit")}</span>
                </label>
              </section>
              {isSingleReplay ? (
              <section className="replay-route-card replay-editor-card">
                <div className="replay-editor-card-title">
                  <h3>{t(language, "replay.editPayload")}</h3>
                  <details className="replay-dynamic-guide">
                    <summary>{t(language, "produce.dynamicFieldGuide")}</summary>
                    <div>
                      {replayTemplateExamples.map((example) => (
                        <p key={example.syntax}>
                          <code>{example.syntax}</code>
                          <span>{example.description}</span>
                        </p>
                      ))}
                    </div>
                  </details>
                </div>
                <label>
                  <span>{t(language, "label.key")}</span>
                  <input
                    value={replayDraft.key}
                    onChange={(event) => setReplayDraft((current) => ({ ...current, key: event.target.value }))}
                    disabled={!replayPayload.key}
                  />
                </label>
                <label>
                  <span>{t(language, "label.headers")}</span>
                  <textarea
                    value={replayDraft.headers}
                    onChange={(event) => setReplayDraft((current) => ({ ...current, headers: event.target.value }))}
                    disabled={!replayPayload.headers}
                    spellCheck={false}
                  />
                </label>
                <label>
                  <span>{t(language, "label.value")}</span>
                  <textarea
                    value={replayDraft.value}
                    onChange={(event) => setReplayDraft((current) => ({ ...current, value: event.target.value }))}
                    disabled={!replayPayload.value}
                    spellCheck={false}
                  />
                </label>
              </section>
              ) : (
              <section className="replay-route-card replay-batch-card">
                <h3>{t(language, "replay.batchOptions")}</h3>
                <p>{t(language, "replay.batchOriginalPayload")}</p>
                <label className="replay-dynamic-toggle">
                  <input
                    type="checkbox"
                    checked={replayApplyDynamicFields}
                    onChange={(event) => setReplayApplyDynamicFields(event.target.checked)}
                  />
                  <span>{t(language, "replay.applyDynamicFields")}</span>
                </label>
                {replayApplyDynamicFields && (
                  <div className="replay-override-panel">
                    <div className="replay-override-title">
                      <strong>{t(language, "replay.valueOverrides")}</strong>
                      <details className="replay-dynamic-guide">
                        <summary>{t(language, "produce.dynamicFieldGuide")}</summary>
                        <div>
                          {replayTemplateExamples.map((example) => (
                            <p key={example.syntax}>
                              <code>{example.syntax}</code>
                              <span>{example.description}</span>
                            </p>
                          ))}
                        </div>
                      </details>
                    </div>
                    <p>{t(language, "replay.valueOverridesHelp")}</p>
                    <div className="replay-override-body">
                      <div className="replay-override-tree-panel">
                        <input
                          className="replay-override-search"
                          value={replayOverrideSearch}
                          onChange={(event) => setReplayOverrideSearch(event.target.value)}
                          placeholder={t(language, "placeholder.searchReplayOverrideFields")}
                        />
                        <div className="replay-override-tree">
                          {Array.from(replayOverrideTree.children.values())
                            .sort((left, right) => left.name.localeCompare(right.name))
                            .map((node) => renderReplayOverrideNode(node, 0))}
                          {replayOverrideTree.children.size === 0 && (
                            <div className="replay-override-empty">{t(language, "replay.noOverrideFields")}</div>
                          )}
                        </div>
                      </div>
                      <div className="replay-override-selected-panel">
                        <div className="replay-override-list">
                          {replayFieldOverrides.map((override) => (
                            <div className="replay-override-row" key={override.id}>
                              {override.path ? (
                                <button
                                  type="button"
                                  className="replay-override-path"
                                  title={`$.${override.path}`}
                                  aria-label={`$.${override.path}`}
                                >
                                  {formatMapFieldPath(override.path)}
                                </button>
                              ) : (
                                <input
                                  value={override.path}
                                  onChange={(event) => updateReplayFieldOverride(override.id, { path: event.target.value })}
                                  placeholder={t(language, "placeholder.replayOverridePath")}
                                  title={override.path ? `$.${override.path}` : t(language, "placeholder.replayOverridePath")}
                                />
                              )}
                              <input
                                value={override.value}
                                onChange={(event) => updateReplayFieldOverride(override.id, { value: event.target.value })}
                                placeholder="${timestamp}"
                                title={override.path ? `$.${override.path}` : undefined}
                              />
                              <button type="button" className="ghost icon-only" onClick={() => removeReplayFieldOverride(override.id)} title={t(language, "action.remove")}>
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button type="button" className="ghost compact replay-override-add" onClick={addReplayFieldOverride}>
                          + {t(language, "replay.addCustomOverride")}
                        </button>
                        {replayFieldOverrides.length === 0 && (
                          <div className="replay-override-empty">{t(language, "replay.noOverrideFields")}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
              )}
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setIsReplayOpen(false)}>{t(language, "action.cancel")}</button>
              <button className="primary" onClick={() => void submitReplay()} disabled={!selectedReplayServer?.connected || !replayTopic.trim() || (!replayPayload.key && !replayPayload.headers && !replayPayload.value)}>
                <Send size={14} /> {isSingleReplay ? t(language, "replay.send") : t(language, "replay.sendMany", { count: String(replayMessages.length) })}
              </button>
            </div>
          </section>
        </div>
      )}
      {isMapSettingsOpen && (
        <div className="modal-backdrop map-field-modal-backdrop" role="presentation" onMouseDown={() => setIsMapSettingsOpen(false)}>
          <section className="map-field-modal" role="dialog" aria-modal="true" aria-labelledby="map-field-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <div>
                <span className="eyebrow">{props.selectedMessage?.topic ?? "Topic"}</span>
                <h2 id="map-field-modal-title">{t(language, "label.mapFieldMapping")}</h2>
              </div>
              <button className="modal-close" onClick={() => setIsMapSettingsOpen(false)} title={t(language, "title.close")}>
                <X size={16} />
              </button>
            </div>
            <p className="map-field-modal-help">{t(language, "label.mapFieldMappingHelp")}</p>
            {mapSettingsNotice && <div className="map-field-modal-notice" role="alert">{mapSettingsNotice}</div>}
            <div className={activeMapFieldPicker ? "map-field-modal-grid picker-open" : "map-field-modal-grid"}>
              <div className="map-field-section">
                <strong>{t(language, "label.mapCoordinateSection")}</strong>
              </div>
              <label>
                <span>{t(language, "label.mapCoordinateSystem")}</span>
                <select value={mapSettingsDraft.projection} onChange={(event) => {
                  closeFieldPicker();
                  updateMapSettingsDraft({ projection: event.target.value as MapFieldMapping["projection"] });
                }}>
                  <optgroup label={t(language, "label.mapProjectionWgs84Group")}>
                    <option value="wgs84">WGS84 (Lat/Lng Deg)</option>
                    <option value="wgs84_e6">{t(language, "label.mapProjectionWgs84E6")}</option>
                    <option value="wgs84_msec">WGS84 (Lat/Lng Msec)</option>
                  </optgroup>
                  <optgroup label={t(language, "label.mapProjectionTmGroup")}>
                    <option value="korea_grs80_central">GRS80 (Korea Central Belt / 한국 중부원점)</option>
                    <option value="korea_itrf2000_central">ITRF 2000 (Central Belt / 한국 중부원점)</option>
                  </optgroup>
                  <optgroup label={t(language, "label.mapProjectionUtmGroup")}>
                    <option value="utm52n">UTM Zone 52N (Korea Belt)</option>
                  </optgroup>
                </select>
              </label>
              <div className="map-field-section">
                <strong>{t(language, "label.mapRequiredCoordinateSection")}</strong>
              </div>
              <label>
                <span>{t(language, "label.mapYField")}</span>
                {renderMapFieldPicker({ id: "y", value: mapSettingsDraft.yPath, required: true, autoPath: autoMapFieldPaths.y, onChange: (yPath) => updateMapSettingsDraft({ yPath }) })}
              </label>
              <label>
                <span>{t(language, "label.mapXField")}</span>
                {renderMapFieldPicker({ id: "x", value: mapSettingsDraft.xPath, required: true, autoPath: autoMapFieldPaths.x, onChange: (xPath) => updateMapSettingsDraft({ xPath }) })}
              </label>
              <div className="map-field-section">
                <strong>{t(language, "label.mapVehicleSection")}</strong>
              </div>
              <label>
                <span>{t(language, "label.mapHeadingField")}</span>
                {renderMapFieldPicker({ id: "heading", value: mapSettingsDraft.headingPath ?? "", autoPath: autoMapFieldPaths.heading, placement: "top", onChange: (headingPath) => updateMapSettingsDraft({ headingPath }) })}
              </label>
              <div className="map-field-row">
                <label>
                  <span>{t(language, "label.mapSpeedField")}</span>
                  {renderMapFieldPicker({ id: "speed", value: mapSettingsDraft.speedPath ?? "", autoPath: autoMapFieldPaths.speed, placement: "top", onChange: (speedPath) => updateMapSettingsDraft({ speedPath }) })}
                </label>
                <label>
                  <span>{t(language, "label.mapSpeedUnit")}</span>
                  <select
                  value={mapSettingsDraft.speedUnit ?? "auto"}
                  onChange={(event) => {
                    closeFieldPicker();
                    updateMapSettingsDraft({ speedUnit: event.target.value as MapFieldMapping["speedUnit"] });
                  }}
                >
                    <option value="auto">{t(language, "label.autoDetect")}</option>
                    <option value="kmh">km/h</option>
                    <option value="mps">m/s</option>
                  </select>
                </label>
              </div>
              <label>
                <span>{t(language, "label.mapIdentityField")}</span>
                {renderMapFieldPicker({ id: "identity", value: mapSettingsDraft.identityPath ?? "", autoPath: autoMapFieldPaths.identity, placement: "top", onChange: (identityPath) => updateMapSettingsDraft({ identityPath }) })}
              </label>
            </div>
            <div className="modal-actions">
              <button className="ghost compact" onClick={clearMapSettings}>{t(language, "label.clear")}</button>
              <button className="ghost compact" onClick={() => setIsMapSettingsOpen(false)}>{t(language, "action.cancel")}</button>
              <button className="primary compact" onClick={applyMapSettings} disabled={!mapSettingsDraft.xPath || !mapSettingsDraft.yPath}>{t(language, "action.save")}</button>
            </div>
          </section>
        </div>
      )}
      {props.selectedMessage ? (
        props.mode === "tree" ? (
          canShowTree ? (
            <div
              className="message-tree"
              tabIndex={0}
              onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
              onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
            >
              <MessageTreeNode
                name="message"
                value={props.payload}
                path="message"
                search={props.search}
                valueColumnPaths={props.valueColumnPaths}
                onApplyFilter={props.onApplyFilter}
                onValueColumnPath={props.onValueColumnPath}
              />
            </div>
          ) : (
            <pre
              className="message-view"
              tabIndex={0}
              onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
              onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
            >
              {t(language, "label.noStructuredPayload")}
            </pre>
          )
        ) : props.mode === "preview" ? (
          <pre
            className={props.previewMode === "hex" ? "message-view message-preview hex-preview" : "message-view message-preview"}
            tabIndex={0}
            onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
            onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
          >
            {renderHighlightedText(previewText || t(language, "label.emptyPayload"), props.search)}
          </pre>
        ) : (
          <pre
            className="message-view"
            tabIndex={0}
            onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
            onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
          >
            {renderRawJsonText(props.rawText, props.search)}
          </pre>
        )
      ) : (
        <pre
          className="message-view"
          tabIndex={0}
          onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
          onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
        >
          {t(language, "label.selectMessageToInspect")}
        </pre>
      )}
    </section>
  );
}

export function MessageTreeNode(props: {
  name: string;
  value: unknown;
  path: string;
  search: string;
  valueColumnPaths: string[];
  onApplyFilter: (value: string) => void;
  onValueColumnPath: (path: string) => void;
}) {
  const language = useAppLanguage();
  const [expanded, setExpanded] = useState(true);
  const isObject = props.value !== null && typeof props.value === "object";
  const entries = isObject ? Object.entries(props.value as Record<string, unknown>) : [];
  const primitive = stringifyPrimitive(props.value);
  const epochTitle = getEpochTitle(props.value);

  if (!isObject) {
    const valueColumnPath = getValueColumnPathFromTreePath(props.path);
    const isValueColumnSelected = Boolean(valueColumnPath && props.valueColumnPaths.includes(valueColumnPath));
    return (
      <div className="message-tree-node leaf">
        <span className="message-tree-key">{renderHighlightedText(props.name, props.search)}</span>
        <span className="message-tree-separator">:</span>
        <span className="message-tree-value" title={epochTitle}>{renderHighlightedText(primitive, props.search)}</span>
        <button className="message-tree-filter" onClick={() => props.onApplyFilter(primitive)} title={t(language, "title.applyToFilter")}>
          <Filter size={12} />
        </button>
        {valueColumnPath && (
          <button
            className={isValueColumnSelected ? "message-tree-column selected" : "message-tree-column"}
            onClick={() => props.onValueColumnPath(valueColumnPath)}
            title={isValueColumnSelected ? t(language, "title.valueColumnAlreadyAdded") : t(language, "title.addValueColumn")}
            aria-label={isValueColumnSelected ? t(language, "title.valueColumnAlreadyAdded") : t(language, "title.addValueColumn")}
          >
            <Columns3 size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="message-tree-node">
      <button className="message-tree-node-toggle" onClick={() => setExpanded((current) => !current)}>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="message-tree-key">{renderHighlightedText(props.name, props.search)}</span>
        <span className="message-tree-meta">{Array.isArray(props.value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </button>
      {expanded && (
        <div className="message-tree-children">
          {entries.map(([key, value]) => (
            <MessageTreeNode
              key={`${props.path}.${key}`}
              name={key}
              value={value}
              path={`${props.path}.${key}`}
              search={props.search}
              valueColumnPaths={props.valueColumnPaths}
              onApplyFilter={props.onApplyFilter}
              onValueColumnPath={props.onValueColumnPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
