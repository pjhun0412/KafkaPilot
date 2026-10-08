import type { KafkaApi, TopicDetail } from "../../../shared/types";
import type { SplitPaneState, TopicConsumeState, TopicWorkView, WorkspacePaneId } from "../../uiTypes";
import { isTopicWorkView } from "../../utils";
import { mergeTopicTabs } from "../../workspaceState";

export type ConsumeStatesByServer = Record<string, Record<string, TopicConsumeState>>;

export function addUniqueTopicTab(tabs: string[], topic: string) {
  return tabs.includes(topic) ? tabs : [...tabs, topic];
}

export async function stopSplitPaneStreamingTopics(
  pane: SplitPaneState,
  isTopicStreaming: (serverId: string, topic: string, pane: WorkspacePaneId) => boolean,
  stopConsume: (serverId?: string, topic?: string, pane?: WorkspacePaneId) => Promise<void>
) {
  for (const topic of pane.topicTabs) {
    await stopConsume(pane.serverId, topic, "split");
  }
}

export function getSplitPanePromoteTarget(
  pane: SplitPaneState,
  getTopicViewFor: (serverId: string, topic: string) => TopicWorkView
) {
  const nextTopic = pane.topic || (pane.topicTabs[pane.topicTabs.length - 1] ?? "");
  const nextView = isTopicWorkView(pane.view) ? pane.view : getTopicViewFor(pane.serverId, nextTopic);
  return { nextTopic, nextView };
}

export function mergeSplitTopicTabsByServer(
  current: Record<string, string[]>,
  pane: SplitPaneState
) {
  const existingTabs = current[pane.serverId] ?? [];
  const pinnedSplitTabs = pane.previewTopic ? pane.topicTabs.filter((topic) => topic !== pane.previewTopic) : pane.topicTabs;
  return { ...current, [pane.serverId]: mergeTopicTabs(existingTabs, pinnedSplitTabs) };
}

export function mergeSplitTopicViewsByServer(
  current: Record<string, Record<string, TopicWorkView>>,
  pane: SplitPaneState,
  nextTopic: string,
  nextView: TopicWorkView,
  getTopicViewFor: (serverId: string, topic: string) => TopicWorkView
) {
  const nextViews = { ...(current[pane.serverId] ?? {}) };
  for (const topic of pane.topicTabs) {
    nextViews[topic] = topic === nextTopic ? nextView : nextViews[topic] ?? getTopicViewFor(pane.serverId, topic);
  }
  return { ...current, [pane.serverId]: nextViews };
}

export function retargetSplitStreamingTopics(
  pane: SplitPaneState,
  isTopicStreaming: (serverId: string, topic: string, pane: WorkspacePaneId) => boolean,
  retargetLiveTopic: (serverId: string, topic: string, from: WorkspacePaneId, to: WorkspacePaneId) => void
) {
  for (const topic of pane.topicTabs) {
    retargetLiveTopic(pane.serverId, topic, "split", "primary");
  }
}

export async function moveTopicBetweenPanes(params: {
  serverId: string;
  topic: string;
  from: WorkspacePaneId;
  to: WorkspacePaneId;
  targetAlreadyOpen: boolean;
  isTopicStreaming: (serverId: string, topic: string, pane: WorkspacePaneId) => boolean;
  stopConsume: (serverId?: string, topic?: string, pane?: WorkspacePaneId) => Promise<void>;
  moveConsumeStateBetweenPanes: (serverId: string, topic: string, from: WorkspacePaneId, to: WorkspacePaneId) => void;
  retargetLiveTopic: (serverId: string, topic: string, from: WorkspacePaneId, to: WorkspacePaneId) => void;
}) {
  if (params.targetAlreadyOpen) {
    await params.stopConsume(params.serverId, params.topic, params.from);
  }
  params.moveConsumeStateBetweenPanes(params.serverId, params.topic, params.from, params.to);
  if (!params.targetAlreadyOpen) {
    params.retargetLiveTopic(params.serverId, params.topic, params.from, params.to);
  }
}

export async function resolvePromotedTopicDetail(params: {
  kafkaApi: KafkaApi | undefined;
  pane: SplitPaneState;
  nextTopic: string;
  nextView: TopicWorkView;
  getCachedTopicDetail: (serverId: string, topic: string) => TopicDetail | null;
}) {
  const cachedDetail = params.getCachedTopicDetail(params.pane.serverId, params.nextTopic);
  const nextDetail = params.pane.topic === params.nextTopic ? params.pane.detail ?? cachedDetail : cachedDetail;
  if (nextDetail) return nextDetail;
  if (params.nextView === "info" && params.kafkaApi) {
    return params.kafkaApi.getTopicDetail(params.pane.serverId, params.nextTopic);
  }
  return null;
}
