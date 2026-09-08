import { ChevronUp, RefreshCw } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { ConsumedMessage } from "../../../../shared/types";
import { t } from "../../../i18n";
import type { MessagePayloadTarget, MessagePreviewEncoding, MessagePreviewMode } from "../../../uiTypes";
import type { ConsumePanelProps } from "./consumePanelTypes";
import { ConsumeToolbar } from "./ConsumeToolbar";
import { MessageFilterBar } from "./MessageFilterBar";
import { MessageGrid } from "./MessageGrid";
import { MessageInspector } from "./MessageInspector";
import { useConsumeMapPoints } from "./useConsumeMapPoints";
import { useConsumeMessageSelection } from "./useConsumeMessageSelection";
import { useConsumePanelMessages } from "./useConsumePanelMessages";
import { useConsumeValueColumns } from "./useConsumeValueColumns";
import { useInspectorResize } from "./useInspectorResize";
import { ValueColumnsPicker } from "./ValueColumnsPicker";

function ConsumePanelView(props: ConsumePanelProps) {
  const columns = useConsumeValueColumns(props);
  const { valueColumnPaths, toggleValueColumn } = columns;
  const { checkedMessageKeys, checkedMessages, toggleMessageChecked, toggleVisibleChecked } = useConsumeMessageSelection(props);
  const [previewTarget, setPreviewTarget] = useState<MessagePayloadTarget>("value");
  const [previewMode, setPreviewMode] = useState<MessagePreviewMode>(props.valueFormat);
  const [previewEncoding, setPreviewEncoding] = useState<MessagePreviewEncoding>(props.payloadEncoding);
  const [inspectorSearch, setInspectorSearch] = useState("");
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(props.filterText);
  const [isGridReady, setIsGridReady] = useState(false);
  const messageTableRef = useRef<HTMLDivElement | null>(null);
  const consumeGridRef = useRef<HTMLDivElement | null>(null);
  const startInspectorResize = useInspectorResize({
    consumeGridRef,
    inspectorCollapsed: props.inspectorCollapsed,
    messagePaneHeight: props.messagePaneHeight,
    onMessagePaneHeight: props.onMessagePaneHeight
  });

  const {
    selectedPayload,
    selectedJson,
    filteredMessages,
    hasActiveMessageFilter,
    gridRows,
    highlightedMessageKeys,
    selectedMessageKey,
    isLargeOffsetRequest,
    pagination,
    canExportFullOffsetRange
  } = useConsumePanelMessages({
    messages: props.messages,
    selectedMessage: props.selectedMessage,
    mode: props.mode,
    limit: props.limit,
    filterText: props.filterText,
    filterField: props.filterField,
    filterMode: props.filterMode,
    offsetPagination: props.offsetPagination,
    keyFormat: props.keyFormat,
    valueFormat: props.valueFormat,
    payloadEncoding: props.payloadEncoding
  });
  useConsumeMapPoints(props, selectedPayload);

  useEffect(() => {
    setFilterDraft(props.filterText);
  }, [props.filterText]);

  useEffect(() => {
    setIsGridReady(false);
    const frame = window.requestAnimationFrame(() => setIsGridReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (filterDraft === props.filterText) return;
    const timer = window.setTimeout(() => {
      props.onFilterText(filterDraft);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [filterDraft, props.filterText, props.onFilterText]);

  useEffect(() => {
    if (props.mode !== "live" || !props.autoScroll) return;
    const scrollTarget = messageTableRef.current?.querySelector(".message-table");
    scrollTarget?.scrollTo({ top: 0 });
  }, [props.autoScroll, props.messages.length, props.mode]);

  useEffect(() => {
    if (previewTarget === "key") setPreviewMode(props.keyFormat);
    if (previewTarget === "value") setPreviewMode(props.valueFormat);
  }, [previewTarget, props.keyFormat, props.valueFormat]);

  useEffect(() => {
    setPreviewEncoding(props.payloadEncoding);
  }, [props.payloadEncoding]);

  function clearMessageFilter() {
    setFilterDraft("");
    props.onClearFilter();
  }

  function selectMessage(message: ConsumedMessage) {
    if (props.selectedMessage === message) return;
    props.onSelectMessage(message);
    if (previewTarget === "key") {
      setPreviewMode(props.keyFormat);
    } else if (previewTarget === "value") {
      setPreviewMode(props.valueFormat);
    }
    setPreviewEncoding(props.payloadEncoding);
  }

  const queryMessage = props.mode === "live"
    ? props.isConsuming
      ? t(props.language, "task.stoppingLiveConsume")
      : t(props.language, "task.startingLiveConsume")
    : props.mode === "timeRange"
      ? t(props.language, "task.loadingTimeRangeMessages")
      : t(props.language, "task.loadingMessages");
  return (
    <section className={props.isQuerying ? "panel consume-workspace querying" : "panel consume-workspace"}>
      {props.isQuerying && (
        <>
          <div className="consume-query-progress" aria-hidden="true" />
          <div className="pane-local-toast">
            <RefreshCw size={14} className="spin" />
            <span>{props.topic || "Topic"} {queryMessage}</span>
          </div>
        </>
      )}
      <ConsumeToolbar
        mode={props.mode}
        offsetOrder={props.offsetOrder}
        isConsuming={props.isConsuming}
        isQuerying={props.isQuerying}
        partition={props.partition}
        offset={props.offset}
        limit={props.limit}
        timeStart={props.timeStart}
        timeEnd={props.timeEnd}
        autoScroll={props.autoScroll}
        maxMessages={props.maxMessages}
        liveRecordEnabled={props.liveRecordEnabled}
        liveRecordPath={props.liveRecordPath}
        liveRecordCount={props.liveRecordCount}
        keyFormat={props.keyFormat}
        valueFormat={props.valueFormat}
        payloadEncoding={props.payloadEncoding}
        filterMode={props.filterMode}
        hasActiveMessageFilter={hasActiveMessageFilter}
        filteredMessages={filteredMessages}
        totalMessageCount={props.messages.length}
        isLargeOffsetRequest={isLargeOffsetRequest}
        pagination={pagination}
        canExportFullOffsetRange={canExportFullOffsetRange}
        isExportMenuOpen={isExportMenuOpen}
        onExportMenuOpen={setIsExportMenuOpen}
        onMode={props.onMode}
        onOffsetOrder={props.onOffsetOrder}
        onOffset={props.onOffset}
        onLimit={props.onLimit}
        onPartition={props.onPartition}
        onTimeStart={props.onTimeStart}
        onTimeEnd={props.onTimeEnd}
        onAutoScroll={props.onAutoScroll}
        onMaxMessages={props.onMaxMessages}
        onLiveRecordEnabled={props.onLiveRecordEnabled}
        onKeyFormat={props.onKeyFormat}
        onValueFormat={props.onValueFormat}
        onPayloadEncoding={props.onPayloadEncoding}
        onPagePrev={props.onPagePrev}
        onPageNext={props.onPageNext}
        onExport={props.onExport}
        onExportAll={props.onExportAll}
        onStart={props.onStart}
        onStop={props.onStop}
      />
      <MessageFilterBar
        filterDraft={filterDraft}
        filterField={props.filterField}
        filterMode={props.filterMode}
        onFilterDraft={setFilterDraft}
        onFilterField={props.onFilterField}
        onFilterMode={props.onFilterMode}
        onClear={clearMessageFilter}
      />
      <ValueColumnsPicker source={props} controller={columns} />
      <div
        className={props.inspectorCollapsed ? "consume-grid inspector-collapsed" : "consume-grid"}
        ref={consumeGridRef}
        style={{ gridTemplateRows: props.inspectorCollapsed ? "minmax(0, 1fr) 34px" : `${props.messagePaneHeight}px 8px minmax(0, 1fr)` }}
      >
        <div ref={messageTableRef} className="consume-grid-table-wrap">
          {isGridReady ? (
            <MessageGrid
              rows={gridRows}
              valueColumnPaths={valueColumnPaths}
              selectedMessageKey={selectedMessageKey}
              checkedMessageKeys={checkedMessageKeys}
              filterMode={props.filterMode}
              hasActiveMessageFilter={hasActiveMessageFilter}
              highlightedMessageKeys={highlightedMessageKeys}
              onSelectMessage={selectMessage}
              onToggleMessageChecked={toggleMessageChecked}
              onToggleVisibleChecked={toggleVisibleChecked}
            />
          ) : (
            <div className="message-table tanstack-message-table table-warmup">
              <div className="empty-list">Loading messages...</div>
            </div>
          )}
        </div>
        {props.inspectorCollapsed ? (
          <button className="message-inspector-collapsed" onClick={() => props.onInspectorCollapsed(false)}>
            <ChevronUp size={15} />
            Message Viewer
            <span>{props.selectedMessage ? `${props.selectedMessage.topic}@${props.selectedMessage.offset}` : "No message selected"}</span>
          </button>
        ) : (
          <>
            <div className="consume-split-resizer" onPointerDown={startInspectorResize} title={t(props.language, "title.resizeMessageViewerPanels")} />
            <MessageInspector
              serverId={props.serverId}
              serverName={props.serverName}
              replayTargets={props.replayTargets}
              mode={props.inspectorMode}
              previewTarget={previewTarget}
              previewMode={previewMode}
              valueFormat={props.valueFormat}
              previewEncoding={previewEncoding}
              search={inspectorSearch}
              payload={selectedPayload}
              rawText={selectedJson}
              valueText={props.selectedMessage?.value ?? ""}
              selectedMessage={props.selectedMessage}
              selectedReplayMessages={checkedMessages}
              filteredReplayMessages={filteredMessages}
              allReplayMessages={props.messages}
              mapFieldMapping={props.mapFieldMapping}
              valueColumnPaths={valueColumnPaths}
              onMapFieldMapping={props.onMapFieldMapping}
              onValueColumnPath={toggleValueColumn}
              onMode={props.onInspectorMode}
              onPreviewTarget={setPreviewTarget}
              onPreviewMode={setPreviewMode}
              onPreviewEncoding={setPreviewEncoding}
              onSearch={setInspectorSearch}
              onApplyFilter={props.onApplyFilter}
              onSendToProduce={props.onSendToProduce}
              onReplayMessage={props.onReplayMessage}
              onConnectReplayServer={props.onConnectReplayServer}
              onCollapse={() => props.onInspectorCollapsed(true)}
            />
          </>
        )}
      </div>
    </section>
  );
}

function areConsumePanelPropsEqual(previous: ConsumePanelProps, next: ConsumePanelProps) {
  return previous.messages === next.messages
    && previous.serverId === next.serverId
    && previous.serverName === next.serverName
    && previous.topic === next.topic
    && previous.replayTargets === next.replayTargets
    && previous.language === next.language
    && previous.selectedMessage === next.selectedMessage
    && previous.mode === next.mode
    && previous.offsetOrder === next.offsetOrder
    && previous.isConsuming === next.isConsuming
    && previous.offset === next.offset
    && previous.limit === next.limit
    && previous.partition === next.partition
    && previous.timeStart === next.timeStart
    && previous.timeEnd === next.timeEnd
    && previous.filterText === next.filterText
    && previous.filterField === next.filterField
    && previous.filterMode === next.filterMode
    && previous.inspectorMode === next.inspectorMode
    && previous.inspectorCollapsed === next.inspectorCollapsed
    && previous.isQuerying === next.isQuerying
    && previous.autoScroll === next.autoScroll
    && previous.maxMessages === next.maxMessages
    && previous.liveRecordEnabled === next.liveRecordEnabled
    && previous.liveRecordPath === next.liveRecordPath
    && previous.liveRecordCount === next.liveRecordCount
    && previous.keyFormat === next.keyFormat
    && previous.valueFormat === next.valueFormat
    && previous.payloadEncoding === next.payloadEncoding
    && previous.valueColumnPaths === next.valueColumnPaths
    && previous.mapFieldMapping === next.mapFieldMapping
    && previous.offsetPagination === next.offsetPagination
    && previous.messagePaneHeight === next.messagePaneHeight
    && previous.onReplayMessage === next.onReplayMessage
    && previous.onConnectReplayServer === next.onConnectReplayServer;
}

export const ConsumePanel = React.memo(ConsumePanelView, areConsumePanelPropsEqual);
