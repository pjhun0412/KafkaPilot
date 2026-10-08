import type { Dispatch, SetStateAction } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  ExportSettingsOptions,
  ImportSettingsResult,
  ImportSettingsOptions,
  KafkaApi
} from "../../../shared/types";
import type { ToastState } from "../../uiTypes";
import { useConsumeStateZustandStore } from "../../stores/domain/consumeStateStore";
import { useBrokerResourceStore } from "../../stores/domain/brokerResourceStore";
import { useConsumerGroupResourceStore } from "../../stores/domain/consumerGroupResourceStore";
import { useKafkaNavigationStore } from "../../stores/domain/kafkaNavigationStore";
import { useKafkaPreferenceStore } from "../../stores/domain/kafkaPreferenceStore";
import { useKafkaStreamingStore } from "../../stores/domain/kafkaStreamingStore";
import { useProduceDraftZustandStore } from "../../stores/domain/produceDraftStore";
import { useServerClusterStore } from "../../stores/domain/serverClusterStore";
import { useTopicResourceStore } from "../../stores/domain/topicResourceStore";
import { useLayoutStore } from "../../stores/ui/layoutStore";
import { useServerGroupsStore } from "../../stores/ui/serverGroupsStore";
import { useSearchStore } from "../../stores/ui/searchStore";
import { useSettingsTransferDialogStore } from "../../stores/ui/settingsTransferDialogStore";
import {
  applyImportedPreferences,
  resetWorkspaceAfterSettingsImport
} from "./settingsTransferUtils";

type SettingsTransferActionParams = {
  kafkaApi: KafkaApi | undefined;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setStatus: (status: string) => void;
  setToast: Dispatch<SetStateAction<ToastState>>;
};

