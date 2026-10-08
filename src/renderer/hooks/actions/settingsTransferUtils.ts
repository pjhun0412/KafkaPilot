import type { Dispatch, SetStateAction } from "react";
import type { SortingState } from "@tanstack/react-table";
import type {
  AppPreferences,
  BrokerSummary,
  ConsumerGroupLagDetail,
  ConsumerGroupSummary,
  ImportSettingsResult,
  ManualAvroSchema,
  ServerProfile,
  TopicDetail,
  TopicSummary
} from "../../../shared/types";
import type { TopicConsumeState, TopicWorkView, View } from "../../uiTypes";
import type { ViewerPreferences } from "../../viewerPreferences";
import { pruneViewerPreferences } from "../../viewerPreferences";
import type { LanguagePreference } from "../../i18n";

export type ImportedPreferenceSetters = {
  setServerGroups: (groups: AppPreferences["serverGroups"]) => void;
  setFavoriteTopicsByServer: Dispatch<SetStateAction<Record<string, string[]>>>;
  setConsumeDefaults: Dispatch<SetStateAction<NonNullable<AppPreferences["consumeDefaults"]>>>;
  setViewerPreferences: Dispatch<SetStateAction<Required<ViewerPreferences>>>;
  setConsumeDefaultsByServer: Dispatch<SetStateAction<AppPreferences["consumeDefaultsByServer"]>>;
  setManualAvroSchemasByServer: Dispatch<SetStateAction<Record<string, Record<string, ManualAvroSchema>>>>;
  setProduceTemplatesByServer: Dispatch<SetStateAction<NonNullable<AppPreferences["produceTemplatesByServer"]>>>;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  setServerPanelHeight: Dispatch<SetStateAction<number>>;
  setMessagePaneHeight: Dispatch<SetStateAction<number>>;
  setFontFamily: Dispatch<SetStateAction<string>>;
  setFontSize: Dispatch<SetStateAction<number>>;
  setFontWeight: Dispatch<SetStateAction<number>>;
  setLanguage: Dispatch<SetStateAction<LanguagePreference>>;
  setExportFormatTemplate: Dispatch<SetStateAction<string>>;
  setKeyboardShortcuts: Dispatch<SetStateAction<NonNullable<AppPreferences["keyboardShortcuts"]>>>;
  setLogRetentionDays: Dispatch<SetStateAction<number>>;
  setLastSeenReleaseVersion: Dispatch<SetStateAction<string>>;
};

export type WorkspaceResetSetters = {
  setServers: Dispatch<SetStateAction<ServerProfile[]>>;
  setConnectedServerIds: Dispatch<SetStateAction<string[]>>;
  setFailedServerIds: Dispatch<SetStateAction<string[]>>;
  setOpenClusterIds: Dispatch<SetStateAction<string[]>>;
  setSelectedServerId: Dispatch<SetStateAction<string>>;
  setTopicsByServer: Dispatch<SetStateAction<Record<string, TopicSummary[]>>>;
  resetTopicSearchState: () => void;
  setSelectedTopicByServer: Dispatch<SetStateAction<Record<string, string>>>;
  setOpenedTopicTabsByServer: Dispatch<SetStateAction<Record<string, string[]>>>;
  setTopicGridSortingByServer: Dispatch<SetStateAction<Record<string, SortingState>>>;
  setTopicDetailByServer: Dispatch<SetStateAction<Record<string, TopicDetail | null>>>;
  setTopicDetailCacheByServer: Dispatch<SetStateAction<Record<string, Record<string, TopicDetail>>>>;
  setBrokersByServer: Dispatch<SetStateAction<Record<string, BrokerSummary[]>>>;
  setGroupsByServer: Dispatch<SetStateAction<Record<string, ConsumerGroupSummary[]>>>;
  setViewByServer: Dispatch<SetStateAction<Record<string, View>>>;
  setTopicViewByServer: Dispatch<SetStateAction<Record<string, Record<string, TopicWorkView>>>>;
  setSelectedGroupByServer: Dispatch<SetStateAction<Record<string, string>>>;
  setGroupLagByServer: Dispatch<SetStateAction<Record<string, Record<string, ConsumerGroupLagDetail>>>>;
  setConsumeStatesByServer: Dispatch<SetStateAction<Record<string, Record<string, TopicConsumeState>>>>;
  setSplitConsumeStatesByServer: Dispatch<SetStateAction<Record<string, Record<string, TopicConsumeState>>>>;
  resetProduceDrafts: () => void;
  setStreamingTopicsByServer: Dispatch<SetStateAction<Record<string, string[]>>>;
};

