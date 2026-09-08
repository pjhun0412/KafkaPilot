import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import type { ProduceTemplatePreference } from "../../../../../shared/types";
import type { WorkspaceControllerPanesParams } from "../workspaceControllerPaneTypes";

export function createPrimaryPaneComposition(params: WorkspaceControllerPanesParams) {
  const {
    activeWorkspacePane,
    activeWorkspaceView,
    isSelectedServerConnected,
    language,
    messagePaneHeight,
    openClusterIds,
    selectedServer,
    selectedServerId,
    selectedTopic,
    setSelectedServerId,
    sidebarCollapsed,
    view,
    visibleSplitPane
  } = params.context;
  const {
    connectedServerIds,
    failedServerIds,
    favoriteTopicNames,
    groupLagByServer,
    loading,
    manualAvroSchemasByServer,
    manualAvroTopicNames,
    openedTopicTabs,
    previewTopic,
    produceTemplatesByServer,
    selectedTopicRows,
    servers,
    setProduceTemplatesByServer,
    sortedTopics,
    topicDetail,
    topicsByServer,
    topicGridSortingByServer,
    updateTopicGridSortingForServer
  } = params.resources;
  const {
    primaryModel,
    primaryPaneToast
  } = params.models;
  const {
    exportConsumedMessages,
    exportOffsetConditionMessages,
    isConsumeTaskActive,
    isTopicStreaming,
    moveOffsetPageFor,
    selectedConsumeState,
    sendMessageToProduce,
    startConsume,
    stopConsume,
    updateConsumeDefaults,
    updateSelectedConsumeState
  } = params.consume;
  const {
    produce,
    produceFor,
    selectedProduceDraft,
    updateProduceDraftFor
  } = params.produce;
  const {
    clearDragPayload,
    closeClusterTab,
    closeTopicTab,
    copySelectedTopicNames,
    deleteConsumerGroupsFor,
    ensureServerConnected,
    loadConsumerGroupLag,
    openManualAvroSchema,
    openTopicCreateForm,
    openTopicInWorkspace,
    openTopicTab,
    refreshActiveWorkspaceView,
    refreshCurrentView,
    refreshGroupsForServer,
    resetConsumerGroupOffsetsFor,
    requestTopicAction,
    selectTopicInWorkspace,
    setActiveWorkspacePane,
    setSelectedGroupByServer,
    setSidebarCollapsed,
    setView,
    showServerViewInActivePane,
    startTopicDrag,
    toggleAllTopicRows,
    toggleFavoriteTopic,
    toggleTopicRow
  } = params.callbacks;

  const replayTargets = servers.map((server) => ({
    id: server.id,
    name: server.name || server.id,
    connected: connectedServerIds.includes(server.id),
    topics: topicsByServer[server.id] ?? []
  }));

  return {
    primaryCallbacks: {
      selectedServerId,
      selectedTopic,
      selectedConsumeState,
      selectedGroupId: primaryModel.selectedGroupId,
      visibleSplitPane,
      setActiveWorkspacePane,
      setSidebarCollapsed,
      closeClusterTab,
      showServerViewInActivePane,
      refreshActiveWorkspaceView,
      selectTopicInWorkspace,
      openTopicInWorkspace,
      closeTopicTab,
      startTopicDrag,
      clearDragPayload,
      setView,
      openManualAvroSchema,
      refreshCurrentView,
      openTopicTab,
      toggleTopicRow,
      toggleAllTopicRows,
      copySelectedTopicNames,
      openTopicCreateForm,
      requestTopicAction,
      toggleFavoriteTopic,
      loadConsumerGroupLag,
      deleteConsumerGroupsFor,
      ensureServerConnected,
      resetConsumerGroupOffsetsFor,
      setSelectedGroupByServer,
      refreshGroupsForServer,
      updateSelectedConsumeState,
      updateConsumeDefaults,
      moveOffsetPageFor,
      startConsume,
      stopConsume,
      sendMessageToProduce,
      exportConsumedMessages,
      exportOffsetConditionMessages,
      updateProduceDraftFor,
      produce,
      produceFor
    },
    primaryPane: {
      server: selectedServer,
      sidebarCollapsed,
      openClusterIds,
      servers,
      selectedServerId,
      connectedServerIds,
      failedServerIds,
      activeWorkspaceView,
      loading,
      isSelectedServerConnected,
      active: activeWorkspacePane === "primary",
      topicTabs: openedTopicTabs,
      previewTopic,
      topicActivities: Object.fromEntries(
        openedTopicTabs.map((topic) => [
          topic,
          { live: isTopicStreaming(selectedServerId, topic, "primary") }
        ])
      ),
      selectedTopic,
      view,
      detail: topicDetail,
      topics: sortedTopics,
      replayTargets,
      brokers: primaryModel.brokers,
      groups: primaryModel.groups,
      favoriteTopicNames,
      selectedTopics: selectedTopicRows,
      topicSorting: topicGridSortingByServer[selectedServerId] ?? [],
      onTopicSortingChange: (updater: Parameters<OnChangeFn<SortingState>>[0]) =>
        updateTopicGridSortingForServer(selectedServerId, updater),
      selectedGroupId: primaryModel.selectedGroupId,
      selectedGroupLag: primaryModel.selectedGroupLag,
      groupDetailsById: groupLagByServer[selectedServerId] ?? {},
      consumeState: selectedConsumeState,
      isConsuming: isTopicStreaming(selectedServerId, selectedTopic, "primary"),
      isQuerying: isConsumeTaskActive("primary", selectedServerId, selectedTopic),
      messagePaneHeight: selectedConsumeState.messagePaneHeight ?? messagePaneHeight,
      manualAvroSchemas: manualAvroSchemasByServer[selectedServerId] ?? {},
      produceTemplates: produceTemplatesByServer[selectedServerId]?.[selectedTopic] ?? [],
      produceKey: selectedProduceDraft.key,
      produceHeaders: selectedProduceDraft.headers,
      produceValue: selectedProduceDraft.value,
      onProduceTemplates: (templates: ProduceTemplatePreference[]) => setProduceTemplatesByServer((current) => ({
        ...current,
        [selectedServerId]: {
          ...(current[selectedServerId] ?? {}),
          [selectedTopic]: templates
        }
      })),
      paneToast: primaryPaneToast,
      language,
      hasAvroSchema: (topic: string) => manualAvroTopicNames.has(topic),
      onSelectCluster: setSelectedServerId
    }
  };
}