export function useSettingsTransferActions({
  kafkaApi,
  setLoading,
  setStatus,
  setToast
}: SettingsTransferActionParams) {
  const serverResetSetters = useServerClusterStore(useShallow((state) => ({
    setServers: state.setServers,
    setConnectedServerIds: state.setConnectedServerIds,
    setFailedServerIds: state.setFailedServerIds,
    setOpenClusterIds: state.setOpenClusterIds,
    setSelectedServerId: state.setSelectedServerId
  })));
  const kafkaNavigationSetters = useKafkaNavigationStore(useShallow((state) => ({
    setSelectedTopicByServer: state.setSelectedTopicByServer,
    setOpenedTopicTabsByServer: state.setOpenedTopicTabsByServer,
    setViewByServer: state.setViewByServer,
    setTopicViewByServer: state.setTopicViewByServer
  })));
  const topicResourceSetters = useTopicResourceStore(useShallow((state) => ({
    setFavoriteTopicsByServer: state.setFavoriteTopicsByServer,
    setTopicsByServer: state.setTopicsByServer,
    setTopicGridSortingByServer: state.setTopicGridSortingByServer,
    setTopicDetailByServer: state.setTopicDetailByServer,
    setTopicDetailCacheByServer: state.setTopicDetailCacheByServer
  })));
  const kafkaPreferenceSetters = useKafkaPreferenceStore(useShallow((state) => ({
    setConsumeDefaults: state.setConsumeDefaults,
    setViewerPreferences: state.setViewerPreferences,
    setConsumeDefaultsByServer: state.setConsumeDefaultsByServer,
    setManualAvroSchemasByServer: state.setManualAvroSchemasByServer,
    setProduceTemplatesByServer: state.setProduceTemplatesByServer
  })));
  const brokerResourceSetters = useBrokerResourceStore(useShallow((state) => ({
    setBrokersByServer: state.setBrokersByServer,
  })));
  const consumerGroupResourceSetters = useConsumerGroupResourceStore(useShallow((state) => ({
    setGroupsByServer: state.setGroupsByServer,
    setSelectedGroupByServer: state.setSelectedGroupByServer,
    setGroupLagByServer: state.setGroupLagByServer
  })));
  const kafkaStreamingSetters = useKafkaStreamingStore(useShallow((state) => ({
    setStreamingTopicsByServer: state.setStreamingTopicsByServer
  })));
  const layoutPreferenceSetters = useLayoutStore(useShallow((state) => ({
    setSidebarWidth: state.setSidebarWidth,
    setServerPanelHeight: state.setServerPanelHeight,
    setMessagePaneHeight: state.setMessagePaneHeight,
    setFontFamily: state.setFontFamily,
    setFontSize: state.setFontSize,
    setFontWeight: state.setFontWeight,
    setExportFormatTemplate: state.setExportFormatTemplate,
    setKeyboardShortcuts: state.setKeyboardShortcuts,
    setLogRetentionDays: state.setLogRetentionDays,
    setLastSeenReleaseVersion: state.setLastSeenReleaseVersion
  })));
  const consumeResetSetters = useConsumeStateZustandStore(useShallow((state) => ({
    setConsumeStatesByServer: state.setConsumeStatesByServer,
    setSplitConsumeStatesByServer: state.setSplitConsumeStatesByServer
  })));
  const resetTopicSearchState = useSearchStore((state) => state.resetTopicSearchState);
  const resetProduceDrafts = useProduceDraftZustandStore((state) => state.resetProduceDrafts);

  function applyImportedSettings(result: ImportSettingsResult) {
    applyImportedPreferences(result.preferences, {
        setServerGroups: useServerGroupsStore.getState().setGroups,
      setFavoriteTopicsByServer: topicResourceSetters.setFavoriteTopicsByServer,
      setConsumeDefaults: kafkaPreferenceSetters.setConsumeDefaults,
      setViewerPreferences: kafkaPreferenceSetters.setViewerPreferences,
      setConsumeDefaultsByServer: kafkaPreferenceSetters.setConsumeDefaultsByServer,
      setManualAvroSchemasByServer: kafkaPreferenceSetters.setManualAvroSchemasByServer,
      setProduceTemplatesByServer: kafkaPreferenceSetters.setProduceTemplatesByServer,
      ...layoutPreferenceSetters
    });
    resetWorkspaceAfterSettingsImport(result, {
      ...serverResetSetters,
      setTopicsByServer: topicResourceSetters.setTopicsByServer,
      resetTopicSearchState,
      setSelectedTopicByServer: kafkaNavigationSetters.setSelectedTopicByServer,
      setOpenedTopicTabsByServer: kafkaNavigationSetters.setOpenedTopicTabsByServer,
      setTopicGridSortingByServer: topicResourceSetters.setTopicGridSortingByServer,
      setTopicDetailByServer: topicResourceSetters.setTopicDetailByServer,
      setTopicDetailCacheByServer: topicResourceSetters.setTopicDetailCacheByServer,
      setBrokersByServer: brokerResourceSetters.setBrokersByServer,
      setGroupsByServer: consumerGroupResourceSetters.setGroupsByServer,
      setViewByServer: kafkaNavigationSetters.setViewByServer,
      setTopicViewByServer: kafkaNavigationSetters.setTopicViewByServer,
      setSelectedGroupByServer: consumerGroupResourceSetters.setSelectedGroupByServer,
      setGroupLagByServer: consumerGroupResourceSetters.setGroupLagByServer,
      ...consumeResetSetters,
      resetProduceDrafts,
      setStreamingTopicsByServer: kafkaStreamingSetters.setStreamingTopicsByServer
    });
  }

  async function exportSettings() {
    if (!kafkaApi) return;
    const options = await useSettingsTransferDialogStore.getState().requestExportOptions();
    if (!options) return;
    setLoading(true);
    setToast({ message: "Exporting settings...", kind: "loading" });
    try {
      const filePath = await kafkaApi.exportSettings(options);
      if (filePath) {
        setStatus(`Settings exported: ${filePath}`);
        setToast({ message: "Settings exported.", kind: "success" });
      } else {
        setToast(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      setToast({ message, kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function importSettings() {
    if (!kafkaApi) return;
    const options = await useSettingsTransferDialogStore.getState().requestImportOptions();
    if (!options) return;
    setLoading(true);
    setToast({ message: "Importing settings...", kind: "loading" });
    try {
      const result = await kafkaApi.importSettings(options);
      if (!result) {
        setToast(null);
        return;
      }
      applyImportedSettings(result);
      setStatus("Settings imported.");
      setToast({ message: "Settings imported.", kind: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      setToast({ message, kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  return {
    applyImportedSettings,
    exportSettings,
    importSettings
  };
}
