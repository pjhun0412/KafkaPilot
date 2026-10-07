import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Columns3, Folder, RefreshCw, X } from "lucide-react";
import type { ConsumedMessage, LiveMapPoint, MessageExportFormat, TopicSummary } from "../../../../shared/types";
import type { AppLanguage } from "../../../i18n";
import { t } from "../../../i18n";
import { collectMessageValuePaths, normalizeValueColumnPaths } from "../../../consumeValuePaths";
import { createLiveMapPoint } from "../../../mapPreview";
import { formatMessagePayload } from "../../../utils";
import type { MapFieldMapping } from "../../../mapPreview";
import type { ReplayDraft, ReplayPayloadOptions, ReplayTargetServer } from "../../../replayTypes";
import type { ConsumeFilterField, ConsumeFilterMode, ConsumeMode, MessageInspectorMode, MessagePayloadTarget, MessagePreviewEncoding, MessagePreviewMode, OffsetOrder, TopicConsumeState } from "../../../uiTypes";
import { ConsumeToolbar } from "./ConsumeToolbar";
import { MessageInspector } from "./MessageInspector";
import { MessageFilterBar } from "./MessageFilterBar";
import { getMessageRowKey, MessageGrid } from "./MessageGrid";
import { useConsumePanelMessages } from "./useConsumePanelMessages";
import { useInspectorResize } from "./useInspectorResize";

type ConsumePanelProps = {
  messages: ConsumedMessage[];
  serverId: string;
  serverName: string;
  topic: string;
  topics: TopicSummary[];
  replayTargets: ReplayTargetServer[];
  language: AppLanguage;
  selectedMessage: ConsumedMessage | null;
  mode: ConsumeMode;
  offsetOrder: OffsetOrder;
  isConsuming: boolean;
  offset: string;
  limit: number;
  partition: string;
  timeStart: string;
  timeEnd: string;
  filterText: string;
  filterField: ConsumeFilterField;
  filterMode: ConsumeFilterMode;
  inspectorMode: MessageInspectorMode;
  inspectorCollapsed: boolean;
  isQuerying: boolean;
  autoScroll: boolean;
  maxMessages: number;
  liveRecordEnabled: boolean;
  liveRecordPath: string;
  liveRecordCount: number;
  keyFormat: TopicConsumeState["keyFormat"];
  valueFormat: TopicConsumeState["valueFormat"];
  payloadEncoding: TopicConsumeState["payloadEncoding"];
  valueColumnPaths: string[];
  mapFieldMapping: MapFieldMapping | null;
  offsetPagination: TopicConsumeState["offsetPagination"];
  messagePaneHeight: number;
  onMode: (value: ConsumeMode) => void;
  onOffsetOrder: (value: OffsetOrder) => void;
  onOffset: (value: string) => void;
  onLimit: (value: number) => void;
  onPartition: (value: string) => void;
  onTimeStart: (value: string) => void;
  onTimeEnd: (value: string) => void;
  onFilterText: (value: string) => void;
  onFilterField: (value: ConsumeFilterField) => void;
  onFilterMode: (value: ConsumeFilterMode) => void;
  onInspectorMode: (value: MessageInspectorMode) => void;
  onInspectorCollapsed: (value: boolean) => void;
  onClearFilter: () => void;
  onApplyFilter: (value: string) => void;
  onAutoScroll: (value: boolean) => void;
  onMaxMessages: (value: number) => void;
  onLiveRecordEnabled: (value: boolean) => void;
  onKeyFormat: (value: TopicConsumeState["keyFormat"]) => void;
  onValueFormat: (value: TopicConsumeState["valueFormat"]) => void;
  onPayloadEncoding: (value: TopicConsumeState["payloadEncoding"]) => void;
  onValueColumnPaths: (value: string[]) => void;
  onMapFieldMapping: (value: MapFieldMapping | null) => void;
  onPagePrev: () => void;
  onPageNext: () => void;
  onSelectMessage: (message: ConsumedMessage) => void;
  onMessagePaneHeight: (value: number) => void;
  onSendToProduce: (message: ConsumedMessage, targetTopic?: string, targetServerId?: string, payload?: ReplayPayloadOptions) => void;
  onReplayMessage: (serverId: string, topic: string, draft: ReplayDraft) => Promise<void>;
  onConnectReplayServer: (serverId: string) => Promise<boolean>;
  onExport: (format: MessageExportFormat, messages: ConsumedMessage[]) => void;
  onExportAll: (format: MessageExportFormat) => void;
  onStart: () => void;
  onStop: () => void;
};

