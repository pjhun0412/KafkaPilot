import type { Dispatch, SetStateAction } from "react";
import type { KafkaApi, TopicDetail } from "../../../shared/types";
import type { SplitPaneState, WorkspacePaneId } from "../../uiTypes";
import { setPreviewTopicTab } from "../../workspaceState";
import { workspaceMessages } from "../../workspaceMessages";

type SplitTopicDetailActionsParams = {
  kafkaApi: KafkaApi | undefined;
  getCachedTopicDetail: (serverId: string, topic: string) => TopicDetail | null;
  runPaneTask: <T>(
    pane: WorkspacePaneId,
    label: string,
    task: () => Promise<T>,
    scope?: { serverId?: string; topic?: string }
  ) => Promise<T>;
  setSplitPane: Dispatch<SetStateAction<SplitPaneState | null>>;
  setTopicDetailCacheByServer: Dispatch<SetStateAction<Record<string, Record<string, TopicDetail>>>>;
};

export function useSplitTopicDetailActions({
  kafkaApi,
  getCachedTopicDetail,
  runPaneTask,
  setSplitPane,
  setTopicDetailCacheByServer
}: SplitTopicDetailActionsParams) {
  function cacheTopicDetail(serverId: string, detail: TopicDetail) {
    setTopicDetailCacheByServer((current) => ({
      ...current,
      [serverId]: {
        ...(current[serverId] ?? {}),
        [detail.name]: detail
      }
    }));
  }

  function applySplitDetail(serverId: string, topic: string, detail: TopicDetail) {
    setSplitPane((current) => current && current.serverId === serverId && current.topic === topic
      ? { ...current, detail }
      : current
    );
  }

  function previewSplitDetail(serverId: string, topic: string, detail: TopicDetail | null) {
    setSplitPane((current) => current && current.serverId === serverId
      ? (() => {
          const isPinnedTopic = current.topicTabs.includes(topic) && current.previewTopic !== topic;
          return {
          ...current,
          topic,
          topicTabs: isPinnedTopic ? current.topicTabs : setPreviewTopicTab(current.topicTabs, topic, current.previewTopic),
          previewTopic: isPinnedTopic ? current.previewTopic : topic,
          view: "info",
          detail
        };
      })()
      : current
    );
  }

  async function loadSplitTopicDetail(serverId: string, topic: string) {
    if (!kafkaApi || !topic) return;
    const detail = await runPaneTask(
      "split",
      workspaceMessages.topicDetailLoading,
      () => kafkaApi.getTopicDetail(serverId, topic),
      { serverId, topic }
    );
    cacheTopicDetail(serverId, detail);
    applySplitDetail(serverId, topic, detail);
  }

  async function loadSplitTopicDetailSilent(serverId: string, topic: string, options: { force?: boolean } = {}) {
    if (!kafkaApi || !topic) return;
    const cachedDetail = options.force ? null : getCachedTopicDetail(serverId, topic);
    if (cachedDetail) {
      applySplitDetail(serverId, topic, cachedDetail);
      return;
    }
    const detail = await kafkaApi.getTopicDetail(serverId, topic);
    cacheTopicDetail(serverId, detail);
    applySplitDetail(serverId, topic, detail);
  }

  async function previewSplitTopicDetailSilent(serverId: string, topic: string, options: { force?: boolean } = {}) {
    if (!kafkaApi || !topic) return;
    const cachedDetail = options.force ? null : getCachedTopicDetail(serverId, topic);
    previewSplitDetail(serverId, topic, cachedDetail);
    if (cachedDetail) {
      return;
    }
    const detail = await kafkaApi.getTopicDetail(serverId, topic);
    cacheTopicDetail(serverId, detail);
    applySplitDetail(serverId, topic, detail);
  }

  return {
    loadSplitTopicDetail,
    loadSplitTopicDetailSilent,
    previewSplitTopicDetailSilent
  };
}
