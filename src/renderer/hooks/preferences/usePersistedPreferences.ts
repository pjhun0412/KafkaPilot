import { useEffect } from "react";
import type { AppPreferences, KafkaApi, ManualAvroSchema, ProduceTemplatePreference } from "../../../shared/types";
import { INTER_FONT_FAMILY, LEGACY_DEFAULT_FONT_FAMILY, LEGACY_INTER_FONT_FAMILY } from "../../fontConfig";
import { normalizeLanguagePreference, type LanguagePreference } from "../../i18n";
import { useReleaseNotesStore } from "../../stores/ui/releaseNotesStore";
import { useServerGroupsStore } from "../../stores/ui/serverGroupsStore";
import { pruneViewerPreferences, type ViewerPreferences } from "../../viewerPreferences";

type PersistedPreferenceParams = {
  kafkaApi: KafkaApi | undefined;
  setStatus: (status: string) => void;
  favoriteTopicsByServer: Record<string, string[]>;
  setFavoriteTopicsByServer: (value: Record<string, string[]>) => void;
  consumeDefaults: NonNullable<AppPreferences["consumeDefaults"]>;
  setConsumeDefaults: (value: NonNullable<AppPreferences["consumeDefaults"]>) => void;
  viewerPreferences: Required<ViewerPreferences>;
  setViewerPreferences: (value: Required<ViewerPreferences>) => void;
  consumeDefaultsByServer: AppPreferences["consumeDefaultsByServer"];
  setConsumeDefaultsByServer: (value: AppPreferences["consumeDefaultsByServer"]) => void;
  manualAvroSchemasByServer: Record<string, Record<string, ManualAvroSchema>>;
  setManualAvroSchemasByServer: (value: Record<string, Record<string, ManualAvroSchema>>) => void;
  produceTemplatesByServer: Record<string, Record<string, ProduceTemplatePreference[]>>;
  setProduceTemplatesByServer: (value: Record<string, Record<string, ProduceTemplatePreference[]>>) => void;
  preferencesLoaded: boolean;
  setPreferencesLoaded: (loaded: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  serverPanelHeight: number;
  setServerPanelHeight: (height: number) => void;
  messagePaneHeight: number;
  setMessagePaneHeight: (height: number) => void;
  fontFamily: string;
  setFontFamily: (fontFamily: string) => void;
  fontSize: number;
  setFontSize: (fontSize: number) => void;
  fontWeight: number;
  setFontWeight: (fontWeight: number) => void;
  language: LanguagePreference;
  setLanguage: (language: LanguagePreference) => void;
  exportFormatTemplate: string;
  setExportFormatTemplate: (template: string) => void;
  keyboardShortcuts: NonNullable<AppPreferences["keyboardShortcuts"]>;
  setKeyboardShortcuts: (shortcuts: NonNullable<AppPreferences["keyboardShortcuts"]>) => void;
  logRetentionDays: number;
  setLogRetentionDays: (days: number) => void;
  appVersion: string;
  setAppVersion: (version: string) => void;
  lastSeenReleaseVersion: string;
  setLastSeenReleaseVersion: (version: string) => void;
};

function normalizeStoredFontFamily(fontFamily: string) {
  return fontFamily === LEGACY_DEFAULT_FONT_FAMILY || fontFamily === LEGACY_INTER_FONT_FAMILY
    ? INTER_FONT_FAMILY
    : fontFamily;
}

export function usePersistedPreferences({
  kafkaApi,
  setStatus,
  favoriteTopicsByServer,
  setFavoriteTopicsByServer,
  consumeDefaults,
  setConsumeDefaults,
  viewerPreferences,
  setViewerPreferences,
  consumeDefaultsByServer,
  setConsumeDefaultsByServer,
  manualAvroSchemasByServer,
  setManualAvroSchemasByServer,
  produceTemplatesByServer,
  setProduceTemplatesByServer,
  preferencesLoaded,
  setPreferencesLoaded,
  sidebarWidth,
  setSidebarWidth,
  sidebarCollapsed,
  setSidebarCollapsed,
  serverPanelHeight,
  setServerPanelHeight,
  messagePaneHeight,
  setMessagePaneHeight,
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  fontWeight,
  setFontWeight,
  language,
  setLanguage,
  exportFormatTemplate,
  setExportFormatTemplate,
  keyboardShortcuts,
  setKeyboardShortcuts,
  logRetentionDays,
  setLogRetentionDays,
  appVersion,
  setAppVersion,
  lastSeenReleaseVersion,
  setLastSeenReleaseVersion
}: PersistedPreferenceParams) {
  const openReleaseNotes = useReleaseNotesStore((state) => state.openReleaseNotes);
  const serverGroups = useServerGroupsStore((state) => state.groups);
  const setServerGroups = useServerGroupsStore((state) => state.setGroups);

  useEffect(() => {
    if (!kafkaApi) {
      return;
    }
    void Promise.all([kafkaApi.loadPreferences(), kafkaApi.getAppVersion()]).then(([preferences, version]) => {
      setAppVersion(version);
      setFavoriteTopicsByServer(preferences.favoriteTopicsByServer ?? {});
      setServerGroups(preferences.serverGroups);
      setConsumeDefaults(preferences.consumeDefaults ?? {});
      setViewerPreferences(pruneViewerPreferences(preferences.viewerPreferences));
      setConsumeDefaultsByServer(preferences.consumeDefaultsByServer ?? {});
      setManualAvroSchemasByServer(preferences.manualAvroSchemasByServer ?? {});
      setProduceTemplatesByServer(preferences.produceTemplatesByServer ?? {});
      if (typeof preferences.layout?.sidebarWidth === "number") {
        setSidebarWidth(preferences.layout.sidebarWidth);
      }
      if (typeof preferences.layout?.sidebarCollapsed === "boolean") {
        setSidebarCollapsed(preferences.layout.sidebarCollapsed);
      }
      if (typeof preferences.layout?.serverPanelHeight === "number") {
        setServerPanelHeight(preferences.layout.serverPanelHeight);
      }
      if (typeof preferences.layout?.messagePaneHeight === "number") {
        setMessagePaneHeight(preferences.layout.messagePaneHeight);
      }
      if (typeof preferences.appearance?.fontFamily === "string") {
        setFontFamily(normalizeStoredFontFamily(preferences.appearance.fontFamily));
      }
      if (typeof preferences.appearance?.fontSize === "number") {
        setFontSize(preferences.appearance.fontSize);
      }
      if (typeof preferences.appearance?.fontWeight === "number") {
        setFontWeight(preferences.appearance.fontWeight);
      }
      setLanguage(normalizeLanguagePreference(preferences.appearance?.language));
      if (typeof preferences.exportFormatTemplate === "string") {
        setExportFormatTemplate(preferences.exportFormatTemplate);
      }
      setKeyboardShortcuts(preferences.keyboardShortcuts ?? {});
      if (typeof preferences.diagnostics?.logRetentionDays === "number") {
        setLogRetentionDays(preferences.diagnostics.logRetentionDays);
      }
      const seenVersion = preferences.releaseNotes?.lastSeenVersion ?? "";
      setLastSeenReleaseVersion(seenVersion);
      if (version && seenVersion !== version) {
        openReleaseNotes(version);
      }
      setPreferencesLoaded(true);
    }).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
      setPreferencesLoaded(true);
    });
  }, [
    kafkaApi,
    setConsumeDefaults,
    setViewerPreferences,
    setConsumeDefaultsByServer,
    setExportFormatTemplate,
    setFavoriteTopicsByServer,
    setServerGroups,
    setFontFamily,
    setFontSize,
    setFontWeight,
    setAppVersion,
    setLanguage,
    setKeyboardShortcuts,
    setLogRetentionDays,
    setProduceTemplatesByServer,
    setLastSeenReleaseVersion,
    setManualAvroSchemasByServer,
    setMessagePaneHeight,
    setPreferencesLoaded,
    setServerPanelHeight,
    setSidebarCollapsed,
    setSidebarWidth,
    setStatus,
    openReleaseNotes
  ]);

  useEffect(() => {
    if (!kafkaApi || !preferencesLoaded) {
      return;
    }
    void kafkaApi.savePreferences({
      favoriteTopicsByServer,
      serverGroups,
      consumeDefaults,
      viewerPreferences: pruneViewerPreferences(viewerPreferences),
      consumeDefaultsByServer,
      manualAvroSchemasByServer,
      produceTemplatesByServer,
      layout: {
        sidebarWidth,
        sidebarCollapsed,
        serverPanelHeight,
        messagePaneHeight
      },
      appearance: {
        fontFamily,
        fontSize,
        fontWeight,
        language
      },
      keyboardShortcuts,
      diagnostics: {
        logRetentionDays
      },
      releaseNotes: {
        lastSeenVersion: lastSeenReleaseVersion
      },
      exportFormatTemplate
    }).catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, [
    kafkaApi,
    preferencesLoaded,
    favoriteTopicsByServer,
    serverGroups,
    consumeDefaults,
    viewerPreferences,
    consumeDefaultsByServer,
    manualAvroSchemasByServer,
    produceTemplatesByServer,
    sidebarWidth,
    sidebarCollapsed,
    serverPanelHeight,
    messagePaneHeight,
    fontFamily,
    fontSize,
    fontWeight,
    language,
    keyboardShortcuts,
    logRetentionDays,
    lastSeenReleaseVersion,
    exportFormatTemplate,
    setStatus
  ]);
}
