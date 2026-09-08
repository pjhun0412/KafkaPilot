import { useConsumeRefreshActions } from "../actions/useConsumeRefreshActions";
import { useManualAvroSchemaComposition } from "../actions/useManualAvroSchemaComposition";
import { usePrimaryTopicTabAppActions } from "../actions/usePrimaryTopicTabAppActions";
import { useQuickSearchAppActions } from "../actions/useQuickSearchAppActions";

type QuickSearchActionsParams = Parameters<typeof useQuickSearchAppActions>[0];
type ManualAvroSchemaParams = Parameters<typeof useManualAvroSchemaComposition>[0];
type ConsumeRefreshActionsParams = Parameters<typeof useConsumeRefreshActions>[0];
type PrimaryTopicTabActionsParams = Parameters<typeof usePrimaryTopicTabAppActions>[0];

export type WorkspaceControllerInteractionsParams = {
  consume: ConsumeRefreshActionsParams["selectedConsume"] & ConsumeRefreshActionsParams["workspaceRefresh"];
  manualAvro: ManualAvroSchemaParams;
  quickSearch: QuickSearchActionsParams["actions"] & Omit<QuickSearchActionsParams["shortcuts"], "closeActiveTopicTab"> & {
    closeSplitTopicTab: (topic: string) => Promise<void>;
  };
  topicTabs: PrimaryTopicTabActionsParams;
};

export function useWorkspaceControllerInteractions({
  consume,
  manualAvro,
  quickSearch,
  topicTabs
}: WorkspaceControllerInteractionsParams) {
  const { closeTopicTab } = usePrimaryTopicTabAppActions(topicTabs);
  async function closeActiveTopicTab() {
    if (quickSearch.activeWorkspacePane === "split" && quickSearch.splitPaneOpen && quickSearch.splitPaneTopic) {
      await quickSearch.closeSplitTopicTab(quickSearch.splitPaneTopic);
      return;
    }
    if (quickSearch.selectedTopic) {
      await closeTopicTab(quickSearch.selectedTopic);
    }
  }

  const { executeQuickSearch } = useQuickSearchAppActions({
    actions: {
      quickSearchResults: quickSearch.quickSearchResults,
      quickSearchIndex: quickSearch.quickSearchIndex,
      selectedServerId: quickSearch.selectedServerId,
      selectedTopic: quickSearch.selectedTopic,
      groupsByServer: quickSearch.groupsByServer,
      ensureServerConnected: quickSearch.ensureServerConnected,
      getWorkspaceTargetForServer: quickSearch.getWorkspaceTargetForServer,
      openTopicInWorkspace: quickSearch.openTopicInWorkspace,
      openManualAvroSchema: quickSearch.openManualAvroSchema,
      openPreferences: quickSearch.openPreferences,
      refreshTopics: quickSearch.refreshTopics,
      refreshGroups: quickSearch.refreshGroups,
      refreshGroupsForServer: quickSearch.refreshGroupsForServer,
      loadConsumerGroupLagFor: quickSearch.loadConsumerGroupLagFor,
      requestTopicAction: quickSearch.requestTopicAction,
      requestTopicActionFor: quickSearch.requestTopicActionFor,
      rememberQuickSearch: quickSearch.rememberQuickSearch,
      closeQuickSearch: quickSearch.closeQuickSearch,
      setSelectedServerId: quickSearch.setSelectedServerId,
      setView: quickSearch.setView,
      setViewByServer: quickSearch.setViewByServer
    },
    shortcuts: {
      isQuickSearchOpen: quickSearch.isQuickSearchOpen,
      quickSearchResultCount: quickSearch.quickSearchResultCount,
      selectedServerId: quickSearch.selectedServerId,
      selectedTopic: quickSearch.selectedTopic,
      activeWorkspacePane: quickSearch.activeWorkspacePane,
      splitPaneTopic: quickSearch.splitPaneTopic,
      splitPaneOpen: quickSearch.splitPaneOpen,
      keyboardShortcuts: quickSearch.keyboardShortcuts,
      openQuickSearch: quickSearch.openQuickSearch,
      closeQuickSearch: quickSearch.closeQuickSearch,
      closeActiveTopicTab,
      closeSplitPane: quickSearch.closeSplitPane,
      openSplitForTopic: quickSearch.openSplitForTopic,
      moveSplitTopicToPrimary: quickSearch.moveSplitTopicToPrimary,
      openPreferences: quickSearch.openPreferences,
      setActiveWorkspacePane: quickSearch.setActiveWorkspacePane,
      setSidebarCollapsed: quickSearch.setSidebarCollapsed,
      setQuickSearchIndex: quickSearch.setQuickSearchIndex
    }
  });
  const { manualAvroTopicNames, manualAvroSchemaRows } = useManualAvroSchemaComposition(manualAvro);
  const { selectedConsumeActions, refreshActions } = useConsumeRefreshActions({
    selectedConsume: {
      selectedServerId: consume.selectedServerId,
      selectedTopic: consume.selectedTopic,
      selectedDefaultConsumeState: consume.selectedDefaultConsumeState,
      setConsumeStates: consume.setConsumeStates,
      rememberViewerPreference: consume.rememberViewerPreference,
      setConsumeDefaultsByServer: consume.setConsumeDefaultsByServer
    },
    workspaceRefresh: {
      activeWorkspacePane: consume.activeWorkspacePane,
      selectedServerId: consume.selectedServerId,
      selectedTopic: consume.selectedTopic,
      view: consume.view,
      visibleSplitPane: consume.visibleSplitPane,
      selectedConsumeState: consume.selectedConsumeState,
      splitConsumeState: consume.splitConsumeState,
      selectedDefaultConsumeState: consume.selectedDefaultConsumeState,
      refreshBrokers: consume.refreshBrokers,
      refreshBrokersForServer: consume.refreshBrokersForServer,
      refreshTopics: consume.refreshTopics,
      refreshTopicsForServer: consume.refreshTopicsForServer,
      refreshGroups: consume.refreshGroups,
      refreshGroupsForServer: consume.refreshGroupsForServer,
      loadTopicDetail: consume.loadTopicDetail,
      loadTopicDetailSilent: consume.loadTopicDetailSilent,
      loadSplitTopicDetailSilent: consume.loadSplitTopicDetailSilent,
      isTopicStreaming: consume.isTopicStreaming,
      stopConsume: consume.stopConsume,
      getDefaultConsumeState: consume.getDefaultConsumeState,
      updateConsumeStateFor: consume.updateConsumeStateFor,
      updateProduceDraftFor: consume.updateProduceDraftFor,
      runPaneTask: consume.runPaneTask,
      showPaneToast: consume.showPaneToast,
      setGroups: consume.setGroups,
      setSelectedGroupByServer: consume.setSelectedGroupByServer,
      setGroupLagByServer: consume.setGroupLagByServer,
      setStatus: consume.setStatus
    }
  });
  return {
    closeTopicTab,
    executeQuickSearch,
    manualAvroSchemaRows,
    manualAvroTopicNames,
    refreshActions,
    selectedConsumeActions
  };
}
