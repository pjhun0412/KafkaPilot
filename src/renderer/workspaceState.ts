import type { DragPayload, SplitPaneState, TopicConsumeState, WorkspaceActionTarget, WorkspacePaneId } from "./uiTypes";

export type ConsumeStatesByServer = Record<string, Record<string, TopicConsumeState>>;
export const workspaceDragPayloadType = "application/x-kafkapilot";

export function addTopicTab(tabs: string[], topic: string) {
  return tabs.includes(topic) ? tabs : [...tabs, topic];
}

export function setPreviewTopicTab(tabs: string[], topic: string, previousPreviewTopic = "") {
  const withoutPreviousPreview = previousPreviewTopic && previousPreviewTopic !== topic
    ? tabs.filter((item) => item !== previousPreviewTopic)
    : tabs;
  return withoutPreviousPreview.includes(topic) ? withoutPreviousPreview : [...withoutPreviousPreview, topic];
}

export function removeTopicTab(tabs: string[], topic: string) {
  return tabs.filter((item) => item !== topic);
}

export function getTopicConsumeState(states: ConsumeStatesByServer, serverId: string, topic: string) {
  return states[serverId]?.[topic] ?? null;
}

export function cloneTopicConsumeState(state: TopicConsumeState): TopicConsumeState {
  return {
    ...state,
    messages: state.messages,
    selectedMessage: state.selectedMessage,
    offsetPagination: state.offsetPagination
      ? {
          ...state.offsetPagination,
          prevOffsets: [...state.offsetPagination.prevOffsets]
        }
      : null
  };
}

export function setTopicConsumeState(
  states: ConsumeStatesByServer,
  serverId: string,
  topic: string,
  state: TopicConsumeState
): ConsumeStatesByServer {
  return {
    ...states,
    [serverId]: {
      ...(states[serverId] ?? {}),
      [topic]: cloneTopicConsumeState(state)
    }
  };
}

export function removeTopicConsumeState(states: ConsumeStatesByServer, serverId: string, topic: string) {
  const serverStates = { ...(states[serverId] ?? {}) };
  delete serverStates[topic];
  return { ...states, [serverId]: serverStates };
}

export function removeTopicConsumeStates(states: ConsumeStatesByServer, serverId: string, topics: Iterable<string>) {
  const serverStates = { ...(states[serverId] ?? {}) };
  for (const topic of topics) {
    delete serverStates[topic];
  }
  return { ...states, [serverId]: serverStates };
}

export function mergeTopicConsumeStates(
  states: ConsumeStatesByServer,
  serverId: string,
  serverStates: Record<string, TopicConsumeState>
) {
  const currentServerStates = states[serverId] ?? {};
  const clonedServerStates = Object.fromEntries(
    Object.entries(serverStates)
      .filter(([topic]) => !currentServerStates[topic])
      .map(([topic, state]) => [topic, cloneTopicConsumeState(state)])
  );
  return {
    ...states,
    [serverId]: {
      ...currentServerStates,
      ...clonedServerStates
    }
  };
}

export function clearServerConsumeStates(states: ConsumeStatesByServer, serverId: string) {
  const next = { ...states };
  delete next[serverId];
  return next;
}

export function getNextTopicAfterTabClose(currentTopic: string, closedTopic: string, nextTabs: string[]) {
  if (currentTopic && currentTopic !== closedTopic && nextTabs.includes(currentTopic)) {
    return currentTopic;
  }
  return nextTabs[nextTabs.length - 1] ?? "";
}

export function createSplitPaneForTopic(
  current: SplitPaneState | null,
  serverId: string,
  topic: string,
  view: SplitPaneState["view"],
  detail: SplitPaneState["detail"]
): SplitPaneState {
  const previousTabs = current?.serverId === serverId ? current.topicTabs : [];
  return {
    serverId,
    topic,
    topicTabs: addTopicTab(previousTabs, topic),
    previewTopic: undefined,
    view,
    detail
  };
}

