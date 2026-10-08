import type { WorkspaceDerivedStateParams } from "../../state/useWorkspaceDerivedState";
import type { useWorkspaceControllerStateBindings } from "../useWorkspaceControllerStateBindings";

type ControllerState = ReturnType<typeof useWorkspaceControllerStateBindings>;

export function createWorkspaceDerivedStateParams(state: ControllerState): WorkspaceDerivedStateParams {
  return {
    selectedServerId: state.selectedServerId,
    selectedTopicByServer: state.selectedTopicByServer,
    previewTopicByServer: state.previewTopicByServer,
    viewByServer: state.viewByServer,
    openedTopicTabsByServer: state.openedTopicTabsByServer,
    topicDetailByServer: state.topicDetailByServer,
    topicDetailCacheByServer: state.topicDetailCacheByServer,
    consumeStatesByServer: state.consumeStatesByServer,
    splitPane: state.splitPane,
    getDefaultConsumeState: state.getDefaultConsumeState,
    getProduceDraft: state.getProduceDraft
  };
}
