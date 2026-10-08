import type React from "react";
import type { ServerProfile, TopicSummary } from "../../../../shared/types";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import type { DragPayload, TopicListFilter, TopicSortMode, WorkspaceActionTarget } from "../../../uiTypes";
import { ServerPanel } from "./ServerPanel";
import { TopicSidebarPanel } from "./TopicSidebarPanel";

type DropTarget = { id: string; position: "before" | "after" } | null;
type TopicDropTarget = { topic: string; position: "before" | "after" } | null;

type WorkspaceSidebarProps = {
  serverPanelHeight: number;
  serverQuery: string;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  selectedServerId: string;
  draggingServerId: string;
  serverDropTarget: DropTarget;
  connectedServerIds: string[];
  failedServerIds: string[];
  topics: TopicSummary[];
  filteredTopics: TopicSummary[];
  favoriteTopics: TopicSummary[];
  nonFavoriteFilteredTopics: TopicSummary[];
  favoriteTopicNames: string[];
  manualAvroTopicNames: Set<string>;
  selectedTopic: string;
  topicQuery: string;
  topicSearchHistory: string[];
  topicSearchError: string;
  topicFilter: TopicListFilter;
  topicSort: TopicSortMode;
  isTopicSortMenuOpen: boolean;
  isSelectedServerConnected: boolean;
  loading: boolean;
  draggingFavoriteTopic: string;
  favoriteDropTarget: TopicDropTarget;
  onNewServer: () => void;
  onServerQuery: (query: string) => void;
  onServerSelect: (serverId: string) => void;
  onServerContextMenu: (event: React.MouseEvent, server: ServerProfile) => void;
  onOpenServer: (server: ServerProfile) => void;
  onServerDragStart: (serverId: string) => void;
  onServerDropTarget: (target: DropTarget) => void;
  onServerDrop: (draggedId: string, targetId: string, position: "before" | "after") => void;
  onServerDragEnd: () => void;
  onServerPanelResize: (event: React.PointerEvent) => void;
  onTopicSortMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  onTopicSort: (sort: TopicSortMode) => void;
  onRefreshTopics: () => void;
  onTopicQuery: (query: string) => void;
  onCommitTopicSearch: () => void;
  onRemoveTopicSearchHistory: (query: string) => void;
  onTopicFilter: (filter: TopicListFilter) => void;
  onTopicSelect: (target: WorkspaceActionTarget, topic: string) => void;
  onTopicOpen: (topic: string) => void;
  onTopicFavorite: (topic: string) => void;
  onTopicContextMenu: (event: React.MouseEvent, topic: string) => void;
  getWorkspaceTargetForTopic: (serverId: string, topic: string) => WorkspaceActionTarget;
  onFavoriteDragStart: (topic: string) => void;
  onFavoriteDropTarget: (target: TopicDropTarget) => void;
  onFavoriteDrop: (draggedTopic: string, targetTopic: string, position: "before" | "after") => void;
  onFavoriteDragEnd: () => void;
};

