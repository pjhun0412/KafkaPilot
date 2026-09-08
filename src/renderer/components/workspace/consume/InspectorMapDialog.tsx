import { ChevronDown, Search, X } from "lucide-react";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import type { MapFieldMapping } from "../../../mapPreview";
import type { MapFieldPickerId } from "./inspectorFieldPaths";
import { formatMapFieldPath } from "./inspectorFieldPaths";
import type { InspectorMapProps, useInspectorMap } from "./useInspectorMap";

export function InspectorMapDialog({ source: props, controller }: { source: InspectorMapProps; controller: ReturnType<typeof useInspectorMap>; }) {
  const language = useAppLanguage();
  const {
    isMapSettingsOpen,
    setIsMapSettingsOpen,
    activeMapFieldPicker,
    mapFieldPickerQuery,
    setMapFieldPickerQuery,
    mapSettingsNotice,
    mapSettingsDraft,
    autoMapFieldPaths,
    updateMapSettingsDraft,
    applyMapSettings,
    clearMapSettings,
    closeFieldPicker,
    openFieldPicker,
    getMapFieldPickerPaths,
    selectMapField
  } = controller;
  function renderMapFieldPicker(params: {
    id: MapFieldPickerId;
    value: string;
    autoPath?: string;
    required?: boolean;
    placement?: "top" | "bottom";
    onChange: (value: string) => void;
  }) {
    const isOpen = activeMapFieldPicker === params.id;
    const display = params.value
      ? formatMapFieldPath(params.value)
      : params.required
        ? t(language, "label.selectField")
        : params.autoPath
          ? `${t(language, "label.autoDetect")} (${formatMapFieldPath(params.autoPath)})`
          : t(language, "label.autoDetectFailed");
    const paths = getMapFieldPickerPaths(params.value);
    return (
      <div className="map-field-picker">
        <button
          type="button"
          className={params.value ? "map-field-picker-trigger selected" : "map-field-picker-trigger"}
          onClick={() => openFieldPicker(params.id)}
          title={params.value || params.autoPath || display}
        >
          <span>{display}</span>
          <ChevronDown size={14} />
        </button>
        {isOpen && (
          <div className={params.placement === "top" ? "map-field-picker-popover open-up" : "map-field-picker-popover"}>
            <label className="map-field-picker-search">
              <Search size={13} />
              <input
                value={mapFieldPickerQuery}
                onChange={(event) => setMapFieldPickerQuery(event.target.value)}
                placeholder={t(language, "placeholder.searchMapFields")}
                autoFocus
              />
            </label>
            {!params.required && (
              <button
                type="button"
                className="map-field-picker-option muted"
                title={params.autoPath || ""}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectMapField("", params.onChange);
                }}
              >
                <span>{params.autoPath ? `${t(language, "label.autoDetect")} (${formatMapFieldPath(params.autoPath)})` : t(language, "label.autoDetectFailed")}</span>
              </button>
            )}
            <div className="map-field-picker-list">
              {paths.map((path) => (
                <button
                  type="button"
                  className={path === params.value ? "map-field-picker-option selected" : "map-field-picker-option"}
                  key={path}
                  title={path}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectMapField(path, params.onChange);
                  }}
                >
                  <strong>{formatMapFieldPath(path)}</strong>
                  <span>{path}</span>
                </button>
              ))}
              {paths.length === 0 && <div className="map-field-picker-empty">{t(language, "label.noSettingsMatched")}</div>}
            </div>
          </div>
        )}
      </div>
    );
  }
  return <>{isMapSettingsOpen && (
    <div className="modal-backdrop map-field-modal-backdrop" role="presentation" onMouseDown={() => setIsMapSettingsOpen(false)}>
      <section className="map-field-modal" role="dialog" aria-modal="true" aria-labelledby="map-field-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <div>
            <span className="eyebrow">{props.selectedMessage?.topic ?? "Topic"}</span>
            <h2 id="map-field-modal-title">{t(language, "label.mapFieldMapping")}</h2>
          </div>
          <button className="modal-close" onClick={() => setIsMapSettingsOpen(false)} title={t(language, "title.close")}>
            <X size={16} />
          </button>
        </div>
        <p className="map-field-modal-help">{t(language, "label.mapFieldMappingHelp")}</p>
        {mapSettingsNotice && <div className="map-field-modal-notice" role="alert">{mapSettingsNotice}</div>}
        <div className={activeMapFieldPicker ? "map-field-modal-grid picker-open" : "map-field-modal-grid"}>
          <div className="map-field-section">
            <strong>{t(language, "label.mapCoordinateSection")}</strong>
          </div>
          <label>
            <span>{t(language, "label.mapCoordinateSystem")}</span>
            <select value={mapSettingsDraft.projection} onChange={(event) => {
              closeFieldPicker();
              updateMapSettingsDraft({ projection: event.target.value as MapFieldMapping["projection"] });
            }}>
              <optgroup label={t(language, "label.mapProjectionWgs84Group")}>
                <option value="wgs84">WGS84 (Lat/Lng Deg)</option>
                <option value="wgs84_msec">WGS84 (Lat/Lng Msec)</option>
              </optgroup>
              <optgroup label={t(language, "label.mapProjectionTmGroup")}>
                <option value="korea_grs80_central">GRS80 (Korea Central Belt / 한국 중부원점)</option>
                <option value="korea_itrf2000_central">ITRF 2000 (Central Belt / 한국 중부원점)</option>
              </optgroup>
              <optgroup label={t(language, "label.mapProjectionUtmGroup")}>
                <option value="utm52n">UTM Zone 52N (Korea Belt)</option>
              </optgroup>
            </select>
          </label>
          <div className="map-field-section">
            <strong>{t(language, "label.mapRequiredCoordinateSection")}</strong>
          </div>
          <label>
            <span>{t(language, "label.mapYField")}</span>
            {renderMapFieldPicker({ id: "y", value: mapSettingsDraft.yPath, required: true, autoPath: autoMapFieldPaths.y, onChange: (yPath) => updateMapSettingsDraft({ yPath }) })}
          </label>
          <label>
            <span>{t(language, "label.mapXField")}</span>
            {renderMapFieldPicker({ id: "x", value: mapSettingsDraft.xPath, required: true, autoPath: autoMapFieldPaths.x, onChange: (xPath) => updateMapSettingsDraft({ xPath }) })}
          </label>
          <div className="map-field-section">
            <strong>{t(language, "label.mapVehicleSection")}</strong>
          </div>
          <label>
            <span>{t(language, "label.mapHeadingField")}</span>
            {renderMapFieldPicker({
              id: "heading",
              value: mapSettingsDraft.headingPath ?? "",
              autoPath: autoMapFieldPaths.heading,
              placement: "top",
              onChange: (headingPath) => updateMapSettingsDraft({ headingPath })
            })}
          </label>
          <div className="map-field-row">
            <label>
              <span>{t(language, "label.mapSpeedField")}</span>
              {renderMapFieldPicker({
                id: "speed",
                value: mapSettingsDraft.speedPath ?? "",
                autoPath: autoMapFieldPaths.speed,
                placement: "top",
                onChange: (speedPath) => updateMapSettingsDraft({ speedPath })
              })}
            </label>
            <label>
              <span>{t(language, "label.mapSpeedUnit")}</span>
              <select
                value={mapSettingsDraft.speedUnit ?? "auto"}
                onChange={(event) => {
                  closeFieldPicker();
                  updateMapSettingsDraft({ speedUnit: event.target.value as MapFieldMapping["speedUnit"] });
                }}
              >
                <option value="auto">{t(language, "label.autoDetect")}</option>
                <option value="kmh">km/h</option>
                <option value="mps">m/s</option>
              </select>
            </label>
          </div>
          <label>
            <span>{t(language, "label.mapIdentityField")}</span>
            {renderMapFieldPicker({
              id: "identity",
              value: mapSettingsDraft.identityPath ?? "",
              autoPath: autoMapFieldPaths.identity,
              placement: "top",
              onChange: (identityPath) => updateMapSettingsDraft({ identityPath })
            })}
          </label>
        </div>
        <div className="modal-actions">
          <button className="ghost compact" onClick={clearMapSettings}>{t(language, "label.clear")}</button>
          <button className="ghost compact" onClick={() => setIsMapSettingsOpen(false)}>{t(language, "action.cancel")}</button>
          <button className="primary compact" onClick={applyMapSettings} disabled={!mapSettingsDraft.xPath || !mapSettingsDraft.yPath}>{t(language, "action.save")}</button>
        </div>
      </section>
    </div>
  )}</>;
}
