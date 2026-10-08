import React from "react";
import { Check, ChevronDown, ChevronRight, Folder, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ServerProfile } from "../../../../shared/types";
import { MAX_SERVER_GROUP_NAME_LENGTH } from "../../../../shared/serverGroups";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { useServerGroups } from "../../../hooks/ui/useServerGroups";
import { useServerGroupsStore } from "../../../stores/ui/serverGroupsStore";
import { t } from "../../../i18n";
import { ServerConnectionIndicator } from "../../ServerConnectionIndicator";

type ServerDropTarget = { id: string; position: "before" | "after" } | null;

type ServerPanelProps = {
  height: number;
  query: string;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  selectedServerId: string;
  draggingServerId: string;
  serverDropTarget: ServerDropTarget;
  connectedServerIds: string[];
  failedServerIds: string[];
  onNewServer: () => void;
  onQuery: (query: string) => void;
  onDragStart: (event: React.DragEvent, serverId: string) => void;
  onDragOver: (event: React.DragEvent, serverId: string, position: "before" | "after") => void;
  onDragLeave: (serverId: string) => void;
  onDrop: (event: React.DragEvent, serverId: string) => void;
  onDragEnd: () => void;
  onSelect: (serverId: string) => void;
  onContextMenu: (event: React.MouseEvent, server: ServerProfile) => void;
  onOpen: (server: ServerProfile) => void;
};