const MAX_VALUE_COLUMN_CANDIDATES = 160;
const VALUE_COLUMN_SAMPLE_SIZE = 200;

type ValueColumnTreeNode = {
  name: string;
  fullPath: string;
  children: Map<string, ValueColumnTreeNode>;
  leafPath?: string;
};

function normalizeValueColumnPathKey(path: string) {
  return path.replace(/[-_\s]/g, "").toLowerCase();
}

function createValueColumnTree(paths: string[]) {
  const root: ValueColumnTreeNode = { name: "", fullPath: "", children: new Map() };
  for (const path of paths) {
    const segments = path.split(".").filter(Boolean);
    let node = root;
    segments.forEach((segment, index) => {
      const fullPath = segments.slice(0, index + 1).join(".");
      let child = node.children.get(segment);
      if (!child) {
        child = { name: segment, fullPath, children: new Map() };
        node.children.set(segment, child);
      }
      if (index === segments.length - 1) {
        child.leafPath = path;
      }
      node = child;
    });
  }
  return root;
}

function getValueColumnLeafPaths(node: ValueColumnTreeNode): string[] {
  const paths: string[] = [];
  if (node.leafPath) paths.push(node.leafPath);
  for (const child of node.children.values()) {
    paths.push(...getValueColumnLeafPaths(child));
  }
  return paths;
}

function getValueColumnGroupHintKey(name: string) {
  const key = normalizeValueColumnPathKey(name);
  if (key.includes("position") || key.includes("gps") || key.includes("location")) return "label.positionInfo";
  if (key.includes("vehicle") || key.includes("ego")) return "label.vehicleStatus";
  if (key.includes("time")) return "label.timeInfo";
  return "";
}

function formatValueColumnLabel(path: string) {
  const segments = path.split(".").filter(Boolean);
  const leaf = segments.at(-1) ?? path;
  const parent = segments.at(-2) ?? "";
  return parent ? `${leaf} (...${parent})` : leaf;
}

