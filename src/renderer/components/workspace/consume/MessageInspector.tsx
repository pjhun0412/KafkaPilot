import { ChevronDown, Copy, MapPin, Send, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import { formatMessagePayload } from "../../../messagePreview";
import type { MessagePayloadTarget, MessagePreviewEncoding, MessagePreviewMode } from "../../../uiTypes";
import { InspectorMapDialog } from "./InspectorMapDialog";
import type { MessageInspectorProps } from "./inspectorTypes";
import { MessageInspectorContent } from "./MessageInspectorContent";
import { ReplayDialog } from "./ReplayDialog";
import { useInspectorMap } from "./useInspectorMap";
import { useInspectorReplay } from "./useInspectorReplay";
import { useInspectorTextSelection } from "./useInspectorTextSelection";
export { MessageTreeNode } from "./MessageTreeNode";

export function MessageInspector(props: MessageInspectorProps) {
  const replay = useInspectorReplay(props);
  const map = useInspectorMap(props);
  const { openLiveMap, openMapSettings, mapPoint } = map;
  const rememberInspectorSelectable = useInspectorTextSelection();
  const language = useAppLanguage();
  const [isProduceMenuOpen, setIsProduceMenuOpen] = useState(false);
  const produceMenuRef = useRef<HTMLDivElement | null>(null);

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const previewText = formatMessagePayload(
    props.selectedMessage,
    props.previewTarget,
    props.previewMode,
    props.previewEncoding,
    props.previewMode === "json"
  );

  const valueCopyText = formatMessagePayload(
    props.selectedMessage,
    "value",
    props.valueFormat,
    props.previewEncoding,
    props.valueFormat === "json"
  );

  const showEncoding = props.mode === "preview" && props.previewMode === "text" && (props.previewTarget === "key" || props.previewTarget === "value");

  useEffect(() => {
    function closeProduceMenu(event: PointerEvent) {
      if (!produceMenuRef.current || produceMenuRef.current.contains(event.target as Node)) return;
      setIsProduceMenuOpen(false);
    }

    window.addEventListener("pointerdown", closeProduceMenu);
    return () => window.removeEventListener("pointerdown", closeProduceMenu);
  }, []);
  return (
    <section className="message-inspector">
      <div className="message-inspector-toolbar">
        <div className="segmented compact-segmented">
          <button className={props.mode === "raw" ? "active" : ""} onClick={() => props.onMode("raw")}>{t(language, "label.raw")}</button>
          <button className={props.mode === "tree" ? "active" : ""} onClick={() => props.onMode("tree")}>{t(language, "label.tree")}</button>
          <button className={props.mode === "preview" ? "active" : ""} onClick={() => props.onMode("preview")}>{t(language, "label.preview")}</button>
        </div>
        <div className="message-inspector-options">
          {props.mode === "preview" && (
            <>
              <select
                className="preview-mode-select preview-target-select"
                value={props.previewTarget}
                onChange={(event) => props.onPreviewTarget(event.target.value as MessagePayloadTarget)}
                aria-label={t(language, "label.previewTarget")}
              >
                <option value="value">{t(language, "label.value")}</option>
                <option value="key">{t(language, "label.key")}</option>
                <option value="headers">{t(language, "label.headers")}</option>
                <option value="message">{t(language, "label.message")}</option>
              </select>
              <select
                className="preview-mode-select"
                value={props.previewMode}
                onChange={(event) => props.onPreviewMode(event.target.value as MessagePreviewMode)}
                aria-label={t(language, "label.previewMode")}
              >
                <option value="text">{t(language, "label.previewText")}</option>
                <option value="json">{t(language, "label.previewJson")}</option>
                <option value="hex">{t(language, "label.previewHex")}</option>
                <option value="base64">{t(language, "label.previewBase64")}</option>
                <option value="metadata">{t(language, "label.previewMetadata")}</option>
              </select>
            </>
          )}
          {showEncoding && (
            <select
              className="preview-mode-select preview-encoding-select"
              value={props.previewEncoding}
              onChange={(event) => props.onPreviewEncoding(event.target.value as MessagePreviewEncoding)}
              aria-label={t(language, "label.previewEncoding")}
            >
              <option value="utf-8">UTF-8</option>
              <option value="euc-kr">EUC-KR</option>
            </select>
          )}
        </div>
        <input className="message-inspector-search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder={t(language, "placeholder.searchPayload")} />
        <div className="message-inspector-actions">
          <button className="ghost compact" onClick={() => void copyText(props.rawText)} disabled={!props.rawText}><Copy size={14} /> JSON</button>
          <button className="ghost compact" onClick={() => void copyText(valueCopyText)} disabled={!valueCopyText}><Copy size={14} /> {t(language, "label.value")}</button>
          {props.mode === "preview" && (
            <button className="ghost compact" onClick={() => void copyText(previewText)} disabled={!previewText}><Copy size={14} /> {t(language, "label.preview")}</button>
          )}
          <button
            className="ghost compact"
            onClick={() => void openLiveMap()}
            disabled={!props.selectedMessage}
            title={mapPoint ? t(language, "title.openLiveMap") : t(language, "label.mapFieldMappingRequired")}
          >
            <MapPin size={14} /> Map
          </button>
          <button
            className={props.mapFieldMapping ? "ghost compact active" : "ghost compact"}
            onClick={() => openMapSettings()}
            disabled={!props.selectedMessage}
            title={t(language, "title.mapFieldSettings")}
          >
            <Settings2 size={14} /> {t(language, "label.mapSettings")}
          </button>
          <div className="produce-action-menu-wrap" ref={produceMenuRef}>
            <button
              className="ghost compact"
              onClick={() => setIsProduceMenuOpen((current) => !current)}
              disabled={!props.selectedMessage}
              aria-expanded={isProduceMenuOpen}
            >
              <Send size={14} /> Produce <ChevronDown size={13} />
            </button>
            {isProduceMenuOpen && (
              <div className="produce-action-menu">
                <button
                  type="button"
                  onClick={() => {
                    if (props.selectedMessage) props.onSendToProduce(props.selectedMessage);
                    setIsProduceMenuOpen(false);
                  }}
                >
                  <strong>{t(language, "replay.produceCurrent")}</strong>
                  <span>{props.selectedMessage?.topic ?? "-"}</span>
                </button>
                <button type="button" onClick={() => { setIsProduceMenuOpen(false); replay.openReplayDialog(); }}>
                  <strong>{t(language, "replay.chooseTarget")}</strong>
                  <span>{t(language, "replay.chooseTargetHelp")}</span>
                </button>
              </div>
            )}
          </div>
          <button className="ghost compact icon-only" onClick={props.onCollapse} title={t(language, "title.collapseMessageViewer")} aria-label={t(language, "title.collapseMessageViewer")}><ChevronDown size={15} /></button>
        </div>
      </div>
      <ReplayDialog source={props} controller={replay} />
      <InspectorMapDialog source={props} controller={map} />
      <MessageInspectorContent source={props} previewText={previewText} rememberInspectorSelectable={rememberInspectorSelectable} />
    </section>
  );
}
