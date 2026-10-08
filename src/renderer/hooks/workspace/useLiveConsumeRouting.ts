import { useRef, type Dispatch, type SetStateAction } from "react";
import type { WorkspacePaneId } from "../../uiTypes";
import { getConsumeTaskKey, getStreamingTopicKey } from "../../workspaceState";

type StreamingTopicsByServer = Record<string, string[]>;

type UseLiveConsumeRoutingOptions = {
  setStreamingTopicsByServer: Dispatch<SetStateAction<StreamingTopicsByServer>>;
  setActiveConsumeTaskKeys: Dispatch<SetStateAction<string[]>>;
};

function getLiveMessageTargetKey(serverId: string, topic: string, consumerId: string) {
  return `${serverId}:${topic}:${consumerId}`;
}

export function useLiveConsumeRouting({ setStreamingTopicsByServer, setActiveConsumeTaskKeys }: UseLiveConsumeRoutingOptions) {
  const messageTargetByTopicRef = useRef<Record<string, WorkspacePaneId>>({});
  const consumerIdByUiKeyRef = useRef<Record<string, string>>({});
  const pendingLiveTasksRef = useRef(new Map<string, string>());

  function getMessageTarget(serverId: string, topic: string, consumerId?: string): WorkspacePaneId | undefined {
    if (consumerId) {
      return messageTargetByTopicRef.current[getLiveMessageTargetKey(serverId, topic, consumerId)];
    }
    return messageTargetByTopicRef.current[`${serverId}:${topic}`];
  }

  function setMessageTarget(serverId: string, topic: string, consumerId: string, pane: WorkspacePaneId) {
    messageTargetByTopicRef.current[getLiveMessageTargetKey(serverId, topic, consumerId)] = pane;
    messageTargetByTopicRef.current[`${serverId}:${topic}`] = pane;
  }

  function clearMessageTarget(serverId: string, topic: string, consumerId?: string) {
    if (consumerId) {
      delete messageTargetByTopicRef.current[getLiveMessageTargetKey(serverId, topic, consumerId)];
    } else {
      for (const key of Object.keys(messageTargetByTopicRef.current)) {
        if (key.startsWith(`${serverId}:${topic}:`)) delete messageTargetByTopicRef.current[key];
      }
    }
    delete messageTargetByTopicRef.current[`${serverId}:${topic}`];
  }

  function setStartedConsumer(serverId: string, topic: string, pane: WorkspacePaneId, consumerId: string) {
    consumerIdByUiKeyRef.current[getConsumeTaskKey(pane, serverId, topic)] = consumerId;
    setMessageTarget(serverId, topic, consumerId, pane);
  }

  function getStopConsumerId(serverId: string, topic: string, pane?: WorkspacePaneId) {
    if (!pane) return undefined;
    return consumerIdByUiKeyRef.current[getConsumeTaskKey(pane, serverId, topic)];
  }

  function clearStoppedConsumer(serverId: string, topic: string, pane: WorkspacePaneId) {
    const consumerId = getStopConsumerId(serverId, topic, pane);
    if (consumerId) clearMessageTarget(serverId, topic, consumerId);
    delete consumerIdByUiKeyRef.current[getConsumeTaskKey(pane, serverId, topic)];
  }

  function retargetLiveTopic(serverId: string, topic: string, fromPane: WorkspacePaneId, toPane: WorkspacePaneId) {
    const fromUiKey = getConsumeTaskKey(fromPane, serverId, topic);
    const toUiKey = getConsumeTaskKey(toPane, serverId, topic);
    const consumerId = consumerIdByUiKeyRef.current[fromUiKey];
    if (!consumerId) return;
    consumerIdByUiKeyRef.current[toUiKey] = consumerId;
    delete consumerIdByUiKeyRef.current[fromUiKey];
    setMessageTarget(serverId, topic, consumerId, toPane);
    if (pendingLiveTasksRef.current.get(fromUiKey) === consumerId) {
      pendingLiveTasksRef.current.delete(fromUiKey);
      pendingLiveTasksRef.current.set(toUiKey, consumerId);
      setActiveConsumeTaskKeys((current) => [...new Set([...current.filter((key) => key !== fromUiKey), toUiKey])]);
    }
    setStreamingTopicsByServer((current) => {
      const topicKey = getStreamingTopicKey(fromPane, topic);
      const nextTopicKey = getStreamingTopicKey(toPane, topic);
      const topics = current[serverId] ?? [];
      return {
        ...current,
        [serverId]: topics.map((item) => item === topicKey ? nextTopicKey : item)
      };
    });
  }

  return {
    messageTargetByTopicRef,
    consumerIdByUiKeyRef,
    pendingLiveTasksRef,
    getMessageTarget,
    setStartedConsumer,
    getStopConsumerId,
    clearStoppedConsumer,
    clearMessageTarget,
    retargetLiveTopic
  };
}
