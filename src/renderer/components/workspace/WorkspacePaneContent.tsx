import { useEffect, useRef, useState } from "react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import type {
  BrokerSummary,
  ConsumedMessage,
  ConsumerGroupLagDetail,
  ConsumerGroupOffsetResetRequest,
  ConsumerGroupSummary,
  ManualAvroSchema,
  MessageExportFormat,
  ProduceTemplatePreference,
  TopicDetail,
  TopicSummary
} from "../../../shared/types";
import type { AppLanguage } from "../../i18n";
import { getDefaultTimeRangeValues } from "../../consumeConfig";
import type { ProduceDraftOverride } from "../../hooks/actions/useProduceActions";
import { parseProduceDurationMs, renderProduceTemplateDraft, type ProduceIntervalRequest } from "../../produceTemplate";
import type { ReplayDraft, ReplayPayloadOptions, ReplayTargetServer } from "../../replayTypes";
import type { OffsetOrder, TopicConsumeState, View } from "../../uiTypes";
import { ConsumePanel } from "./consume/ConsumePanel";
import { ConsumerGroupsPanel } from "./groups/ConsumerGroupsPanel";
import { ProducePanel } from "./produce/ProducePanel";
import { BrokersPanel, ServerTopicsPanel, TopicPanel, TopicSettingsPanel } from "./topics";

type WorkspacePaneContentProps = {
  className?: string;
  serverId: string;
  serverName?: string;
  view: View;
  topic: string;
  openedTopicTabs: string[];
  language: AppLanguage;
  isConnected: boolean;
  detail: TopicDetail | null;
  topics: TopicSummary[];
  replayTargets: ReplayTargetServer[];
  brokers: BrokerSummary[];
  groups: ConsumerGroupSummary[];
  favoriteTopicNames: string[];
  selectedTopics: string[];
  topicSorting?: SortingState;
  onTopicSortingChange?: OnChangeFn<SortingState>;
  selectedGroupId: string;
  selectedGroupLag: ConsumerGroupLagDetail | null;
  groupDetailsById: Record<string, ConsumerGroupLagDetail>;
  consumeState: TopicConsumeState;
  isConsuming: boolean;
  isQuerying: boolean;
  messagePaneHeight: number;
  manualAvroSchemas: Record<string, ManualAvroSchema>;
  produceKey: string;
  produceHeaders: string;
  produceValue: string;
  produceTemplates: ProduceTemplatePreference[];
  onOpenTopic: (topic: string) => void;
  onSelectTopic: (topic: string) => void;
  onToggleTopicSelected: (topic: string) => void;
  onToggleAllTopicsSelected: (topics: string[]) => void;
  onCopySelectedTopics: () => void;
  onCreateTopic: () => void;
  onClearTopicMessages: () => void;
  onPurgeSelectedTopics: () => void;
  onDeleteSelectedTopics: () => void;
  onToggleTopicFavorite: (topic: string) => void;
  onSelectGroup: (groupId: string) => void;
  onDeleteConsumerGroups: (groupIds: string[]) => void;
  onResetConsumerGroupOffsets: (request: ConsumerGroupOffsetResetRequest) => Promise<void>;
  onBackGroup: () => void;
  onRefreshGroups: () => void;
  onRefreshGroupDetail: () => void;
  onUpdateConsume: (patch: Partial<TopicConsumeState>) => void;
  onOffsetOrder: (value: OffsetOrder) => void;
  onOffsetPage: (direction: "prev" | "next") => void;
  onStartConsume: () => void;
  onStopConsume: () => void;
  onSendToProduce: (message: ConsumedMessage, targetTopic?: string, targetServerId?: string, payload?: ReplayPayloadOptions) => void;
  onReplayMessage: (serverId: string, topic: string, draft: ReplayDraft) => Promise<void>;
  onConnectReplayServer: (serverId: string) => Promise<boolean>;
  onExport: (format: MessageExportFormat, messages: ConsumedMessage[]) => void;
  onExportAll: (format: MessageExportFormat) => void;
  onMessagePaneHeight: (value: number) => void;
  onProduceKey: (value: string) => void;
  onProduceHeaders: (value: string) => void;
  onProduceValue: (value: string) => void;
  onProduceTemplates: (templates: ProduceTemplatePreference[]) => void;
  onProduce: () => void;
  onProduceDraft: (draft: ProduceDraftOverride) => Promise<void>;
  onProduceIntervalActivity?: (topic: string, running: boolean) => void;
};

