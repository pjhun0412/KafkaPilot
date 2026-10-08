import { emptyProduceDraft } from "../../state";
import type { TopicDetail } from "../../../../shared/types";
import type { SplitPaneState, TopicConsumeState, View } from "../../../uiTypes";
import type { ProduceDraft } from "../../state/useProduceDraftStore";

export type WorkspaceDerivedStateParams = {
  selectedServerId: string;
  selectedTopicByServer: Record<string, string>;
  previewTopicByServer: Record<string, string>;
  viewByServer: Record<string, View>;
  openedTopicTabsByServer: Record<string, string[]>;
  topicDetailByServer: Record<string, TopicDetail | null>;
  topicDetailCacheByServer: Record<string, Record<string, TopicDetail>>;
  consumeStatesByServer: Record<string, Record<string, TopicConsumeState>>;
  splitPane: SplitPaneState | null;
  getDefaultConsumeState: (serverId?: string, topic?: string) => TopicConsumeState;
  getProduceDraft: (serverId: string, topic: string) => ProduceDraft;
};

export function useWorkspaceDerivedState(params: WorkspaceDerivedStateParams) {
  const selectedTopic = params.selectedTopicByServer[params.selectedServerId] ?? "";
  const previewTopic = params.previewTopicByServer[params.selectedServerId] ?? "";
  const view = params.viewByServer[params.selectedServerId] ?? (selectedTopic ? "info" : "topics");
  const rawTopicTabs = params.openedTopicTabsByServer[params.selectedServerId] ?? [];
  const pinnedTopicTabs = previewTopic ? rawTopicTabs.filter((topic) => topic !== previewTopic) : rawTopicTabs;
  const openedTopicTabs = previewTopic && !pinnedTopicTabs.includes(previewTopic)
    ? [...pinnedTopicTabs, previewTopic]
    : pinnedTopicTabs;
  const serverDetail = params.topicDetailByServer[params.selectedServerId];
  const topicDetail = params.topicDetailCacheByServer[params.selectedServerId]?.[selectedTopic]
    ?? (serverDetail?.name === selectedTopic ? serverDetail : null);
  const consumeStates = params.consumeStatesByServer[params.selectedServerId] ?? {};
  const selectedDefaultConsumeState = params.getDefaultConsumeState(params.selectedServerId, selectedTopic);
  const visibleSplitPane = params.splitPane?.serverId === params.selectedServerId ? params.splitPane : null;
  const selectedProduceDraft = params.getProduceDraft(params.selectedServerId, selectedTopic);
  const splitProduceDraft = visibleSplitPane
    ? params.getProduceDraft(visibleSplitPane.serverId, visibleSplitPane.topic)
    : emptyProduceDraft;

  return {
    selectedTopic,
    view,
    openedTopicTabs,
    pinnedTopicTabs,
    previewTopic,
    topicDetail,
    consumeStates,
    selectedDefaultConsumeState,
    visibleSplitPane,
    selectedProduceDraft,
    splitProduceDraft
  };
}
