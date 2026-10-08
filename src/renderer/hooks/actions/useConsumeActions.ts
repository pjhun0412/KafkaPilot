import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { KafkaApi } from "../../../shared/types";
import type { TopicConsumeState, WorkspaceActionTarget, WorkspacePaneId } from "../../uiTypes";
import { buildOffsetPagination, getOffsetPageLimit } from "../../consumeConfig";
import { workspaceMessages } from "../../workspaceMessages";
import { getConsumeTaskKey } from "../../workspaceState";
import {
  addStreamingTopic,
  getOptionalPartition,
  getRequiredPartition,
  orderConsumedMessages,
  removeStreamingTopic,
  type StreamingTopicsByServer
} from "./consumeActionUtils";

type ConsumeStatesByTopic = Record<string, TopicConsumeState>;

type ConsumeActionsParams = {
  kafkaApi: KafkaApi | undefined;
  selectedServerId: string;
  selectedTopic: string;
  consumeStates: ConsumeStatesByTopic;
  selectedDefaultConsumeState: TopicConsumeState;
  runWorkspaceTask: <T>(target: WorkspaceActionTarget, label: string, task: () => Promise<T>, options?: { trackConsumeTask?: boolean }) => Promise<T>;
  pendingLiveTasksRef: MutableRefObject<Map<string, string>>;
  updateConsumeStateFor: (serverId: string, topic: string, patch: Partial<TopicConsumeState>, pane?: WorkspacePaneId) => void;
  setActiveConsumeTaskKeys: Dispatch<SetStateAction<string[]>>;
  setStreamingTopicsByServer: Dispatch<SetStateAction<StreamingTopicsByServer>>;
  setStartedConsumer: (serverId: string, topic: string, pane: WorkspacePaneId, consumerId: string) => void;
  getStopConsumerId: (serverId: string, topic: string, pane?: WorkspacePaneId) => string | undefined;
  getMessageTarget: (serverId: string, topic: string, consumerId?: string) => WorkspacePaneId | undefined;
  clearStoppedConsumer: (serverId: string, topic: string, pane: WorkspacePaneId) => void;
  clearMessageTarget: (serverId: string, topic: string, consumerId?: string) => void;
  setStatus: (status: string) => void;
};