const emptyProduceIntervalState = {
  error: "",
  isRunning: false,
  sentCount: 0,
  startedAt: 0
};

export function WorkspacePaneContent(props: WorkspacePaneContentProps) {
  const [produceIntervalConfig, setProduceIntervalConfig] = useState({
    durationText: "5m",
    intervalMs: 1000,
    mode: "single" as "single" | "interval",
    stopMode: "count" as "count" | "duration",
    totalCount: 10
  });
  const [produceIntervalStates, setProduceIntervalStates] = useState<Record<string, typeof emptyProduceIntervalState>>({});
  const produceIntervalRunRef = useRef<Record<string, symbol>>({});
  const produceIntervalKey = `${props.serverId}\u0000${props.topic}`;
  const produceIntervalState = produceIntervalStates[produceIntervalKey] ?? emptyProduceIntervalState;

  useEffect(() => () => {
    Object.keys(produceIntervalRunRef.current).forEach((key) => {
      delete produceIntervalRunRef.current[key];
    });
  }, []);

  useEffect(() => {
    const allowedKeys = new Set(props.openedTopicTabs.map((topic) => `${props.serverId}\u0000${topic}`));
    Object.keys(produceIntervalRunRef.current).forEach((key) => {
      if (!allowedKeys.has(key)) {
        delete produceIntervalRunRef.current[key];
        const topic = key.split("\u0000")[1] ?? "";
        props.onProduceIntervalActivity?.(topic, false);
      }
    });
    setProduceIntervalStates((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (!allowedKeys.has(key)) delete next[key];
      });
      return next;
    });
  }, [props.openedTopicTabs, props.onProduceIntervalActivity, props.serverId]);

  async function startProduceInterval(request: ProduceIntervalRequest) {
    const runKey = produceIntervalKey;
    const runTopic = props.topic;
    const delay = Math.max(100, Math.floor(request.intervalMs || 100));
    const count = request.stopMode === "count" ? Math.max(1, Math.min(100000, Math.floor(request.count || 1))) : Number.POSITIVE_INFINITY;
    const durationMs = request.stopMode === "duration" ? parseProduceDurationMs(request.durationText) : 0;
    const startedAt = Date.now();
    const runId = Symbol(runKey);
    produceIntervalRunRef.current[runKey] = runId;
    const isCurrentRun = () => produceIntervalRunRef.current[runKey] === runId;
    props.onProduceIntervalActivity?.(runTopic, true);
    setProduceIntervalStates((current) => ({
      ...current,
      [runKey]: { error: "", isRunning: true, sentCount: 0, startedAt }
    }));

    for (let index = 1; index <= count && isCurrentRun(); index += 1) {
      if (durationMs > 0 && Date.now() - startedAt >= durationMs) break;
      try {
        await props.onProduceDraft(renderProduceTemplateDraft(request.draft, index));
        if (!isCurrentRun()) return;
        setProduceIntervalStates((current) => ({
          ...current,
          [runKey]: { ...(current[runKey] ?? emptyProduceIntervalState), sentCount: index }
        }));
      } catch (error) {
        if (!isCurrentRun()) return;
        delete produceIntervalRunRef.current[runKey];
        props.onProduceIntervalActivity?.(runTopic, false);
        setProduceIntervalStates((current) => ({
          ...current,
          [runKey]: {
            ...(current[runKey] ?? emptyProduceIntervalState),
            error: error instanceof Error ? error.message : String(error),
            isRunning: false
          }
        }));
        return;
      }
      if (index < count && isCurrentRun()) {
        if (durationMs > 0 && Date.now() - startedAt + delay > durationMs) break;
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }
    if (!isCurrentRun()) return;
    delete produceIntervalRunRef.current[runKey];
    props.onProduceIntervalActivity?.(runTopic, false);
    setProduceIntervalStates((current) => ({
      ...current,
      [runKey]: { ...(current[runKey] ?? emptyProduceIntervalState), isRunning: false }
    }));
  }

  function stopProduceInterval() {
    delete produceIntervalRunRef.current[produceIntervalKey];
    props.onProduceIntervalActivity?.(props.topic, false);
    setProduceIntervalStates((current) => ({
      ...current,
      [produceIntervalKey]: { ...(current[produceIntervalKey] ?? emptyProduceIntervalState), isRunning: false }
    }));
  }

  return (
    <div className={["content-grid", props.className].filter(Boolean).join(" ")}>
      {props.view === "brokers" && <BrokersPanel serverId={props.serverId} brokers={props.brokers} />}
      {props.view === "topics" && (
        <ServerTopicsPanel
          topics={props.topics}
          isConnected={props.isConnected}
          favoriteTopicNames={props.favoriteTopicNames}
          selectedTopics={props.selectedTopics}
          sorting={props.topicSorting}
          onSortingChange={props.onTopicSortingChange}
          onOpen={props.onOpenTopic}
          onSelect={props.onSelectTopic}
          onToggleSelected={props.onToggleTopicSelected}
          onToggleAllSelected={props.onToggleAllTopicsSelected}
          onCopySelected={props.onCopySelectedTopics}
          onCreateTopic={props.onCreateTopic}
          onPurgeSelected={props.onPurgeSelectedTopics}
          onDeleteSelected={props.onDeleteSelectedTopics}
          onToggleFavorite={props.onToggleTopicFavorite}
        />
      )}
      {props.view === "consumers" && (
        <ConsumerGroupsPanel
          serverId={props.serverId}
          groups={props.groups}
          selectedGroupId={props.selectedGroupId}
          detail={props.selectedGroupLag}
          detailsByGroup={props.groupDetailsById}
          onSelectGroup={props.onSelectGroup}
          onDeleteGroups={props.onDeleteConsumerGroups}
          onResetOffsets={props.onResetConsumerGroupOffsets}
          onBack={props.onBackGroup}
          onRefresh={props.onRefreshGroups}
          onRefreshDetail={props.onRefreshGroupDetail}
        />
      )}
      {props.view === "info" && <TopicPanel detail={props.detail} onClearMessages={props.onClearTopicMessages} />}
      {props.view === "settings" && <TopicSettingsPanel serverId={props.serverId} topic={props.topic} />}
      {props.view === "consume" && (
        <ConsumePanel
          messages={props.consumeState.messages}
          serverId={props.serverId}
          serverName={props.serverName ?? props.serverId}
          topic={props.topic}
          topics={props.topics}
          replayTargets={props.replayTargets}
          language={props.language}
          selectedMessage={props.consumeState.selectedMessage}
          mode={props.consumeState.mode}
          offsetOrder={props.consumeState.offsetOrder}
          isConsuming={props.isConsuming}
          offset={props.consumeState.offset}
          limit={props.consumeState.limit}
          partition={props.consumeState.partition}
          timeStart={props.consumeState.timeStart}
          timeEnd={props.consumeState.timeEnd}
          filterText={props.consumeState.filterText}
          filterField={props.consumeState.filterField}
          filterMode={props.consumeState.filterMode}
          inspectorMode={props.consumeState.inspectorMode}
          inspectorCollapsed={props.consumeState.inspectorCollapsed}
          isQuerying={props.isQuerying}
          autoScroll={props.consumeState.autoScroll}
          maxMessages={props.consumeState.maxMessages}
          liveRecordEnabled={props.consumeState.liveRecordEnabled}
          liveRecordPath={props.consumeState.liveRecordPath}
          liveRecordCount={props.consumeState.liveRecordCount}
          keyFormat={props.consumeState.keyFormat}
          valueFormat={props.consumeState.valueFormat}
          payloadEncoding={props.consumeState.payloadEncoding}
          valueColumnPaths={props.consumeState.valueColumnPaths}
          mapFieldMapping={props.consumeState.mapFieldMapping}
          offsetPagination={props.consumeState.offsetPagination}
          messagePaneHeight={props.messagePaneHeight}
          onMode={(mode) => props.onUpdateConsume({
            mode,
            offsetPagination: null,
            ...(mode === "timeRange" ? getDefaultTimeRangeValues(props.consumeState) : {})
          })}
          onOffset={(offset) => props.onUpdateConsume({ offset, offsetPagination: null })}
          onOffsetOrder={props.onOffsetOrder}
          onLimit={(limit) => props.onUpdateConsume({ limit, offsetPagination: null })}
          onPartition={(partition) => props.onUpdateConsume({ partition, offsetPagination: null })}
          onTimeStart={(timeStart) => props.onUpdateConsume({ timeStart })}
          onTimeEnd={(timeEnd) => props.onUpdateConsume({ timeEnd })}
          onFilterText={(filterText) => props.onUpdateConsume({ filterText })}
          onFilterField={(filterField) => props.onUpdateConsume({ filterField })}
          onFilterMode={(filterMode) => props.onUpdateConsume({ filterMode })}
          onInspectorMode={(inspectorMode) => props.onUpdateConsume({ inspectorMode })}
          onInspectorCollapsed={(inspectorCollapsed) => props.onUpdateConsume({ inspectorCollapsed })}
          onClearFilter={() => props.onUpdateConsume({ filterText: "", filterField: "all", filterMode: "hide" })}
          onApplyFilter={(filterText) => props.onUpdateConsume({ filterText, filterField: "all" })}
          onAutoScroll={(autoScroll) => props.onUpdateConsume({ autoScroll })}
          onMaxMessages={(maxMessages) => props.onUpdateConsume({ maxMessages })}
          onLiveRecordEnabled={(liveRecordEnabled) => props.onUpdateConsume({ liveRecordEnabled })}
          onKeyFormat={(keyFormat) => props.onUpdateConsume({ keyFormat })}
          onValueFormat={(valueFormat) => props.onUpdateConsume({ valueFormat })}
          onPayloadEncoding={(payloadEncoding) => props.onUpdateConsume({ payloadEncoding })}
          onValueColumnPaths={(valueColumnPaths) => props.onUpdateConsume({ valueColumnPaths })}
          onMapFieldMapping={(mapFieldMapping) => props.onUpdateConsume({ mapFieldMapping })}
          onPagePrev={() => props.onOffsetPage("prev")}
          onPageNext={() => props.onOffsetPage("next")}
          onSelectMessage={(selectedMessage) => props.onUpdateConsume({ selectedMessage })}
          onMessagePaneHeight={props.onMessagePaneHeight}
          onSendToProduce={props.onSendToProduce}
          onReplayMessage={props.onReplayMessage}
          onConnectReplayServer={props.onConnectReplayServer}
          onExport={props.onExport}
          onExportAll={props.onExportAll}
          onStart={props.onStartConsume}
          onStop={props.onStopConsume}
        />
      )}
      {props.view === "produce" && (
        <ProducePanel
          topic={props.topic}
          keyText={props.produceKey}
          headers={props.produceHeaders}
          value={props.produceValue}
          templates={props.produceTemplates}
          hasAvroSchema={Boolean(props.manualAvroSchemas[props.topic])}
          avroEncoding={props.manualAvroSchemas[props.topic]?.encoding}
          onKey={props.onProduceKey}
          onHeaders={props.onProduceHeaders}
          onValue={props.onProduceValue}
          onTemplates={props.onProduceTemplates}
          onProduce={props.onProduce}
          onProduceDraft={props.onProduceDraft}
          intervalConfig={produceIntervalConfig}
          intervalState={produceIntervalState}
          onIntervalConfig={setProduceIntervalConfig}
          onStartInterval={startProduceInterval}
          onStopInterval={stopProduceInterval}
        />
      )}
    </div>
  );
}