export function applyImportedPreferences(preferences: AppPreferences, setters: ImportedPreferenceSetters) {
  setters.setServerGroups(preferences.serverGroups);
  setters.setFavoriteTopicsByServer(preferences.favoriteTopicsByServer ?? {});
  setters.setConsumeDefaults(preferences.consumeDefaults ?? {});
  setters.setViewerPreferences(pruneViewerPreferences(preferences.viewerPreferences));
  setters.setConsumeDefaultsByServer(preferences.consumeDefaultsByServer ?? {});
  setters.setManualAvroSchemasByServer(preferences.manualAvroSchemasByServer ?? {});
  setters.setProduceTemplatesByServer(preferences.produceTemplatesByServer ?? {});
  if (typeof preferences.layout?.sidebarWidth === "number") setters.setSidebarWidth(preferences.layout.sidebarWidth);
  if (typeof preferences.layout?.sidebarCollapsed === "boolean") setters.setSidebarCollapsed(preferences.layout.sidebarCollapsed);
  if (typeof preferences.layout?.serverPanelHeight === "number") setters.setServerPanelHeight(preferences.layout.serverPanelHeight);
  if (typeof preferences.layout?.messagePaneHeight === "number") setters.setMessagePaneHeight(preferences.layout.messagePaneHeight);
  if (typeof preferences.appearance?.fontFamily === "string") setters.setFontFamily(preferences.appearance.fontFamily);
  if (typeof preferences.appearance?.fontSize === "number") setters.setFontSize(preferences.appearance.fontSize);
  if (typeof preferences.appearance?.fontWeight === "number") setters.setFontWeight(preferences.appearance.fontWeight);
  const language = preferences.appearance?.language;
  if (language === "auto" || language === "ko" || language === "en") setters.setLanguage(language);
  if (typeof preferences.exportFormatTemplate === "string") setters.setExportFormatTemplate(preferences.exportFormatTemplate);
  setters.setKeyboardShortcuts(preferences.keyboardShortcuts ?? {});
  if (typeof preferences.diagnostics?.logRetentionDays === "number") setters.setLogRetentionDays(preferences.diagnostics.logRetentionDays);
  setters.setLastSeenReleaseVersion(preferences.releaseNotes?.lastSeenVersion ?? "");
}

export function resetWorkspaceAfterSettingsImport(result: ImportSettingsResult, setters: WorkspaceResetSetters) {
  setters.setServers(result.servers);
  setters.setConnectedServerIds([]);
  setters.setFailedServerIds([]);
  setters.setOpenClusterIds([]);
  setters.setSelectedServerId(result.servers[0]?.id ?? "");
  setters.setTopicsByServer({});
  setters.resetTopicSearchState();
  setters.setSelectedTopicByServer({});
  setters.setOpenedTopicTabsByServer({});
  setters.setTopicGridSortingByServer({});
  setters.setTopicDetailByServer({});
  setters.setTopicDetailCacheByServer({});
  setters.setBrokersByServer({});
  setters.setGroupsByServer({});
  setters.setViewByServer({});
  setters.setTopicViewByServer({});
  setters.setSelectedGroupByServer({});
  setters.setGroupLagByServer({});
  setters.setConsumeStatesByServer({});
  setters.setSplitConsumeStatesByServer({});
  setters.resetProduceDrafts();
  setters.setStreamingTopicsByServer({});
}
