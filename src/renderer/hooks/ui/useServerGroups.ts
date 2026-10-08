import { useMemo, useState } from "react";
import type { ServerProfile } from "../../../shared/types";
import { useServerGroupsStore } from "../../stores/ui/serverGroupsStore";

export function useServerGroups(servers: ServerProfile[], filteredServers: ServerProfile[], query: string) {
  const groups = useServerGroupsStore((state) => state.groups);
  const saveGroup = useServerGroupsStore((state) => state.saveGroup);
  const [editor, setEditor] = useState<{ id: string | null; name: string; invalid: boolean } | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null | undefined>(undefined);
  const search = query.trim().toLowerCase();
  const sections = useMemo(() => {
    const byId = new Map(servers.map((server) => [server.id, server]));
    const visibleIds = new Set(filteredServers.map((server) => server.id));
    const groupedIds = new Set(groups.flatMap((group) => group.serverIds));
    return {
      groups: groups.map((group) => {
        const members = group.serverIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
        const matchesName = Boolean(search && group.name.toLowerCase().includes(search));
        return { group, total: members.length, members: matchesName ? members : members.filter((server) => visibleIds.has(server.id)), matchesName };
      }).filter((section) => !search || section.matchesName || section.members.length > 0),
      ungrouped: filteredServers.filter((server) => !groupedIds.has(server.id))
    };
  }, [servers, filteredServers, groups, search]);

  function submitGroup() {
    if (!editor) return;
    if (saveGroup(editor.id, editor.name)) setEditor(null);
    else setEditor({ ...editor, invalid: true });
  }

  return { groups, sections, search, editor, setEditor, submitGroup, dropGroupId, setDropGroupId };
}
