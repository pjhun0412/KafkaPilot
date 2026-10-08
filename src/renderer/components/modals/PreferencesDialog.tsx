import { X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppKeyboardShortcutPreferences, AppPreferences } from "../../../shared/types";
import type { ManualAvroSchemaRow } from "../../hooks/preferences/useManualAvroSchemaSummary";
import type { PreferenceGroup, PreferencePage, PreferenceSearchMatches } from "../../hooks/preferences/usePreferenceNavigation";
import { t, type AppLanguage, type LanguagePreference } from "../../i18n";
import type { KeyboardShortcutMap } from "../../keyboardShortcuts";
import { DEFAULT_FONT_FAMILY } from "../../stores/ui/layoutStore";
import { AvroSchemasPreferences } from "./preferences/AvroSchemasPreferences";
import { DiagnosticsPreferences } from "./preferences/DiagnosticsPreferences";
import { EditorFontPreferences } from "./preferences/EditorFontPreferences";
import { ExportLogPreferences } from "./preferences/ExportLogPreferences";
import { KeyboardShortcutsPreferences } from "./preferences/KeyboardShortcutsPreferences";
import { LanguagePreferences } from "./preferences/LanguagePreferences";
import { PreferencesNav } from "./preferences/PreferencesNav";
import { ViewerDefaultsPreferences } from "./preferences/ViewerDefaultsPreferences";

type PreferencesDialogProps = {
  activePage: PreferencePage;
  collapsedGroups: Record<PreferenceGroup, boolean>;
  query: string;
  normalizedQuery: string;
  matches: PreferenceSearchMatches;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  language: LanguagePreference;
  resolvedLanguage: AppLanguage;
  exportFormatTemplate: string;
  consumeDefaults: NonNullable<AppPreferences["consumeDefaults"]>;
  viewerPreferenceRetentionDays: number;
  viewerFontSize: number;
  viewerFontWeight: number;
  keyboardShortcuts: KeyboardShortcutMap;
  logRetentionDays: number;
  manualAvroSchemaRows: ManualAvroSchemaRow[];
  onActivePage: (page: PreferencePage) => void;
  onToggleGroup: (group: PreferenceGroup) => void;
  onQuery: (query: string) => void;
  onFontFamily: (fontFamily: string) => void;
  onFontSize: (fontSize: number) => void;
  onFontWeight: (fontWeight: number) => void;
  onLanguage: (language: LanguagePreference) => void;
  onExportFormatTemplate: Dispatch<SetStateAction<string>>;
  onConsumeDefaults: (defaults: NonNullable<AppPreferences["consumeDefaults"]>) => void;
  onViewerPreferenceRetentionDays: (days: number) => void;
  onViewerFontSize: (fontSize: number) => void;
  onViewerFontWeight: (fontWeight: number) => void;
  onKeyboardShortcuts: Dispatch<SetStateAction<AppKeyboardShortcutPreferences>>;
  onLogRetentionDays: (days: number) => void;
  onOpenManualAvroSchema: (serverId: string, topic: string) => void;
  onDeleteManualAvroSchema: (serverId: string, topic: string) => void;
  onClose: () => void;
};

export function PreferencesDialog({
  activePage,
  collapsedGroups,
  query,
  normalizedQuery,
  matches,
  fontFamily,
  fontSize,
  fontWeight,
  language,
  resolvedLanguage,
  exportFormatTemplate,
  consumeDefaults,
  viewerPreferenceRetentionDays,
  viewerFontSize,
  viewerFontWeight,
  keyboardShortcuts,
  logRetentionDays,
  manualAvroSchemaRows,
  onActivePage,
  onToggleGroup,
  onQuery,
  onFontFamily,
  onFontSize,
  onFontWeight,
  onLanguage,
  onExportFormatTemplate,
  onConsumeDefaults,
  onViewerPreferenceRetentionDays,
  onViewerFontSize,
  onViewerFontWeight,
  onKeyboardShortcuts,
  onLogRetentionDays,
  onOpenManualAvroSchema,
  onDeleteManualAvroSchema,
  onClose
}: PreferencesDialogProps) {
  const uiLanguage = resolvedLanguage;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="server-modal preferences-modal" role="dialog" aria-modal="true" aria-labelledby="preferences-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <div>
            <span className="eyebrow">{t(uiLanguage, "preferences.eyebrow")}</span>
            <h2 id="preferences-title">{t(uiLanguage, "preferences.title")}</h2>
          </div>
          <button className="modal-close" onClick={onClose} title={t(uiLanguage, "title.close")}>
            <X size={18} />
          </button>
        </div>
        <section className="preferences-layout">
          <PreferencesNav
            activePage={activePage}
            collapsedGroups={collapsedGroups}
            query={query}
            normalizedQuery={normalizedQuery}
            matches={matches}
            manualAvroSchemaRows={manualAvroSchemaRows}
            onActivePage={onActivePage}
            onToggleGroup={onToggleGroup}
            onQuery={onQuery}
          />
          <div className="preferences-content">
            {activePage === "editor-font" && (
              <EditorFontPreferences
                fontFamily={fontFamily}
                fontSize={fontSize}
                fontWeight={fontWeight}
                onFontFamily={onFontFamily}
                onFontSize={onFontSize}
                onFontWeight={onFontWeight}
              />
            )}
            {activePage === "keyboard-shortcuts" && (
              <KeyboardShortcutsPreferences
                keyboardShortcuts={keyboardShortcuts}
                onKeyboardShortcuts={onKeyboardShortcuts}
              />
            )}
            {activePage === "language" && (
              <LanguagePreferences
                language={language}
                resolvedLanguage={resolvedLanguage}
                onLanguage={onLanguage}
              />
            )}
            {activePage === "diagnostics" && (
              <DiagnosticsPreferences
                language={resolvedLanguage}
                logRetentionDays={logRetentionDays}
                onLogRetentionDays={onLogRetentionDays}
              />
            )}
            {activePage === "viewer-defaults" && (
              <ViewerDefaultsPreferences
                consumeDefaults={consumeDefaults}
                retentionDays={viewerPreferenceRetentionDays}
                fontSize={viewerFontSize}
                fontWeight={viewerFontWeight}
                onConsumeDefaults={onConsumeDefaults}
                onRetentionDays={onViewerPreferenceRetentionDays}
                onFontSize={onViewerFontSize}
                onFontWeight={onViewerFontWeight}
              />
            )}
            {activePage === "export-log" && (
              <ExportLogPreferences
                exportFormatTemplate={exportFormatTemplate}
                onExportFormatTemplate={onExportFormatTemplate}
              />
            )}
            {activePage === "avro-schemas" && (
              <AvroSchemasPreferences
                manualAvroSchemaRows={manualAvroSchemaRows}
                onOpenManualAvroSchema={onOpenManualAvroSchema}
                onDeleteManualAvroSchema={onDeleteManualAvroSchema}
              />
            )}
          </div>
        </section>
        <div className="modal-actions">
          {activePage === "editor-font" && (
            <button className="ghost" onClick={() => {
              onFontFamily(DEFAULT_FONT_FAMILY);
              onFontSize(13);
              onFontWeight(600);
            }}>
              {t(uiLanguage, "action.reset")}
            </button>
          )}
          <button className="primary" onClick={onClose}>{t(uiLanguage, "action.done")}</button>
        </div>
      </section>
    </div>
  );
}
