import { useMemo, useState } from "react";
import { collectValuePaths } from "../../../consumeValuePaths";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import type { MapFieldMapping } from "../../../mapPreview";
import { createLiveMapPoint, getMapCoordinateFromSelection, normalizeMapFieldMapping } from "../../../mapPreview";
import type { MapFieldPickerId } from "./inspectorFieldPaths";
import { formatMapFieldPath, getAutoMapFieldPath } from "./inspectorFieldPaths";
import type { MessageInspectorProps } from "./inspectorTypes";

export type InspectorMapProps = Pick<MessageInspectorProps, "selectedMessage" | "payload" | "mapFieldMapping" | "onMapFieldMapping">;

export function useInspectorMap(props: InspectorMapProps) {
  const language = useAppLanguage();
  const [isMapSettingsOpen, setIsMapSettingsOpen] = useState(false);
  const [activeMapFieldPicker, setActiveMapFieldPicker] = useState<MapFieldPickerId | null>(null);
  const [mapFieldPickerQuery, setMapFieldPickerQuery] = useState("");
  const [mapSettingsNotice, setMapSettingsNotice] = useState("");
  const [mapSettingsDraft, setMapSettingsDraft] = useState<MapFieldMapping>({
    xPath: "",
    yPath: "",
    projection: "wgs84"
  });

  const mapPoint = useMemo(
    () => (props.selectedMessage ? createLiveMapPoint(props.selectedMessage, props.payload, undefined, props.mapFieldMapping) ?? createLiveMapPoint(props.selectedMessage) : null),
    [props.mapFieldMapping, props.payload, props.selectedMessage]
  );

  const mapFieldPaths = useMemo(() => Array.from(collectValuePaths(props.payload)).sort((left, right) => left.localeCompare(right)), [props.payload]);
  const autoMapFieldPaths = useMemo(() => ({
    x: getAutoMapFieldPath(mapFieldPaths, "x"),
    y: getAutoMapFieldPath(mapFieldPaths, "y"),
    identity: getAutoMapFieldPath(mapFieldPaths, "identity"),
    heading: getAutoMapFieldPath(mapFieldPaths, "heading"),
    speed: getAutoMapFieldPath(mapFieldPaths, "speed")
  }), [mapFieldPaths]);

  async function openLiveMap() {
    if (!props.selectedMessage) return;
    if (!mapPoint) {
      openMapSettings(t(language, "label.mapFieldMappingRequired"));
      return;
    }
    const focusedPoint = mapPoint ? { ...mapPoint, focus: true } : null;
    if (focusedPoint) {
      await window.kafkaApi.sendLiveMapPoints([focusedPoint]);
    }
    await window.kafkaApi.openLiveMap();
  }

  function openMapSettings(notice = "") {
    setMapSettingsDraft(props.mapFieldMapping ?? {
      xPath: "",
      yPath: "",
      projection: "wgs84"
    });
    setActiveMapFieldPicker(null);
    setMapFieldPickerQuery("");
    setMapSettingsNotice(notice);
    setIsMapSettingsOpen(true);
  }

  function updateMapSettingsDraft(patch: Partial<MapFieldMapping>) {
    setMapSettingsDraft((current) => ({ ...current, ...patch }));
  }

  function applyMapSettings() {
    const normalized = normalizeMapFieldMapping(mapSettingsDraft);
    if (!normalized || !getMapCoordinateFromSelection(props.payload, normalized)) {
      setMapSettingsNotice(t(language, "label.mapFieldMappingInvalid"));
      return;
    }
    props.onMapFieldMapping(normalized);
    setMapSettingsNotice("");
    setIsMapSettingsOpen(false);
  }

  function clearMapSettings() {
    props.onMapFieldMapping(null);
    setMapSettingsDraft({ xPath: "", yPath: "", projection: "wgs84" });
  }

  function closeFieldPicker() {
    setActiveMapFieldPicker(null);
    setMapFieldPickerQuery("");
  }

  function openFieldPicker(id: MapFieldPickerId) {
    setActiveMapFieldPicker((current) => current === id ? null : id);
    setMapFieldPickerQuery("");
  }

  function getMapFieldPickerPaths(value: string) {
    const query = mapFieldPickerQuery.trim().toLowerCase();
    const filtered = query
      ? mapFieldPaths.filter((path) => path.toLowerCase().includes(query) || formatMapFieldPath(path).toLowerCase().includes(query))
      : mapFieldPaths;
    return Array.from(new Set([value, ...filtered].filter(Boolean))).sort((left, right) => formatMapFieldPath(left).localeCompare(formatMapFieldPath(right)));
  }

  function selectMapField(value: string, onChange: (value: string) => void) {
    onChange(value);
    closeFieldPicker();
  }
  return {
    isMapSettingsOpen,
    setIsMapSettingsOpen,
    activeMapFieldPicker,
    mapFieldPickerQuery,
    setMapFieldPickerQuery,
    mapSettingsNotice,
    mapSettingsDraft,
    mapPoint,
    autoMapFieldPaths,
    openLiveMap,
    openMapSettings,
    updateMapSettingsDraft,
    applyMapSettings,
    clearMapSettings,
    closeFieldPicker,
    openFieldPicker,
    getMapFieldPickerPaths,
    selectMapField
  };
}