export function WorkspaceSidebar({
  serverPanelHeight,
  serverQuery,
  servers,
  filteredServers,
  selectedServerId,
  draggingServerId,
  serverDropTarget,
  connectedServerIds,
  failedServerIds,
  topics,
  filteredTopics,
  favoriteTopics,
  nonFavoriteFilteredTopics,
  favoriteTopicNames,
  manualAvroTopicNames,
  selectedTopic,
  topicQuery,
  topicSearchHistory,
  topicSearchError,
  topicFilter,
  topicSort,
  isTopicSortMenuOpen,
  isSelectedServerConnected,
  loading,
  draggingFavoriteTopic,
  favoriteDropTarget,
  onNewServer,
  onServerQuery,
  onServerSelect,
  onServerContextMenu,
  onOpenServer,
  onServerDragStart,
  onServerDropTarget,
  onServerDrop,
  onServerDragEnd,
  onServerPanelResize,
  onTopicSortMenuOpen,
  onTopicSort,
  onRefreshTopics,
  onTopicQuery,
  onCommitTopicSearch,
  onRemoveTopicSearchHistory,
  onTopicFilter,
  onTopicSelect,
  onTopicOpen,
  onTopicFavorite,
  onTopicContextMenu,
  getWorkspaceTargetForTopic,
  onFavoriteDragStart,
  onFavoriteDropTarget,
  onFavoriteDrop,
  onFavoriteDragEnd
}: WorkspaceSidebarProps) {
  const language = useAppLanguage();
  return (
    <aside className="sidebar">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
          <rect width="28" height="28" fill="#0d141f" rx="5" ry="5" />
          <rect x="1.2" y="1.2" width="25.6" height="25.6" rx="4" ry="4" fill="none" stroke="#3794ff" strokeWidth="1.6" />
          <text x="14" y="15" textAnchor="middle" dominantBaseline="middle" fontFamily="Segoe UI, system-ui, sans-serif" fontWeight="700" fontSize="12" fill="#3794ff">KP</text>
        </svg>
        <div>
          <strong>KafkaPilot</strong>
          <span>{t(language, "label.desktopClient")}</span>
        </div>
      </div>

      <ServerPanel
        height={serverPanelHeight}
        query={serverQuery}
        servers={servers}
        filteredServers={filteredServers}
        selectedServerId={selectedServerId}
        draggingServerId={draggingServerId}
        serverDropTarget={serverDropTarget}
        connectedServerIds={connectedServerIds}
        failedServerIds={failedServerIds}
        onNewServer={onNewServer}
        onQuery={onServerQuery}
        onDragStart={(event, serverId) => {
          onServerDragStart(serverId);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", serverId);
        }}
        onDragOver={(_, serverId, position) => {
          if (draggingServerId && draggingServerId !== serverId) {
            onServerDropTarget({ id: serverId, position });
          }
        }}
        onDragLeave={(serverId) => {
          if (serverDropTarget?.id === serverId) {
            onServerDropTarget(null);
          }
        }}
        onDrop={(event, serverId) => {
          event.preventDefault();
          const draggedId = event.dataTransfer.getData("text/plain") || draggingServerId;
          const position = serverDropTarget?.id === serverId ? serverDropTarget.position : "before";
          onServerDrop(draggedId, serverId, position);
        }}
        onDragEnd={onServerDragEnd}
        onSelect={onServerSelect}
        onContextMenu={onServerContextMenu}
        onOpen={onOpenServer}
      />

      <div className="sidebar-stack-resizer" onPointerDown={onServerPanelResize} title={t(language, "title.resizeServerTopicPanels")} />

      <TopicSidebarPanel
        topics={topics}
        filteredTopics={filteredTopics}
        favoriteTopics={favoriteTopics}
        nonFavoriteFilteredTopics={nonFavoriteFilteredTopics}
        favoriteTopicNames={favoriteTopicNames}
        manualAvroTopicNames={manualAvroTopicNames}
        selectedServerId={selectedServerId}
        selectedTopic={selectedTopic}
        topicQuery={topicQuery}
        topicSearchHistory={topicSearchHistory}
        topicSearchError={topicSearchError}
        topicFilter={topicFilter}
        topicSort={topicSort}
        isTopicSortMenuOpen={isTopicSortMenuOpen}
        isSelectedServerConnected={isSelectedServerConnected}
        loading={loading}
        draggingFavoriteTopic={draggingFavoriteTopic}
        favoriteDropTarget={favoriteDropTarget}
        onTopicSortMenuOpen={onTopicSortMenuOpen}
        onTopicSort={onTopicSort}
        onRefreshTopics={onRefreshTopics}
        onTopicQuery={onTopicQuery}
        onCommitTopicSearch={onCommitTopicSearch}
        onRemoveTopicSearchHistory={onRemoveTopicSearchHistory}
        onTopicFilter={onTopicFilter}
        onTopicSelect={onTopicSelect}
        onTopicOpen={onTopicOpen}
        onTopicFavorite={onTopicFavorite}
        onTopicContextMenu={onTopicContextMenu}
        getWorkspaceTargetForTopic={getWorkspaceTargetForTopic}
        onFavoriteDragStart={onFavoriteDragStart}
        onFavoriteDropTarget={onFavoriteDropTarget}
        onFavoriteDrop={onFavoriteDrop}
        onFavoriteDragEnd={onFavoriteDragEnd}
      />
    </aside>
  );
}