export function activateTopicInSplitPane(
  current: SplitPaneState | null,
  topic: string,
  view: SplitPaneState["view"],
  shouldClearDetail: boolean,
  options: { addToTabs?: boolean; preservePreview?: boolean; detail?: SplitPaneState["detail"] } = {}
) {
  if (!current) return current;
  const addToTabs = options.addToTabs ?? true;
  const preservePreview = options.preservePreview && Boolean(current.previewTopic);
  const topicTabs = addToTabs
    ? addTopicTab(
        current.previewTopic && current.previewTopic !== topic && !preservePreview
          ? current.topicTabs.filter((item) => item !== current.previewTopic)
          : current.topicTabs,
        topic
      )
    : setPreviewTopicTab(current.topicTabs, topic, current.previewTopic);
  return {
    ...current,
    topic,
    topicTabs,
    previewTopic: preservePreview ? current.previewTopic : addToTabs ? undefined : topic,
    view,
    detail: options.detail ?? (shouldClearDetail ? null : current.detail)
  };
}

export function closeTopicInSplitPane(
  current: SplitPaneState,
  topic: string,
  getTopicView: (topic: string) => SplitPaneState["view"]
) {
  const nextTabs = removeTopicTab(current.topicTabs, topic);
  if (nextTabs.length === 0) {
    return {
      pane: null,
      nextTopic: "",
      nextView: "topics" as SplitPaneState["view"],
      closedActiveTopic: current.topic === topic
    };
  }

  const nextTopic = getNextTopicAfterTabClose(current.topic, topic, nextTabs);
  const nextView = nextTopic ? getTopicView(nextTopic) : "topics";
  const closedActiveTopic = current.topic === topic;
  return {
    pane: {
      ...current,
      topic: nextTopic,
      topicTabs: nextTabs,
      previewTopic: current.previewTopic === topic ? undefined : current.previewTopic,
      view: nextView,
      detail: closedActiveTopic ? null : current.detail
    },
    nextTopic,
    nextView,
    closedActiveTopic
  };
}

export function mergeTopicTabs(existingTabs: string[], incomingTabs: string[]) {
  let mergedTabs = existingTabs;
  for (const topic of incomingTabs) {
    mergedTabs = addTopicTab(mergedTabs, topic);
  }
  return mergedTabs;
}

export function getConsumeTaskKey(pane: WorkspacePaneId, serverId: string, topic: string) {
  return `${pane}:${serverId}:${topic}`;
}

export function getStreamingTopicKey(pane: WorkspacePaneId, topic: string) {
  return `${pane}:${topic}`;
}

export function readStreamingTopicKey(value: string): { pane: WorkspacePaneId; topic: string } {
  const separatorIndex = value.indexOf(":");
  const pane = value.slice(0, separatorIndex);
  return {
    pane: pane === "split" ? "split" : "primary",
    topic: separatorIndex === -1 ? value : value.slice(separatorIndex + 1)
  };
}

export function retargetStreamingTopicKeys(topics: string[], fromPane: WorkspacePaneId, toPane: WorkspacePaneId) {
  return topics.map((item) => {
    const parsed = readStreamingTopicKey(item);
    return parsed.pane === fromPane ? getStreamingTopicKey(toPane, parsed.topic) : item;
  });
}

export function isSplitWorkspaceActiveForServer(visibleSplitPane: SplitPaneState | null, serverId: string) {
  return Boolean(visibleSplitPane && visibleSplitPane.serverId === serverId);
}

export function getWorkspaceTargetForServer(params: {
  activeWorkspacePane: WorkspacePaneId;
  visibleSplitPane: SplitPaneState | null;
  selectedTopicByServer: Record<string, string>;
  selectedServerId: string;
  serverId?: string;
  topic?: string;
}): WorkspaceActionTarget {
  const serverId = params.serverId ?? params.selectedServerId;
  if (params.activeWorkspacePane === "split" && isSplitWorkspaceActiveForServer(params.visibleSplitPane, serverId)) {
    return {
      pane: "split",
      serverId,
      topic: params.topic ?? params.visibleSplitPane?.topic
    };
  }
  return {
    pane: "primary",
    serverId,
    topic: params.topic ?? params.selectedTopicByServer[serverId] ?? ""
  };
}

export function writeWorkspaceDragPayload(dataTransfer: DataTransfer, payload: DragPayload) {
  dataTransfer.effectAllowed = "move";
  dataTransfer.setData(workspaceDragPayloadType, JSON.stringify(payload));
}

export function parseWorkspaceDragPayload(raw: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}
