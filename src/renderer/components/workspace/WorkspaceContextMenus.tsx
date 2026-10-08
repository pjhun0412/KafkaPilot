import { Braces, Copy, Layers, Pencil, Power, Trash2, Unplug } from "lucide-react";
import type { ServerProfile } from "../../../shared/types";
import { useLayoutEffect, useRef, useState } from "react";
import { useAppLanguage } from "../../hooks/state/useAppLanguage";
import type { ServerContextMenuState, TopicContextMenuState } from "../../hooks/state/useSidebarInteractionState";
import { t } from "../../i18n";
import { getServerGroupId } from "../../../shared/serverGroups";
import { useServerGroupsStore } from "../../stores/ui/serverGroupsStore";

type WorkspaceContextMenusProps = {
  topicContextMenu: TopicContextMenuState;
  serverContextMenu: ServerContextMenuState;
  contextTopic: string;
  contextServer: ServerProfile | undefined;
  selectedServerId: string;
  connectedServerIds: string[];
  onCloseTopicMenu: () => void;
  onOpenTopic: (topic: string) => void;
  onCopyTopic: (topic: string) => void;
  onRegisterAvroSchema: (serverId: string, topic: string) => void;
  onTopicAction: (kind: "delete" | "purge", topics: string[]) => void;
  onCloseServerMenu: () => void;
  onConnectServer: (server: ServerProfile) => void;
  onDisconnectServer: (serverId: string) => void;
  onEditServer: (server: ServerProfile) => void;
  onDeleteServer: (serverId: string) => void;
};

export function WorkspaceContextMenus({
  topicContextMenu,
  serverContextMenu,
  contextTopic,
  contextServer,
  selectedServerId,
  connectedServerIds,
  onCloseTopicMenu,
  onOpenTopic,
  onCopyTopic,
  onRegisterAvroSchema,
  onTopicAction,
  onCloseServerMenu,
  onConnectServer,
  onDisconnectServer,
  onEditServer,
  onDeleteServer
}: WorkspaceContextMenusProps) {
  const language = useAppLanguage();
  const serverGroups = useServerGroupsStore((state) => state.groups);
  const moveServer = useServerGroupsStore((state) => state.moveServer);
  const serverMenuRef = useRef<HTMLDivElement>(null);
  const [serverMenuPosition, setServerMenuPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!serverContextMenu || !contextServer) {
      setServerMenuPosition(null);
      return;
    }
    const reposition = () => {
      const bounds = serverMenuRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setServerMenuPosition({
        x: Math.max(8, Math.min(serverContextMenu.x, window.innerWidth - bounds.width - 8)),
        y: Math.max(8, Math.min(serverContextMenu.y, window.innerHeight - bounds.height - 8))
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [serverContextMenu, contextServer, serverGroups, language]);
  return (
    <>
      {topicContextMenu && (
        <div
          className="context-menu topic-context-menu"
          style={{ left: topicContextMenu.x, top: topicContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={() => { onCloseTopicMenu(); onOpenTopic(contextTopic); }}>
            <Layers size={14} /> {t(language, "context.open")}
          </button>
          <button onClick={() => { onCloseTopicMenu(); onCopyTopic(contextTopic); }}>
            <Copy size={14} /> {t(language, "context.copyName")}
          </button>
          <button onClick={() => { onCloseTopicMenu(); onRegisterAvroSchema(selectedServerId, contextTopic); }}>
            <Braces size={14} /> {t(language, "context.registerAvroSchema")}
          </button>
          <button className="danger-item" onClick={() => { onCloseTopicMenu(); onTopicAction("purge", [contextTopic]); }}>
            <Trash2 size={14} /> {t(language, "context.purge")}
          </button>
          <button className="danger-item" onClick={() => { onCloseTopicMenu(); onTopicAction("delete", [contextTopic]); }}>
            <Trash2 size={14} /> {t(language, "action.delete")}
          </button>
        </div>
      )}
      {serverContextMenu && contextServer && (
        <div
          ref={serverMenuRef}
          className="context-menu server-context-menu"
          style={{ left: serverMenuPosition?.x ?? serverContextMenu.x, top: serverMenuPosition?.y ?? serverContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {connectedServerIds.includes(contextServer.id) ? (
            <button onClick={() => { onCloseServerMenu(); onDisconnectServer(contextServer.id); }}>
              <Unplug size={14} /> {t(language, "context.disconnect")}
            </button>
          ) : (
            <button onClick={() => { onCloseServerMenu(); onConnectServer(contextServer); }}>
              <Power size={14} /> {t(language, "context.connect")}
            </button>
          )}
          <button onClick={() => { onCloseServerMenu(); onEditServer(contextServer); }}>
            <Pencil size={14} /> {t(language, "context.edit")}
          </button>
          {serverGroups.length > 0 && (
            <label className="server-group-menu">
              {t(language, "serverGroups.moveTo")}
              <select value={getServerGroupId(serverGroups, contextServer.id) ?? ""} onChange={(event) => { moveServer(contextServer.id, event.target.value || null); onCloseServerMenu(); }}>
                <option value="">{t(language, "serverGroups.ungrouped")}</option>
                {serverGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
          )}
          <button className="danger-item" onClick={() => { onCloseServerMenu(); onDeleteServer(contextServer.id); }}>
            <Trash2 size={14} /> {t(language, "action.delete")}
          </button>
        </div>
      )}
    </>
  );
}
