import type { Dispatch, SetStateAction } from "react";
import type { KafkaApi, TopicDetail } from "../../../shared/types";
import type { SplitPaneState, TopicConsumeState, TopicWorkView, View, WorkspacePaneId } from "../../uiTypes";
import {
  clearServerConsumeStates,
  closeTopicInSplitPane,
  createSplitPaneForTopic,
  getNextTopicAfterTabClose,
  mergeTopicConsumeStates,
  removeTopicTab
} from "../../workspaceState";
import {
  addUniqueTopicTab,
  getSplitPanePromoteTarget,
  mergeSplitTopicTabsByServer,
  mergeSplitTopicViewsByServer,
  moveTopicBetweenPanes,
  retargetSplitStreamingTopics,
  resolvePromotedTopicDetail,
  stopSplitPaneStreamingTopics,
  type ConsumeStatesByServer
} from "./splitPaneActionUtils";

type SplitPaneActionsParams = {
  kafkaApi: KafkaApi | undefined;
  selectedServerId: string;
  selectedTopic: string;
  openedTopicTabs: string[];
  previewTopic: string;
  splitPane: SplitPaneState | null;
  splitConsumeStatesByServer: ConsumeStatesByServer;
  topicDetailByServer: Record<string, TopicDetail | null>;
  getTopicViewFor: (serverId: string, topic: string) => TopicWorkView;
  getCachedTopicDetail: (serverId: string, topic: string) => TopicDetail | null;
  setTopicDetailForServer: (serverId: string, detail: TopicDetail | null) => void;
  isTopicStreaming: (serverId: string, topic: string, pane: WorkspacePaneId) => boolean;
  stopConsume: (serverId?: string, topic?: string, pane?: WorkspacePaneId) => Promise<void>;
  moveConsumeStateBetweenPanes: (serverId: string, topic: string, from: WorkspacePaneId, to: WorkspacePaneId) => void;
  retargetLiveTopic: (serverId: string, topic: string, from: WorkspacePaneId, to: WorkspacePaneId) => void;
  clearConsumeStatesForPane: (serverId: string, topicsToClear: Iterable<string>, pane: WorkspacePaneId) => void;
  clearConsumeStateForPane: (serverId: string, topic: string, pane: WorkspacePaneId) => void;
  loadSplitTopicDetailSilent: (serverId: string, topic: string, options?: { force?: boolean }) => Promise<void>;
  selectPrimaryTopic: (topic: string) => Promise<void>;
  setOpenedTopicTabs: (action: string[] | ((current: string[]) => string[])) => void;
  setSelectedTopic: (topic: string) => void;
  setTopicDetail: (detail: TopicDetail | null) => void;
  setSplitPane: Dispatch<SetStateAction<SplitPaneState | null>>;
  setActiveWorkspacePane: Dispatch<SetStateAction<WorkspacePaneId>>;
  setSelectedServerId: Dispatch<SetStateAction<string>>;
  setOpenedTopicTabsByServer: Dispatch<SetStateAction<Record<string, string[]>>>;
  setPreviewTopicByServer: Dispatch<SetStateAction<Record<string, string>>>;
  setSelectedTopicByServer: Dispatch<SetStateAction<Record<string, string>>>;
  setViewByServer: Dispatch<SetStateAction<Record<string, View>>>;
  setTopicViewByServer: Dispatch<SetStateAction<Record<string, Record<string, TopicWorkView>>>>;
  setConsumeStatesByServer: Dispatch<SetStateAction<ConsumeStatesByServer>>;
  setSplitConsumeStatesByServer: Dispatch<SetStateAction<ConsumeStatesByServer>>;
};

