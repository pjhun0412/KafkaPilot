import type { Dispatch, SetStateAction } from "react";
import type { TopicDetail } from "../../../shared/types";
import type { SplitPaneState, View, WorkspacePaneId } from "../../uiTypes";
import { getNextTopicAfterTabClose, removeTopicTab } from "../../workspaceState";

type PrimaryTopicTabActionsParams = {
  selectedServerId: string;
  selectedTopic: string;
  openedTopicTabs: string[];
  previewTopic: string;
  splitPane: SplitPaneState | null;
  isTopicStreaming: (serverId: string, topic: string, pane: WorkspacePaneId) => boolean;
  stopConsume: (serverId?: string, topic?: string, pane?: WorkspacePaneId) => Promise<void>;
  clearConsumeStateForPane: (serverId: string, topic: string, pane: WorkspacePaneId) => void;
  promoteSplitPaneToPrimary: () => Promise<boolean>;
  selectPrimaryTopic: (topic: string) => Promise<void>;
  setOpenedTopicTabs: (action: string[] | ((current: string[]) => string[])) => void;
  setPreviewTopicByServer: Dispatch<SetStateAction<Record<string, string>>>;
  setSelectedTopic: (topic: string) => void;
  setTopicDetail: (detail: TopicDetail | null) => void;
  setViewByServer: Dispatch<SetStateAction<Record<string, View>>>;
};

export function usePrimaryTopicTabActions({
  selectedServerId,
  selectedTopic,
  openedTopicTabs,
  previewTopic,
  splitPane,
  isTopicStreaming,
  stopConsume,
  clearConsumeStateForPane,
  promoteSplitPaneToPrimary,
  selectPrimaryTopic,
  setOpenedTopicTabs,
  setPreviewTopicByServer,
  setSelectedTopic,
  setTopicDetail,
  setViewByServer
}: PrimaryTopicTabActionsParams) {
  async function closeTopicTab(topic: string) {
    await stopConsume(selectedServerId, topic, "primary");
    const pinnedTabs = previewTopic ? openedTopicTabs.filter((item) => item !== previewTopic) : openedTopicTabs;
    const nextTabs = previewTopic === topic ? pinnedTabs : removeTopicTab(pinnedTabs, topic);
    const visibleNextTabs = previewTopic && previewTopic !== topic ? [...nextTabs, previewTopic] : nextTabs;
    setOpenedTopicTabs(nextTabs);
    if (previewTopic === topic) {
      setPreviewTopicByServer((current) => ({ ...current, [selectedServerId]: "" }));
    }
    clearConsumeStateForPane(selectedServerId, topic, "primary");
    if (visibleNextTabs.length === 0 && splitPane?.serverId === selectedServerId) {
      await promoteSplitPaneToPrimary();
      return;
    }
    if (selectedTopic !== topic) {
      return;
    }
    const nextTopic = getNextTopicAfterTabClose(selectedTopic, topic, visibleNextTabs);
    if (nextTopic) {
      await selectPrimaryTopic(nextTopic);
    } else {
      setSelectedTopic("");
      setTopicDetail(null);
      setViewByServer((current) => ({ ...current, [selectedServerId]: "topics" }));
    }
  }

  return { closeTopicTab };
}