function ConsumePanelView(props: ConsumePanelProps) {
  const [previewTarget, setPreviewTarget] = useState<MessagePayloadTarget>("value");
  const [previewMode, setPreviewMode] = useState<MessagePreviewMode>(props.valueFormat);
  const [previewEncoding, setPreviewEncoding] = useState<MessagePreviewEncoding>(props.payloadEncoding);
  const [inspectorSearch, setInspectorSearch] = useState("");
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(props.filterText);
  const [isGridReady, setIsGridReady] = useState(false);
  const [showValueColumns, setShowValueColumns] = useState(false);
  const [valueColumnSearch, setValueColumnSearch] = useState("");
  const [expandedValueColumnGroups, setExpandedValueColumnGroups] = useState<Set<string>>(() => new Set());
  const [checkedMessageKeys, setCheckedMessageKeys] = useState<Set<string>>(() => new Set());
  const messageTableRef = useRef<HTMLDivElement | null>(null);
  const consumeGridRef = useRef<HTMLDivElement | null>(null);
  const lastSentLiveMapMessageRef = useRef("");
  const lastSentSelectedMapMessageRef = useRef("");
  const pendingLiveMapPointsRef = useRef<LiveMapPoint[]>([]);
  const liveMapFlushTimerRef = useRef<number | null>(null);
  const valueColumnPaths = useMemo(() => normalizeValueColumnPaths(props.valueColumnPaths), [props.valueColumnPaths]);
  const mapFieldMappingKey = useMemo(() => JSON.stringify(props.mapFieldMapping ?? null), [props.mapFieldMapping]);
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
  const checkedMessages = useMemo(
    () => props.messages.filter((message) => checkedMessageKeys.has(getMessageRowKey(message))),
    [checkedMessageKeys, props.messages]
  );

  const valueColumnCandidates = useMemo(() => {
    return collectMessageValuePaths(props.messages, VALUE_COLUMN_SAMPLE_SIZE, MAX_VALUE_COLUMN_CANDIDATES);
  }, [props.messages]);
  const visibleValueColumnPaths = useMemo(
    () => Array.from(new Set([...valueColumnPaths, ...valueColumnCandidates])),
    [valueColumnPaths, valueColumnCandidates]
  );
  const filteredValueColumnPaths = useMemo(() => {
    const query = valueColumnSearch.trim().toLowerCase();
    if (!query) return visibleValueColumnPaths;
    return visibleValueColumnPaths.filter((path) => path.toLowerCase().includes(query));
  }, [valueColumnSearch, visibleValueColumnPaths]);
  const valueColumnTree = useMemo(() => createValueColumnTree(filteredValueColumnPaths), [filteredValueColumnPaths]);
  const rootValueColumnGroupPaths = useMemo(() => {
    return Array.from(createValueColumnTree(visibleValueColumnPaths).children.values())
      .filter((node) => node.children.size > 0)
      .map((node) => node.fullPath);
  }, [visibleValueColumnPaths]);
  useEffect(() => {
    setFilterDraft(props.filterText);
  }, [props.filterText]);

  useEffect(() => {
    setShowValueColumns(false);
    setValueColumnSearch("");
    setExpandedValueColumnGroups(new Set());
  }, [props.topic]);

  useEffect(() => {
    setExpandedValueColumnGroups((current) => {
      if (current.size > 0 || rootValueColumnGroupPaths.length === 0) return current;
      return new Set(rootValueColumnGroupPaths);
    });
  }, [rootValueColumnGroupPaths]);

  useEffect(() => {
    setCheckedMessageKeys((current) => {
      if (current.size === 0) return current;
      const availableKeys = new Set(props.messages.map(getMessageRowKey));
      const next = new Set([...current].filter((key) => availableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [props.messages]);

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
    if (props.mode !== "live" || props.messages.length === 0) return;
    const latestMessage = props.messages[0];
    const latestKey = `${latestMessage.topic}:${latestMessage.partition}:${latestMessage.offset}:${latestMessage.timestamp}:${mapFieldMappingKey}`;
    if (latestKey === lastSentLiveMapMessageRef.current) return;
    lastSentLiveMapMessageRef.current = latestKey;
    const point = createLiveMapPoint(latestMessage, formatMessagePayload(latestMessage), undefined, props.mapFieldMapping) ?? createLiveMapPoint(latestMessage);
    if (!point) return;
    pendingLiveMapPointsRef.current.push(point);
    if (liveMapFlushTimerRef.current !== null) return;
    liveMapFlushTimerRef.current = window.setTimeout(() => {
      liveMapFlushTimerRef.current = null;
      const points = pendingLiveMapPointsRef.current;
      pendingLiveMapPointsRef.current = [];
      if (points.length > 0) {
        void window.kafkaApi.sendLiveMapPoints(points);
      }
    }, 250);
  }, [mapFieldMappingKey, props.mapFieldMapping, props.messages, props.mode]);

  useEffect(() => {
    if (!props.selectedMessage) return;
    const selectedKey = `${props.selectedMessage.topic}:${props.selectedMessage.partition}:${props.selectedMessage.offset}:${props.selectedMessage.timestamp}:${mapFieldMappingKey}`;
    if (selectedKey === lastSentSelectedMapMessageRef.current) return;
    lastSentSelectedMapMessageRef.current = selectedKey;
    const point = createLiveMapPoint(props.selectedMessage, selectedPayload, undefined, props.mapFieldMapping) ?? createLiveMapPoint(props.selectedMessage);
    if (point) {
      void window.kafkaApi.sendLiveMapPoints([{ ...point, focus: true }]);
    }
  }, [mapFieldMappingKey, props.mapFieldMapping, props.selectedMessage, selectedPayload]);

  useEffect(() => {
    return () => {
      if (liveMapFlushTimerRef.current !== null) {
        window.clearTimeout(liveMapFlushTimerRef.current);
      }
    };
  }, []);

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

  function toggleMessageChecked(message: ConsumedMessage) {
    const key = getMessageRowKey(message);
    setCheckedMessageKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleVisibleChecked(messages: ConsumedMessage[], checked: boolean) {
    setCheckedMessageKeys((current) => {
      const next = new Set(current);
      messages.forEach((message) => {
        const key = getMessageRowKey(message);
        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
  }

  function toggleValueColumn(path: string) {
    props.onValueColumnPaths(valueColumnPaths.includes(path)
      ? valueColumnPaths.filter((item) => item !== path)
      : [...valueColumnPaths, path]);
  }

  function toggleValueColumnGroup(path: string) {
    setExpandedValueColumnGroups((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function toggleValueColumnGroupSelection(node: ValueColumnTreeNode) {
    const leafPaths = getValueColumnLeafPaths(node);
    const current = new Set(valueColumnPaths);
    const allSelected = leafPaths.every((path) => current.has(path));
    for (const path of leafPaths) {
      if (allSelected) {
        current.delete(path);
      } else {
        current.add(path);
      }
    }
    props.onValueColumnPaths(normalizeValueColumnPaths(Array.from(current)));
  }

  function renderValueColumnNode(node: ValueColumnTreeNode, depth: number) {
    const children = Array.from(node.children.values()).sort((left, right) => left.name.localeCompare(right.name));
    const hasChildren = children.length > 0;
    const isExpanded = valueColumnSearch.trim().length > 0 || expandedValueColumnGroups.has(node.fullPath);
    const leafPaths = hasChildren ? getValueColumnLeafPaths(node) : [];
    const selectedLeafCount = leafPaths.filter((path) => valueColumnPaths.includes(path)).length;
    const isGroupChecked = leafPaths.length > 0 && selectedLeafCount === leafPaths.length;
    const isGroupMixed = selectedLeafCount > 0 && selectedLeafCount < leafPaths.length;
    const hintKey = hasChildren ? getValueColumnGroupHintKey(node.name) : "";

    if (!hasChildren) {
      const path = node.leafPath ?? node.fullPath;
      return (
        <label key={path} className="value-column-tree-row leaf" style={{ paddingLeft: 8 + depth * 28 }}>
          <span className="value-column-tree-indent" />
          <input
            type="checkbox"
            checked={valueColumnPaths.includes(path)}
            onChange={() => toggleValueColumn(path)}
          />
          <span className="value-column-leaf-icon-spacer" />
          <span className="value-column-leaf-name" title={path}>{node.name}</span>
        </label>
      );
    }

    return (
      <div key={node.fullPath} className="value-column-tree-group">
        <div className="value-column-tree-row group" style={{ paddingLeft: 8 + depth * 28 }}>
          <button
            type="button"
            className="value-column-tree-expander"
            onClick={() => toggleValueColumnGroup(node.fullPath)}
            aria-label={isExpanded ? "Collapse group" : "Expand group"}
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <input
            type="checkbox"
            checked={isGroupChecked}
            ref={(input) => {
              if (input) input.indeterminate = isGroupMixed;
            }}
            onChange={() => toggleValueColumnGroupSelection(node)}
          />
          <Folder size={13} />
          <span className="value-column-group-name" title={node.fullPath}>{node.name}</span>
          {hintKey && <span className="value-column-group-hint">{t(props.language, hintKey)}</span>}
          <span className="value-column-group-count">{selectedLeafCount}/{leafPaths.length}</span>
        </div>
        {isExpanded && children.map((child) => renderValueColumnNode(child, depth + 1))}
      </div>
    );
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
      {visibleValueColumnPaths.length > 0 && (
        <div className="value-column-bar">
          <button
            type="button"
            className={showValueColumns ? "value-column-trigger active" : "value-column-trigger"}
            onClick={() => setShowValueColumns((current) => !current)}
          >
            <Columns3 size={14} />
            {t(props.language, "label.valueColumns")}
            {valueColumnPaths.length > 0 && <span>{valueColumnPaths.length}</span>}
          </button>
          {valueColumnPaths.length > 0 && (
            <button type="button" className="ghost compact" onClick={() => props.onValueColumnPaths([])}>
              {t(props.language, "label.clear")}
            </button>
          )}
          {showValueColumns && (
            <div className="value-column-picker">
              {valueColumnPaths.length > 0 && (
                <div className="value-column-selected-list" aria-label={t(props.language, "label.selectedValueColumns")}>
                  {valueColumnPaths.map((path) => (
                    <span className="value-column-chip" key={path} title={path}>
                      <span>{formatValueColumnLabel(path)}</span>
                      <button
                        type="button"
                        onClick={() => toggleValueColumn(path)}
                        title={t(props.language, "title.removeValueColumn")}
                        aria-label={t(props.language, "title.removeValueColumn")}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                className="value-column-search"
                value={valueColumnSearch}
                onChange={(event) => setValueColumnSearch(event.target.value)}
                placeholder={t(props.language, "placeholder.searchValueColumns")}
              />
              <div className="value-column-tree">
                {Array.from(valueColumnTree.children.values())
                  .sort((left, right) => left.name.localeCompare(right.name))
                  .map((node) => renderValueColumnNode(node, 0))}
              </div>
              {filteredValueColumnPaths.length === 0 && (
                <div className="value-column-empty">{t(props.language, "label.noValueColumnsMatched")}</div>
              )}
            </div>
          )}
        </div>
      )}
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
