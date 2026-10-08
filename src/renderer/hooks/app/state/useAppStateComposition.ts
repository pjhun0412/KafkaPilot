import { useShallow } from "zustand/react/shallow";
import { useEffect } from "react";
import { usePreferenceNavigation } from "../../preferences";
import {
  useConsumeStateStore,
  useFeedbackState,
  useLayoutPreferences,
  useProduceDraftStore,
  useServerClusterState,
  useSidebarInteractionState,
  useWorkspacePaneState
} from "../../state";
import { useLiveConsumeRouting, useWorkspaceTasks } from "../../workspace";
import { useServerFormStore } from "../../../stores/ui/serverFormStore";
import { useTopicCreateStore } from "../../../stores/ui/topicCreateStore";
import { useAppResourceState } from "./useAppResourceState";

export function useAppStateComposition() {
  const serverCluster = useServerClusterState();
  const serverForms = useServerFormStore(useShallow((state) => ({
    openNewServerForm: state.openNewServerForm,
    openEditServerForm: state.openEditServerForm
  })));
  const topicCreateForms = useTopicCreateStore(useShallow((state) => ({
    openTopicCreateForm: state.openTopicCreateForm,
    closeTopicCreateForm: state.closeTopicCreateForm
  })));
  const resources = useAppResourceState();
  const consumeState = useConsumeStateStore({
    selectedServerId: serverCluster.selectedServerId,
    consumeDefaults: resources.preferences.consumeDefaults,
    viewerPreferences: resources.preferences.viewerPreferences,
    setViewerPreferences: resources.preferences.setViewerPreferences,
    consumeDefaultsByServer: resources.preferences.consumeDefaultsByServer
  });
  const produceDrafts = useProduceDraftStore();
  const feedback = useFeedbackState();
  const liveConsumeRouting = useLiveConsumeRouting({
    setStreamingTopicsByServer: resources.streaming.setStreamingTopicsByServer,
    setActiveConsumeTaskKeys: feedback.setActiveConsumeTaskKeys
  });
  const workspaceTasks = useWorkspaceTasks({
    setLoading: feedback.setLoading,
    setStatus: feedback.setStatus,
    setToast: feedback.setToast,
    setPaneToast: feedback.setPaneToast,
    setActiveConsumeTaskKeys: feedback.setActiveConsumeTaskKeys
  });
  const layout = useLayoutPreferences();
  const preferences = usePreferenceNavigation();
  const sidebarInteraction = useSidebarInteractionState();
  const workspacePane = useWorkspacePaneState(serverCluster.selectedServerId);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--message-viewer-font-size",
      `${Math.min(18, Math.max(11, resources.preferences.viewerPreferences.fontSize))}px`
    );
    document.documentElement.style.setProperty(
      "--message-viewer-font-weight",
      String(Math.min(800, Math.max(400, resources.preferences.viewerPreferences.fontWeight)))
    );
  }, [resources.preferences.viewerPreferences.fontSize, resources.preferences.viewerPreferences.fontWeight]);

  return {
    serverCluster,
    serverForms,
    topicCreateForms,
    resources,
    consumeState,
    produceDrafts,
    liveConsumeRouting,
    feedback,
    workspaceTasks,
    layout,
    preferences,
    sidebarInteraction,
    workspacePane
  };
}
