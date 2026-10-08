import { useMessageFlowActions } from "../actions/useMessageFlowActions";

type MessageFlowParams = Parameters<typeof useMessageFlowActions>[0];

export type WorkspaceControllerMessageFlowParams = {
  consume: Pick<
    MessageFlowParams["consume"],
    | "kafkaApi"
    | "selectedServerId"
    | "selectedTopic"
    | "consumeStates"
    | "selectedDefaultConsumeState"
    | "runWorkspaceTask"
    | "updateConsumeStateFor"
    | "setActiveConsumeTaskKeys"
    | "setStreamingTopicsByServer"
    | "setStartedConsumer"
    | "pendingLiveTasksRef"
    | "getStopConsumerId"
    | "getMessageTarget"
    | "clearStoppedConsumer"
    | "clearMessageTarget"
    | "setStatus"
  >;
  exportMessages: MessageFlowParams["exportMessages"];
  produce: MessageFlowParams["produce"];
};

export function useWorkspaceControllerMessageFlow(params: WorkspaceControllerMessageFlowParams) {
  const { consumeActions, exportActions, produceActions } = useMessageFlowActions({
    consume: params.consume,
    exportMessages: params.exportMessages,
    produce: params.produce
  });

  return {
    ...consumeActions,
    ...exportActions,
    ...produceActions
  };
}
