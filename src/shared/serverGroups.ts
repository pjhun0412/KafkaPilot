import type { ServerGroup } from "./types.js";

export const MAX_SERVER_GROUP_NAME_LENGTH = 60;

// Settings from older versions and imported files may not contain valid groups.
export function normalizeServerGroups(value: unknown): ServerGroup[] {
  if (!Array.isArray(value)) return [];
  const groupIds = new Set<string>();
  const serverIds = new Set<string>();
  const groups: ServerGroup[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() || groupIds.has(item.id)) continue;
    if (typeof item.name !== "string" || !item.name.trim()) continue;
    groupIds.add(item.id);
    const members: string[] = [];
    if (Array.isArray(item.serverIds)) {
      for (const id of item.serverIds) {
        if (typeof id !== "string" || !id.trim() || serverIds.has(id)) continue;
        serverIds.add(id);
        members.push(id);
      }
    }
    groups.push({ id: item.id, name: item.name.trim().slice(0, MAX_SERVER_GROUP_NAME_LENGTH), serverIds: members, collapsed: item.collapsed === true });
  }
  return groups;
}

export function getServerGroupId(groups: ServerGroup[], serverId: string): string | null {
  return groups.find((group) => group.serverIds.includes(serverId))?.id ?? null;
}

export function moveServerToGroup(
  groups: ServerGroup[], serverId: string, groupId: string | null,
  targetId?: string, position: "before" | "after" = "after"
): ServerGroup[] {
  if (!serverId || targetId === serverId || (groupId !== null && !groups.some((group) => group.id === groupId))) return groups;
  return groups.map((group) => {
    if (group.id !== groupId && !group.serverIds.includes(serverId)) return group;
    const members = group.serverIds.filter((id) => id !== serverId);
    if (group.id === groupId) {
      const targetIndex = targetId ? members.indexOf(targetId) : -1;
      members.splice(targetIndex < 0 ? members.length : targetIndex + (position === "after" ? 1 : 0), 0, serverId);
    }
    return { ...group, serverIds: members };
  });
}
