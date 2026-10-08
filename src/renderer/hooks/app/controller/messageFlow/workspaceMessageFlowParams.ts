import type { useWorkspaceControllerStateBindings } from "../useWorkspaceControllerStateBindings";
import type { WorkspaceControllerMessageFlowParams } from "../useWorkspaceControllerMessageFlow";

type ControllerState = ReturnType<typeof useWorkspaceControllerStateBindings>;

type MessageFlowDerived = Pick<
  WorkspaceControllerMessageFlowParams["consume"],
  "consumeStates" | "selectedDefaultConsumeState" | "selectedTopic"
>;

type MessageFlowActions = Pick<WorkspaceControllerMessageFlowParams["produce"], "setView">;

export function createWorkspaceMessageFlowParams({
  state,
  derived,
  actions
}: {
  state: ControllerState;
  derived: MessageFlowDerived;
  actions: MessageFlowActions;
}): WorkspaceControllerMessageFlowParams {
  return {
    consume: {
      kafkaApi: window.kafkaApi,
      selectedServerId: state.selectedServerId,
      selectedTopic: derived.selectedTopic,
      consumeStates: derived.consumeStates,
      selectedDefaultConsumeState: derived.selectedDefaultConsumeState,
      runWorkspaceTask: state.runWorkspaceTask,
      pendingLiveTasksRef: state.pendingLiveTasksRef,
      updateConsumeStateFor: state.updateConsumeStateFor,
      setActiveConsumeTaskKeys: state.setActiveConsumeTaskKeys,
      setStreamingTopicsByServer: state.setStreamingTopicsByServer,
      setStartedConsumer: state.setStartedConsumer,
      getStopConsumerId: state.getStopConsumerId,
      getMessageTarget: state.getMessageTarget,
      clearStoppedConsumer: state.clearStoppedConsumer,
      clearMessageTarget: state.clearMessageTarget,
      setStatus: state.setStatus
    },
    exportMessages: {
      kafkaApi: window.kafkaApi,
      selectedTopic: derived.selectedTopic,
      exportFormatTemplate: state.exportFormatTemplate,
      runTask: state.runTask,
      runPaneTask: state.runPaneTask,
      showPaneToast: state.showPaneToast,
      setLoading: state.setLoading,
      setStatus: state.setStatus,
      setToast: state.setToast,
      setPaneToast: state.setPaneToast
    },
    produce: {
      kafkaApi: window.kafkaApi,
      selectedServerId: state.selectedServerId,
      selectedTopic: derived.selectedTopic,
      getProduceDraft: state.getProduceDraft,
      updateProduceDraftFor: state.updateProduceDraftFor,
      runTask: state.runTask,
      runPaneTask: state.runPaneTask,
      showPaneToast: state.showPaneToast,
      setSplitPane: state.setSplitPane,
      setView: actions.setView,
      setStatus: state.setStatus,
      setToast: state.setToast
    }
  };
}