export function ServerPanel(props: ServerPanelProps) {
  const language = useAppLanguage();
  const { groups, sections, search, editor, setEditor, submitGroup, dropGroupId, setDropGroupId } = useServerGroups(props.servers, props.filteredServers, props.query);
  const moveServer = useServerGroupsStore((state) => state.moveServer);
  const toggleGroup = useServerGroupsStore((state) => state.toggleGroup);
  const deleteGroup = useServerGroupsStore((state) => state.deleteGroup);
  const reorderGroup = useServerGroupsStore((state) => state.reorderGroup);
  const [draggingGroupId, setDraggingGroupId] = React.useState("");
  const [groupDropTarget, setGroupDropTarget] = React.useState<ServerDropTarget>(null);
  const isServerDrag = props.servers.some((server) => server.id === props.draggingServerId);
  const finishDrag = () => { setDropGroupId(undefined); setDraggingGroupId(""); setGroupDropTarget(null); props.onDragEnd(); };

  function groupDropHandlers(groupId: string | null, backgroundOnly = false) {
    return {
      onDragOver: (event: React.DragEvent) => {
        if (backgroundOnly && event.target !== event.currentTarget) return;
        if (draggingGroupId) {
          if (!groupId || groupId === draggingGroupId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          setGroupDropTarget({ id: groupId, position: event.clientY < rect.top + rect.height / 2 ? "before" : "after" });
          return;
        }
        if (!isServerDrag) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropGroupId(groupId);
      },
      onDragLeave: (event: React.DragEvent) => {
        if (backgroundOnly && event.target !== event.currentTarget) return;
        setDropGroupId(undefined);
        setGroupDropTarget(null);
      },
      onDrop: (event: React.DragEvent) => {
        if (backgroundOnly && event.target !== event.currentTarget) return;
        if (draggingGroupId) {
          if (!groupId || groupId === draggingGroupId) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          reorderGroup(draggingGroupId, groupId, event.clientY < rect.top + rect.height / 2 ? "before" : "after");
          finishDrag();
          return;
        }
        if (!isServerDrag) return;
        event.preventDefault();
        moveServer(props.draggingServerId, groupId);
        finishDrag();
      }
    };
  }

  function renderServer(server: ServerProfile, groupId: string | null) {
    return (
      <button
        key={server.id}
        className={`${server.id === props.selectedServerId ? "server active" : "server"} ${groupId ? "grouped-server" : ""} ${server.id === props.draggingServerId ? "dragging" : ""} ${props.serverDropTarget?.id === server.id ? `drop-${props.serverDropTarget.position}` : ""}`}
        draggable
        aria-current={server.id === props.selectedServerId ? "true" : undefined}
        onDragStart={(event) => props.onDragStart(event, server.id)}
        onDragOver={(event) => {
          if (!isServerDrag) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropGroupId(undefined);
          const rect = event.currentTarget.getBoundingClientRect();
          props.onDragOver(event, server.id, event.clientY < rect.top + rect.height / 2 ? "before" : "after");
        }}
        onDragLeave={() => props.onDragLeave(server.id)}
        onDrop={(event) => {
          if (!isServerDrag || props.draggingServerId === server.id) return;
          event.preventDefault();
          if (groupId) {
            const rect = event.currentTarget.getBoundingClientRect();
            moveServer(props.draggingServerId, groupId, server.id, event.clientY < rect.top + rect.height / 2 ? "before" : "after");
            finishDrag();
          } else {
            moveServer(props.draggingServerId, null);
            props.onDrop(event, server.id);
          }
        }}
        onDragEnd={finishDrag}
        onClick={() => props.onSelect(server.id)}
        onContextMenu={(event) => props.onContextMenu(event, server)}
        onDoubleClick={() => props.onOpen(server)}
      >
        <span className="server-name">
          <ServerConnectionIndicator serverId={server.id} connectedServerIds={props.connectedServerIds} failedServerIds={props.failedServerIds} />
          <strong title={server.name}>{server.name}</strong>
        </span>
        <span className="server-host"><small title={server.brokers.join(", ")}>{server.brokers.join(", ")}</small></span>
      </button>
    );
  }

  return (
    <section className="sidebar-panel server-panel" style={{ height: props.height }}>
      <div className="sidebar-panel-title server-panel-heading">
        <span>{t(language, "label.server")}</span>
        <div className="server-panel-actions">
          <button className="server-panel-action server-panel-add-server" title={t(language, "title.addServer")} aria-label={t(language, "title.addServer")} onClick={props.onNewServer}>
            <Plus size={14} aria-hidden="true" />
          </button>
          <button className="server-panel-action" title={t(language, "serverGroups.add")} aria-label={t(language, "serverGroups.add")} onClick={() => setEditor({ id: null, name: "", invalid: false })}>
            <FolderPlus size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="search-box server-search">
        <input
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          placeholder={t(language, "placeholder.searchServer")}
          aria-label={t(language, "placeholder.searchServer")}
        />
        {props.query && (
          <button onClick={() => props.onQuery("")} title={t(language, "title.clearServerSearch")}>
            <X size={13} />
          </button>
        )}
      </div>
      {editor && (
        <form className="server-group-editor" onSubmit={(event) => { event.preventDefault(); submitGroup(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setEditor(null); } }}>
          <label className="server-group-editor-label" htmlFor="server-group-name">{t(language, editor.id === null ? "serverGroups.add" : "serverGroups.rename")}</label>
          <input id="server-group-name" key={editor.id ?? "new"} autoFocus value={editor.name} maxLength={MAX_SERVER_GROUP_NAME_LENGTH} aria-invalid={editor.invalid} aria-describedby={editor.invalid ? "server-group-error" : undefined} placeholder={t(language, "serverGroups.name")} onChange={(event) => setEditor({ ...editor, name: event.target.value, invalid: false })} />
          <button type="submit" className="server-group-action" title={t(language, "action.save")} aria-label={t(language, "action.save")}><Check size={14} /></button>
          <button type="button" className="server-group-action" title={t(language, "action.cancel")} aria-label={t(language, "action.cancel")} onClick={() => setEditor(null)}><X size={14} /></button>
          {editor.invalid && <small id="server-group-error" role="alert">{t(language, "serverGroups.invalidName")}</small>}
        </form>
      )}
      <div className={`server-list ${isServerDrag && dropGroupId === null ? "drop-root" : ""}`} {...groupDropHandlers(null, true)}>
        {sections.groups.map(({ group, members, total }) => {
          const expanded = Boolean(search) || !group.collapsed;
          return (
            <section className={`server-group ${draggingGroupId === group.id ? "dragging-group" : ""}`} key={group.id}>
              <div
                className={`server-group-heading ${isServerDrag && dropGroupId === group.id ? "drop-group" : ""} ${groupDropTarget?.id === group.id ? `group-drop-${groupDropTarget.position}` : ""} ${group.serverIds.includes(props.selectedServerId) ? "contains-selected" : ""}`}
                draggable
                onDragStart={(event) => {
                  if ((event.target as HTMLElement).closest(".server-group-action")) { event.preventDefault(); return; }
                  event.dataTransfer.setData("application/x-kafkapilot-server-group", group.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingGroupId(group.id);
                }}
                onDragEnd={finishDrag}
                {...groupDropHandlers(group.id)}
              >
                <button className="server-group-toggle" aria-expanded={expanded} onClick={() => toggleGroup(group.id)}>
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Folder size={13} />
                  <strong title={group.name}>{group.name}</strong><small>{search ? members.length : total}</small>
                </button>
                <button className="server-group-action" title={t(language, "serverGroups.rename")} aria-label={`${t(language, "serverGroups.rename")}: ${group.name}`} onClick={() => setEditor({ id: group.id, name: group.name, invalid: false })}><Pencil size={12} /></button>
                <button className="server-group-action" title={t(language, "serverGroups.delete")} aria-label={`${t(language, "serverGroups.delete")}: ${group.name}`} onClick={() => { deleteGroup(group.id); if (editor?.id === group.id) setEditor(null); }}><Trash2 size={12} /></button>
              </div>
              {expanded && members.map((server) => renderServer(server, group.id))}
              {expanded && total === 0 && !search && <div className="server-group-empty" {...groupDropHandlers(group.id)}>{t(language, "serverGroups.dropHere")}</div>}
            </section>
          );
        })}
        {sections.ungrouped.map((server) => renderServer(server, null))}
        {props.servers.length === 0 && groups.length === 0 && <div className="empty-list">{t(language, "label.noServers")}</div>}
        {search && sections.groups.length === 0 && sections.ungrouped.length === 0 && <div className="empty-list">{t(language, "label.noServersFound")}</div>}
      </div>
    </section>
  );
}
