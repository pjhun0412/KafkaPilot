import type { AppStateComposition } from "./stateBindingTypes";

export function createConsumeFlowStateBindings(appState: AppStateComposition) {
  const {
    consumeStatesByServer,
    setConsumeStatesByServer,
    splitConsumeStatesByServer,
    setSplitConsumeStatesByServer,
    getDefaultConsumeState,
    setConsumeStates,
    mergeConsumeState,
    rememberViewerPreference,
    moveConsumeStateBetweenPanes,
    clearConsumeStateForPane,
    clearConsumeStatesForPane,
    updateConsumeStateFor
  } = appState.consumeState;
  const { getProduceDraft, updateProduceDraftFor, resetProduceDrafts } = appState.produceDrafts;
  const {
    getMessageTarget,
    pendingLiveTasksRef,
    setStartedConsumer,
    getStopConsumerId,
    clearStoppedConsumer,
    clearMessageTarget,
    retargetLiveTopic
  } = appState.liveConsumeRouting;
  const {
    setStatus,
    toast,
    setToast,
    paneToast,
    setPaneToast,
    loading,
    setLoading,
    activeConsumeTaskKeys,
    setActiveConsumeTaskKeys,
    setConnectionError
  } = appState.feedback;
  const { runTask, runPaneTask, runWorkspaceTask, showPaneToast } = appState.workspaceTasks;

  return {
    activeConsumeTaskKeys,
    clearConsumeStateForPane,
    clearConsumeStatesForPane,
    clearMessageTarget,
    clearStoppedConsumer,
    consumeStatesByServer,
    getDefaultConsumeState,
    getMessageTarget,
    getProduceDraft,
    getStopConsumerId,
    loading,
    mergeConsumeState,
    rememberViewerPreference,
    moveConsumeStateBetweenPanes,
    paneToast,
    pendingLiveTasksRef,
    resetProduceDrafts,
    retargetLiveTopic,
    runPaneTask,
    runTask,
    runWorkspaceTask,
    setActiveConsumeTaskKeys,
    setConnectionError,
    setConsumeStates,
    setConsumeStatesByServer,
    setLoading,
    setPaneToast,
    setSplitConsumeStatesByServer,
    setStartedConsumer,
    setStatus,
    setToast,
    showPaneToast,
    splitConsumeStatesByServer,
    toast,
    updateConsumeStateFor,
    updateProduceDraftFor
  };
}
