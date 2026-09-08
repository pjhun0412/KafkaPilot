import { useEffect, useMemo, useRef, useState } from "react";
import type { ConsumedMessage } from "../../../../shared/types";
import { collectValuePaths, getMessageValuePayload } from "../../../consumeValuePaths";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import { getProduceTemplateExamples } from "../../../produceTemplate";
import { startReplayJob } from "../../../replayJobs";
import type { ReplayDraft, ReplayPayloadOptions } from "../../../replayTypes";
import type { MessageInspectorProps } from "./inspectorTypes";
import { prepareReplayDrafts } from "./prepareReplayDrafts";
import type { ReplayFieldOverride, ReplayOrder, ReplayOverrideTreeNode, ReplaySourceKind } from "./replayDrafts";
import { createReplayDraft, createReplayOverrideTree, getDefaultReplayOverrideValue, getReplayOverrideLeafPaths } from "./replayDrafts";

export type InspectorReplayProps = Pick<MessageInspectorProps, "selectedMessage" | "replayTargets" | "serverId" | "selectedReplayMessages" | "filteredReplayMessages" | "allReplayMessages" | "serverName" | "onReplayMessage" | "onConnectReplayServer">;

export function useInspectorReplay(props: InspectorReplayProps) {
  const language = useAppLanguage();
  const [isReplayOpen, setIsReplayOpen] = useState(false);
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
  const replayServerPickerRef = useRef<HTMLDivElement | null>(null);
  const replayTopicPickerRef = useRef<HTMLDivElement | null>(null);
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
    setIsReplayOpen(true);
  }

  async function submitReplay() {
    if (replayMessages.length === 0 || !replayTopic.trim() || !selectedReplayServer) return;
    const delayMs = replayDelayEnabled ? Math.max(0, Math.floor(Number(replayDelayMs) || 0)) : 0;
    const prepared = prepareReplayDrafts({
      messages: replayMessages,
      order: replayOrder,
      payload: replayPayload,
      editedDraft: replayDraft,
      applyDynamicFields: replayApplyDynamicFields,
      fieldOverrides: replayFieldOverrides,
      language
    });
    if (!prepared.ok) {
      setReplayNotice(prepared.error);
      return;
    }
    const { orderedMessages, drafts } = prepared;
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
  return {
    isReplayOpen,
    setIsReplayOpen,
    isReplayServerPickerOpen,
    setIsReplayServerPickerOpen,
    isReplayTopicPickerOpen,
    setIsReplayTopicPickerOpen,
    connectingReplayServerId,
    replayTopic,
    setReplayTopic,
    replayTopicQuery,
    setReplayTopicQuery,
    replayPayload,
    replaySourceKind,
    replayMessages,
    replayDraft,
    setReplayDraft,
    replayNotice,
    replayApplyDynamicFields,
    setReplayApplyDynamicFields,
    replayFieldOverrides,
    replayOverrideSearch,
    setReplayOverrideSearch,
    expandedReplayOverrideGroups,
    replayOrder,
    setReplayOrder,
    replayStopOnFirstError,
    setReplayStopOnFirstError,
    replayDelayEnabled,
    setReplayDelayEnabled,
    replayDelayMs,
    setReplayDelayMs,
    replayServerPickerRef,
    replayTopicPickerRef,
    isSingleReplay,
    replaySourceTopic,
    replayOffsetRange,
    selectedReplayServer,
    replayTopicOptions,
    replayTemplateExamples,
    replayOverrideTree,
    replaySourceOptions,
    changeReplaySource,
    openReplayDialog,
    submitReplay,
    toggleReplayPayload,
    addReplayFieldOverride,
    toggleReplayOverridePath,
    toggleReplayOverrideGroup,
    toggleReplayOverrideGroupSelection,
    updateReplayFieldOverride,
    removeReplayFieldOverride,
    changeReplayServer
  };
}
