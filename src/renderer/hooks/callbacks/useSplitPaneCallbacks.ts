import { useMemo } from "react";
import type React from "react";
import type { ConsumedMessage, ConsumerGroupOffsetResetRequest, MessageExportFormat, MessageExportPayloadOptions } from "../../../shared/types";
import type { ProduceDraftOverride } from "../actions/useProduceActions";
import type { ReplayPayloadOptions } from "../../replayTypes";
import type { OffsetOrder, SplitPaneState, TopicConsumeState, TopicWorkView, View, WorkspaceActionTarget, WorkspacePaneId } from "../../uiTypes";
import { createSplitConsumeCallbacks, createSplitProduceCallbacks } from "./splitPaneCallbackGroups";

export type ProduceDraftPatch = { key?: string; headers?: string; value?: string };

export type SplitPaneCallbacksParams = {
  pane: SplitPaneState | null;
  consumeState: TopicConsumeState;
  selectedGroupId: string;
  setActiveWorkspacePane: (pane: WorkspacePaneId) => void;
  closeSplitPane: () => Promise<void>;
  startSplitPaneDrag: (event: React.DragEvent) => void;
  clearDragPayload: () => void;
  showSplitView: (view: View) => void;
  activateSplitTopic: (topic: string, view?: TopicWorkView, options?: { addToTabs?: boolean; preservePreview?: boolean; silent?: boolean }) => Promise<void>;
  openTopicInWorkspace: (target: WorkspaceActionTarget, topic: string, view?: TopicWorkView) => Promise<void>;
  closeSplitTopicTab: (topic: string) => Promise<void>;
  startTopicDrag: (event: React.DragEvent, serverId: string, topic: string, source: WorkspacePaneId) => void;
  refreshSplitPaneView: (pane: SplitPaneState, state: TopicConsumeState) => Promise<void>;
  openManualAvroSchema: (serverId: string, topic: string) => void;
  toggleTopicRow: (topic: string) => void;
  toggleAllTopicRows: (topics: string[]) => void;
  copySelectedTopicNames: (topics?: string[]) => Promise<void>;
  openTopicCreateForm: (serverId: string) => void;
  requestTopicAction: (kind: "delete" | "purge", topics?: string[]) => void;
  toggleFavoriteTopic: (topic: string) => void;
  loadConsumerGroupLagFor: (serverId: string, groupId: string, target?: WorkspaceActionTarget) => Promise<void>;
  deleteConsumerGroupsFor: (serverId: string, groupIds: string[], target?: WorkspaceActionTarget) => Promise<void>;
  ensureServerConnected: (serverId: string, options?: { activate?: boolean; openTab?: boolean }) => Promise<boolean>;
  resetConsumerGroupOffsetsFor: (request: ConsumerGroupOffsetResetRequest, target?: WorkspaceActionTarget) => Promise<void>;
  setSelectedGroupByServer: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  refreshGroupsForServer: (serverId: string, target?: WorkspaceActionTarget) => Promise<void>;
  updateConsumeStateFor: (serverId: string, topic: string, patch: Partial<TopicConsumeState>, pane?: WorkspacePaneId) => void;
  moveOffsetPageFor: (serverId: string, topic: string, state: TopicConsumeState, direction: "prev" | "next", pane: WorkspacePaneId) => Promise<void>;
  startConsumeFor: (serverId: string, topic: string, state: TopicConsumeState, pane: WorkspacePaneId) => Promise<void>;
  stopConsume: (serverId?: string, topic?: string, pane?: WorkspacePaneId) => Promise<void>;
  sendMessageToProduce: (serverId: string, topic: string, message: ConsumedMessage, pane?: WorkspacePaneId, options?: { navigate?: boolean; payload?: ReplayPayloadOptions }) => void;
  exportConsumedMessages: (format: MessageExportFormat, messages: ConsumedMessage[], topic: string, pane?: WorkspacePaneId, serverId?: string, payloadOptions?: MessageExportPayloadOptions) => Promise<void>;
  exportOffsetConditionMessages: (format: MessageExportFormat, serverId: string, topic: string, state: TopicConsumeState, pane?: WorkspacePaneId) => Promise<void>;
  updateProduceDraftFor: (serverId: string, topic: string, patch: ProduceDraftPatch) => void;
  produceFor: (serverId: string, topic: string, pane?: WorkspacePaneId, draftOverride?: ProduceDraftOverride) => Promise<void>;
};

