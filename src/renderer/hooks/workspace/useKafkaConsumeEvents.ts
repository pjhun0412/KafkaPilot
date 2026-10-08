import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { KafkaApi } from "../../../shared/types";
import type { TopicConsumeState, WorkspacePaneId } from "../../uiTypes";

type ConsumeStatesByServer = Record<string, Record<string, TopicConsumeState>>;

type KafkaConsumeEventsParams = {
  kafkaApi: KafkaApi | undefined;
  selectedServerId: string;
  consumeDefaultsByServer: Record<string, Partial<TopicConsumeState>>;
  getDefaultConsumeState: (serverId?: string, topic?: string) => TopicConsumeState;
  getMessageTarget: (serverId: string, topic: string, consumerId?: string) => WorkspacePaneId | undefined;
  mergeConsumeState: (
    states: ConsumeStatesByServer,
    serverId: string,
    topic: string,
    patch: Partial<TopicConsumeState>
  ) => ConsumeStatesByServer;
  setConsumeStatesByServer: Dispatch<SetStateAction<ConsumeStatesByServer>>;
  setSplitConsumeStatesByServer: Dispatch<SetStateAction<ConsumeStatesByServer>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useKafkaConsumeEvents({
  kafkaApi,
  selectedServerId,
  consumeDefaultsByServer,
  getDefaultConsumeState,
  getMessageTarget,
  mergeConsumeState,
  setConsumeStatesByServer,
  setSplitConsumeStatesByServer,
  setStatus
}: KafkaConsumeEventsParams) {
  useEffect(() => {
    if (!kafkaApi) {
      return;
    }
    const offMessage = kafkaApi.onConsumeMessage((message) => {
      const serverId = message.serverId ?? selectedServerId;
      if (!serverId) return;
      const targetPane = getMessageTarget(serverId, message.topic, message.consumerId);
      if (!targetPane) return;
      const applyMessage = (current: ConsumeStatesByServer) => {
        const serverStates = current[serverId] ?? {};
        const previous = serverStates[message.topic] ?? getDefaultConsumeState(serverId, message.topic);
        const maxMessages = previous.maxMessages;
        return mergeConsumeState(current, serverId, message.topic, {
          messages: [message, ...previous.messages].slice(0, maxMessages),
          selectedMessage: previous.selectedMessage ?? message,
          liveRecordCount: previous.liveRecordPath ? previous.liveRecordCount + 1 : previous.liveRecordCount
        });
      };
      if (targetPane === "split") {
        setSplitConsumeStatesByServer(applyMessage);
      } else {
        setConsumeStatesByServer(applyMessage);
      }
    });
    const offError = kafkaApi.onConsumeError((error) => {
      setStatus(error);
    });
    return () => {
      offMessage();
      offError();
    };
  }, [
    kafkaApi,
    selectedServerId,
    consumeDefaultsByServer,
    getDefaultConsumeState,
    getMessageTarget,
    mergeConsumeState,
    setConsumeStatesByServer,
    setSplitConsumeStatesByServer,
    setStatus
  ]);
}