export function useSplitPaneActions({
  kafkaApi,
  selectedServerId,
  selectedTopic,
  openedTopicTabs,
  previewTopic,
  splitPane,
  splitConsumeStatesByServer,
  topicDetailByServer,
  getTopicViewFor,
  getCachedTopicDetail,
  setTopicDetailForServer,
  isTopicStreaming,
  stopConsume,
  moveConsumeStateBetweenPanes,
  retargetLiveTopic,
  clearConsumeStatesForPane,
  clearConsumeStateForPane,
  loadSplitTopicDetailSilent,
  selectPrimaryTopic,
  setOpenedTopicTabs,
  setSelectedTopic,
  setTopicDetail,
  setSplitPane,
  setActiveWorkspacePane,
  setSelectedServerId,
  setOpenedTopicTabsByServer,
  setPreviewTopicByServer,
  setSelectedTopicByServer,
  setViewByServer,
  setTopicViewByServer,
  setConsumeStatesByServer,
  setSplitConsumeStatesByServer
}: SplitPaneActionsParams) {
  async function openSplitForTopic(serverId: string, topic: string) {
    if (!topic || serverId !== selectedServerId) return;
    const nextView = getTopicViewFor(serverId, topic);
    const existingDetail = getCachedTopicDetail(serverId, topic) ?? (topicDetailByServer[serverId]?.name === topic ? topicDetailByServer[serverId] : null);
    const isAlreadyOpenInSplit = splitPane?.serverId === serverId && splitPane.topicTabs.includes(topic);
    await moveTopicBetweenPanes({
      serverId,
      topic,
      from: "primary",
      to: "split",
      targetAlreadyOpen: isAlreadyOpenInSplit,
      isTopicStreaming,
      stopConsume,
      moveConsumeStateBetweenPanes,
      retargetLiveTopic
    });
    setSplitPane((current) => createSplitPaneForTopic(current, serverId, topic, nextView, existingDetail));
    await removePrimaryTopicTabAfterSplit(topic);
    setActiveWorkspacePane("split");
    if (nextView === "info" && !existingDetail) {
      await loadSplitTopicDetailSilent(serverId, topic);
    }
  }

  async function openPrimaryTopicTab(topic: string) {
    setOpenedTopicTabs((current) => addUniqueTopicTab(current, topic));
    await selectPrimaryTopic(topic);
  }

  async function moveSplitTopicToPrimary(topic: string) {
    const pane = splitPane;
    if (!pane || pane.serverId !== selectedServerId || !pane.topicTabs.includes(topic)) return;
    const isAlreadyOpenInPrimary = openedTopicTabs.includes(topic);
    await moveTopicBetweenPanes({
      serverId: pane.serverId,
      topic,
      from: "split",
      to: "primary",
      targetAlreadyOpen: isAlreadyOpenInPrimary,
      isTopicStreaming,
      stopConsume,
      moveConsumeStateBetweenPanes,
      retargetLiveTopic
    });
    await openPrimaryTopicTab(topic);
    await removeSplitTopicTabAfterMove(topic);
    setActiveWorkspacePane("primary");
  }

  async function removePrimaryTopicTabAfterSplit(topic: string) {
    if (previewTopic !== topic && !openedTopicTabs.includes(topic)) return;
    const pinnedTabs = previewTopic ? openedTopicTabs.filter((item) => item !== previewTopic) : openedTopicTabs;
    const nextTabs = previewTopic === topic ? pinnedTabs : removeTopicTab(pinnedTabs, topic);
    setOpenedTopicTabs(nextTabs);
    if (previewTopic === topic) {
      setPreviewTopicByServer((current) => ({ ...current, [selectedServerId]: "" }));
    }
    if (selectedTopic !== topic) return;
    const nextTopic = getNextTopicAfterTabClose(selectedTopic, topic, nextTabs);
    if (nextTopic) {
      await selectPrimaryTopic(nextTopic);
      return;
    }
    setSelectedTopic("");
    setTopicDetail(null);
    setViewByServer((current) => ({ ...current, [selectedServerId]: "topics" }));
  }

  async function closeSplitPane() {
    const pane = splitPane;
    if (!pane) return;
    await stopSplitPaneStreamingTopics(pane, isTopicStreaming, stopConsume);
    clearConsumeStatesForPane(pane.serverId, pane.topicTabs, "split");
    setSplitPane(null);
    setActiveWorkspacePane("primary");
  }

  async function closeSplitTopicTab(topic: string) {
    const pane = splitPane;
    if (!pane) return;
    await stopConsume(pane.serverId, topic, "split");
    clearConsumeStateForPane(pane.serverId, topic, "split");
    await applySplitTopicClose(topic);
  }

  async function removeSplitTopicTabAfterMove(topic: string) {
    await applySplitTopicClose(topic);
  }

  async function applySplitTopicClose(topic: string) {
    let nextLoadServerId = "";
    let nextLoadTopic = "";
    let closedPane = false;
    setSplitPane((current) => {
      if (!current || !current.topicTabs.includes(topic)) return current;
      const result = closeTopicInSplitPane(current, topic, (nextTopic) => getTopicViewFor(current.serverId, nextTopic));
      if (!result.pane) {
        closedPane = true;
        return null;
      }
      if (result.nextTopic && result.nextView === "info" && result.closedActiveTopic) {
        nextLoadServerId = current.serverId;
        nextLoadTopic = result.nextTopic;
      }
      return result.pane;
    });
    if (closedPane) {
      setActiveWorkspacePane("primary");
      return;
    }
    if (nextLoadServerId && nextLoadTopic) {
      await loadSplitTopicDetailSilent(nextLoadServerId, nextLoadTopic);
    }
  }

  async function promoteSplitPaneToPrimary() {
    const pane = splitPane;
    if (!pane || pane.serverId !== selectedServerId) return false;
    const nextTopic = pane.topic || (pane.topicTabs[pane.topicTabs.length - 1] ?? "");
    if (!nextTopic) {
      setSplitPane(null);
      setActiveWorkspacePane("primary");
      return true;
    }
    const { nextView } = getSplitPanePromoteTarget(pane, getTopicViewFor);
    setSelectedServerId(pane.serverId);
    setOpenedTopicTabsByServer((current) => mergeSplitTopicTabsByServer(current, pane));
    setPreviewTopicByServer((current) => ({ ...current, [pane.serverId]: pane.previewTopic ?? "" }));
    setSelectedTopicByServer((current) => ({ ...current, [pane.serverId]: nextTopic }));
    setViewByServer((current) => ({ ...current, [pane.serverId]: nextView }));
    setTopicViewByServer((current) => mergeSplitTopicViewsByServer(current, pane, nextTopic, nextView, getTopicViewFor));
    setConsumeStatesByServer((current) => mergeTopicConsumeStates(current, pane.serverId, splitConsumeStatesByServer[pane.serverId] ?? {}));
    setSplitConsumeStatesByServer((current) => clearServerConsumeStates(current, pane.serverId));
    retargetSplitStreamingTopics(pane, isTopicStreaming, retargetLiveTopic);
    const nextDetail = await resolvePromotedTopicDetail({ kafkaApi, pane, nextTopic, nextView, getCachedTopicDetail });
    setTopicDetailForServer(pane.serverId, nextDetail);
    setSplitPane(null);
    setActiveWorkspacePane("primary");
    return true;
  }

  return {
    openSplitForTopic,
    moveSplitTopicToPrimary,
    closeSplitPane,
    closeSplitTopicTab,
    promoteSplitPaneToPrimary
  };
}