export function useSplitPaneCallbacks({
  pane,
  consumeState,
  selectedGroupId,
  setActiveWorkspacePane,
  closeSplitPane,
  startSplitPaneDrag,
  clearDragPayload,
  showSplitView,
  activateSplitTopic,
  openTopicInWorkspace,
  closeSplitTopicTab,
  startTopicDrag,
  refreshSplitPaneView,
  openManualAvroSchema,
  toggleTopicRow,
  toggleAllTopicRows,
  copySelectedTopicNames,
  openTopicCreateForm,
  requestTopicAction,
  toggleFavoriteTopic,
  loadConsumerGroupLagFor,
  deleteConsumerGroupsFor,
  ensureServerConnected,
  resetConsumerGroupOffsetsFor,
  setSelectedGroupByServer,
  refreshGroupsForServer,
  updateConsumeStateFor,
  moveOffsetPageFor,
  startConsumeFor,
  stopConsume,
  sendMessageToProduce,
  exportConsumedMessages,
  exportOffsetConditionMessages,
  updateProduceDraftFor,
  produceFor
}: SplitPaneCallbacksParams) {
  return useMemo(() => {
    const target: WorkspaceActionTarget | undefined = pane
      ? { pane: "split", serverId: pane.serverId, topic: pane.topic }
      : undefined;

    return {
    close: () => void closeSplitPane(),
    activate: () => setActiveWorkspacePane("split"),
    dragStart: startSplitPaneDrag,
    dragEnd: clearDragPayload,
    view: showSplitView,
    selectTopic: (topic: string) => {
      setActiveWorkspacePane("split");
      void activateSplitTopic(topic, undefined, { preservePreview: true, silent: true });
    },
    openTopic: (topic: string) => {
      setActiveWorkspacePane("split");
      void activateSplitTopic(topic);
    },
    closeTopic: (topic: string) => void closeSplitTopicTab(topic),
    topicDragStart: (event: React.DragEvent, topic: string) => {
      if (pane) startTopicDrag(event, pane.serverId, topic, "split");
    },
    topicDragEnd: clearDragPayload,
    refresh: () => {
      if (pane) void refreshSplitPaneView(pane, consumeState);
    },
    openSchema: () => {
      if (pane) openManualAvroSchema(pane.serverId, pane.topic);
    },
    toggleTopicSelected: toggleTopicRow,
    toggleAllTopicsSelected: toggleAllTopicRows,
    copySelectedTopics: () => void copySelectedTopicNames(),
    createTopic: () => {
      if (pane) openTopicCreateForm(pane.serverId);
    },
    clearTopicMessages: () => {
      if (pane?.topic) requestTopicAction("purge", [pane.topic]);
    },
    purgeSelectedTopics: () => requestTopicAction("purge"),
    deleteSelectedTopics: () => requestTopicAction("delete"),
    toggleTopicFavorite: toggleFavoriteTopic,
    selectGroup: (groupId: string) => {
      if (pane) void loadConsumerGroupLagFor(pane.serverId, groupId, target);
    },
    connectReplayServer: (serverId: string) => ensureServerConnected(serverId, { activate: false, openTab: false }),
    deleteConsumerGroups: (groupIds: string[]) => {
      if (pane) void deleteConsumerGroupsFor(pane.serverId, groupIds, target);
    },
    resetConsumerGroupOffsets: (request: ConsumerGroupOffsetResetRequest) => {
      if (pane) return resetConsumerGroupOffsetsFor(request, target);
      return Promise.reject(new Error("Split pane is not available."));
    },
    backGroup: () => {
      if (pane) setSelectedGroupByServer((current) => ({ ...current, [pane.serverId]: "" }));
    },
    refreshGroups: () => {
      if (pane) void refreshGroupsForServer(pane.serverId, target);
    },
    refreshGroupDetail: () => {
      if (pane && selectedGroupId) void loadConsumerGroupLagFor(pane.serverId, selectedGroupId, target);
    },
    ...createSplitConsumeCallbacks({
      pane,
      consumeState,
      activateSplitTopic,
      updateConsumeStateFor,
      moveOffsetPageFor,
      startConsumeFor,
      stopConsume,
      sendMessageToProduce,
      produceFor,
      openTopicInWorkspace,
      exportConsumedMessages,
      exportOffsetConditionMessages
    }),
    ...createSplitProduceCallbacks({
      pane,
      updateProduceDraftFor,
      produceFor
    })
  };
  }, [
    activateSplitTopic,
    clearDragPayload,
    closeSplitPane,
    closeSplitTopicTab,
    consumeState,
    copySelectedTopicNames,
    deleteConsumerGroupsFor,
    exportConsumedMessages,
    exportOffsetConditionMessages,
    ensureServerConnected,
    loadConsumerGroupLagFor,
    moveOffsetPageFor,
    openTopicCreateForm,
    openManualAvroSchema,
    openTopicInWorkspace,
    pane,
    produceFor,
    refreshGroupsForServer,
    refreshSplitPaneView,
    resetConsumerGroupOffsetsFor,
    requestTopicAction,
    selectedGroupId,
    sendMessageToProduce,
    setActiveWorkspacePane,
    setSelectedGroupByServer,
    showSplitView,
    startConsumeFor,
    startSplitPaneDrag,
    startTopicDrag,
    stopConsume,
    toggleAllTopicRows,
    toggleFavoriteTopic,
    toggleTopicRow,
    updateConsumeStateFor,
    updateProduceDraftFor
  ]);
}