export function useConsumeActions({
  kafkaApi,
  selectedServerId,
  selectedTopic,
  consumeStates,
  selectedDefaultConsumeState,
  runWorkspaceTask,
  pendingLiveTasksRef,
  updateConsumeStateFor,
  setActiveConsumeTaskKeys,
  setStreamingTopicsByServer,
  setStartedConsumer,
  getStopConsumerId,
  getMessageTarget,
  clearStoppedConsumer,
  clearMessageTarget,
  setStatus
}: ConsumeActionsParams) {
  const liveSessionsRef = useRef(new Map<string, { serverId: string; topic: string }>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const [consumerId, target] of liveSessionsRef.current) {
        const pane = getMessageTarget(target.serverId, target.topic, consumerId);
        if (pane) clearStoppedConsumer(target.serverId, target.topic, pane);
        void kafkaApi?.stopConsume({ ...target, consumerId }).catch(() => undefined);
      }
      liveSessionsRef.current.clear();
    };
  }, [kafkaApi]);

  async function startConsume() {
    if (!kafkaApi || !selectedServerId || !selectedTopic) return;
    const state = consumeStates[selectedTopic] ?? selectedDefaultConsumeState;
    await startConsumeFor(selectedServerId, selectedTopic, state, "primary");
  }

  async function consumeOffsetPageFor(
    serverId: string,
    topic: string,
    state: TopicConsumeState,
    pageOffset: string,
    pageIndex: number,
    prevOffsets: string[],
    endOffsetExclusive: string | undefined,
    pane: WorkspacePaneId = "primary"
  ) {
    if (!kafkaApi) return;
    const taskKey = getConsumeTaskKey(pane, serverId, topic);
    const partition = getRequiredPartition(state);
    const pageLimit = getOffsetPageLimit(state, pageIndex);
    if (pageLimit <= 0) return;
    setActiveConsumeTaskKeys((current) => current.includes(taskKey) ? current : [...current, taskKey]);
    try {
      updateConsumeStateFor(serverId, topic, { messages: [], selectedMessage: null }, pane);
      const result = await runWorkspaceTask({ pane, serverId, topic }, "Loading messages...", () =>
        kafkaApi.consumeFromOffset({
          serverId,
          topic,
          partition,
          offset: pageOffset,
          limit: pageLimit,
          order: state.offsetOrder,
          endOffsetExclusive
        })
      );
      const items = result.messages;
      const orderedItems = orderConsumedMessages(items, state.offsetOrder);
      const snapshotEndOffsetExclusive = state.offsetOrder === "desc"
        ? endOffsetExclusive ?? result.endOffsetExclusive
        : result.endOffsetExclusive ?? endOffsetExclusive;
      const pagination = buildOffsetPagination({
        state,
        pageIndex,
        pageLimit,
        pageOffset,
        prevOffsets,
        messages: orderedItems,
        endOffsetExclusive: snapshotEndOffsetExclusive
      });
      updateConsumeStateFor(serverId, topic, {
        messages: orderedItems,
        selectedMessage: orderedItems[0] ?? null,
        offsetPagination: pagination
      }, pane);
    } finally {
      setActiveConsumeTaskKeys((current) => current.filter((key) => key !== taskKey));
    }
  }

  async function moveOffsetPageFor(
    serverId: string,
    topic: string,
    state: TopicConsumeState,
    direction: "prev" | "next",
    pane: WorkspacePaneId = "primary"
  ) {
    const pagination = state.offsetPagination;
    if (!pagination) return;
    if (direction === "next") {
      if (!pagination.hasNext || !pagination.nextOffset) return;
      await consumeOffsetPageFor(
        serverId,
        topic,
        state,
        pagination.nextOffset,
        pagination.pageIndex + 1,
        [...pagination.prevOffsets, pagination.currentOffset],
        pagination.endOffsetExclusive,
        pane
      );
      return;
    }
    const previousOffset = pagination.prevOffsets[pagination.prevOffsets.length - 1];
    if (previousOffset === undefined) return;
    await consumeOffsetPageFor(
      serverId,
      topic,
      state,
      previousOffset,
      Math.max(0, pagination.pageIndex - 1),
      pagination.prevOffsets.slice(0, -1),
      pagination.endOffsetExclusive,
      pane
    );
  }

  async function startConsumeFor(serverId: string, topic: string, state: TopicConsumeState, pane: WorkspacePaneId = "primary") {
    if (!kafkaApi || !serverId || !topic) return;
    if (state.mode !== "offset" && state.mode !== "timeRange" && getStopConsumerId(serverId, topic, pane)) return;
    const taskKey = getConsumeTaskKey(pane, serverId, topic);
    let liveConsumerId: string | undefined;
    setActiveConsumeTaskKeys((current) => current.includes(taskKey) ? current : [...current, taskKey]);
    const partition = getRequiredPartition(state);
    try {
      if (state.mode === "offset") {
        await consumeOffsetPageFor(serverId, topic, state, state.offset, 0, [], undefined, pane);
        return;
      }
      if (state.mode === "timeRange") {
        const startTimestamp = state.timeStart ? new Date(state.timeStart).getTime() : NaN;
        const endTimestamp = state.timeEnd ? new Date(state.timeEnd).getTime() : NaN;
        if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
          setStatus("Start and end datetime are required.");
          return;
        }
        const items = await runWorkspaceTask({ pane, serverId, topic }, "Loading time range messages...", () =>
          kafkaApi.consumeTimeRange({
            serverId,
            topic,
            partition: getOptionalPartition(state),
            startTimestamp,
            endTimestamp,
            limit: state.limit
          })
        );
        const orderedItems = orderConsumedMessages(items, state.offsetOrder);
        updateConsumeStateFor(serverId, topic, { messages: orderedItems, selectedMessage: orderedItems[0] ?? null, offsetPagination: null }, pane);
        return;
      }
      const consumerId = crypto.randomUUID();
      liveConsumerId = consumerId;
      pendingLiveTasksRef.current.set(taskKey, consumerId);
      liveSessionsRef.current.set(consumerId, { serverId, topic });
      // Track connection attempts too: closing or moving a tab must affect a pending start.
      setStartedConsumer(serverId, topic, pane, consumerId);
      setStreamingTopicsByServer((current) => addStreamingTopic(current, serverId, topic, pane));
      const result = await runWorkspaceTask({ pane, serverId, topic }, "Starting live consume...", () =>
        kafkaApi.startConsume({
          serverId,
          topic,
          consumerId,
          fromBeginning: false,
          partition: getOptionalPartition(state),
          record: state.liveRecordEnabled
        }), { trackConsumeTask: false }
      );
      const targetPane = getMessageTarget(serverId, topic, consumerId);
      if (!mountedRef.current || !targetPane) {
        await kafkaApi.stopConsume({ serverId, topic, consumerId });
        liveSessionsRef.current.delete(consumerId);
        return;
      }
      updateConsumeStateFor(serverId, topic, {
        offsetPagination: null,
        liveRecordPath: result.liveRecordPath ?? "",
        liveRecordCount: 0
      }, targetPane);
      setStatus(workspaceMessages.consumeReset);
    } catch (error) {
      if (liveConsumerId) {
        const targetPane = getMessageTarget(serverId, topic, liveConsumerId);
        if (targetPane) {
          clearStoppedConsumer(serverId, topic, targetPane);
          setStreamingTopicsByServer((current) => removeStreamingTopic(current, serverId, topic, targetPane, () => undefined));
        }
        liveSessionsRef.current.delete(liveConsumerId);
      }
      throw error;
    } finally {
      if (!liveConsumerId) {
        setActiveConsumeTaskKeys((current) => current.filter((key) => key !== taskKey));
      } else {
        // Pane moves change task ownership while the start promise is pending.
        for (const [pendingKey, pendingId] of pendingLiveTasksRef.current) {
          if (pendingId !== liveConsumerId) continue;
          pendingLiveTasksRef.current.delete(pendingKey);
          setActiveConsumeTaskKeys((current) => current.filter((key) => key !== pendingKey));
        }
      }
    }
  }

  async function stopConsume(serverId = selectedServerId, topic = selectedTopic, pane?: WorkspacePaneId) {
    if (!kafkaApi) return;
    const consumerId = getStopConsumerId(serverId, topic, pane);
    if (pane && !consumerId) return;
    const targetPane = pane ?? "primary";
    // Invalidate before awaiting IPC, so an older start/stop cannot alter a restarted session.
    const panes: WorkspacePaneId[] = pane ? [pane] : ["primary", "split"];
    for (const stoppedPane of panes) {
      const stoppedId = getStopConsumerId(serverId, topic, stoppedPane);
      if (stoppedId) liveSessionsRef.current.delete(stoppedId);
      clearStoppedConsumer(serverId, topic, stoppedPane);
      pendingLiveTasksRef.current.delete(getConsumeTaskKey(stoppedPane, serverId, topic));
    }
    setActiveConsumeTaskKeys((current) => current.filter((key) => !panes.some((stoppedPane) => key === getConsumeTaskKey(stoppedPane, serverId, topic))));
    setStreamingTopicsByServer((current) => removeStreamingTopic(current, serverId, topic, pane, () => undefined));
    const stopTaskKey = getConsumeTaskKey(targetPane, serverId, topic);
    const stopTaskId = crypto.randomUUID();
    pendingLiveTasksRef.current.set(stopTaskKey, stopTaskId);
    setActiveConsumeTaskKeys((current) => current.includes(stopTaskKey) ? current : [...current, stopTaskKey]);
    try {
      await runWorkspaceTask({ pane: targetPane, serverId, topic }, "Stopping live consume...", () =>
        kafkaApi.stopConsume({ serverId, topic, consumerId }), { trackConsumeTask: false }
      );
    } finally {
      if (pendingLiveTasksRef.current.get(stopTaskKey) === stopTaskId) {
        pendingLiveTasksRef.current.delete(stopTaskKey);
        setActiveConsumeTaskKeys((current) => current.filter((key) => key !== stopTaskKey));
      }
    }
  }

  return {
    startConsume,
    moveOffsetPageFor,
    startConsumeFor,
    stopConsume
  };
}
