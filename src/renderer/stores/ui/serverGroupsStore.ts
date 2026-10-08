import { create } from "zustand";
import type { ServerGroup } from "../../../shared/types";
import { MAX_SERVER_GROUP_NAME_LENGTH, moveServerToGroup, normalizeServerGroups } from "../../../shared/serverGroups";

type ServerGroupsStore = {
  groups: ServerGroup[];
  setGroups: (groups: unknown) => void;
  saveGroup: (id: string | null, name: string) => boolean;
  deleteGroup: (id: string) => void;
  toggleGroup: (id: string) => void;
  reorderGroup: (id: string, targetId: string, position: "before" | "after") => void;
  moveServer: (serverId: string, groupId: string | null, targetId?: string, position?: "before" | "after") => void;
};

export const useServerGroupsStore = create<ServerGroupsStore>((set, get) => ({
  groups: [],
  setGroups: (groups) => set({ groups: normalizeServerGroups(groups) }),
  saveGroup: (id, value) => {
    const name = value.trim();
    const groups = get().groups;
    if (!name || name.length > MAX_SERVER_GROUP_NAME_LENGTH || groups.some((group) => group.id !== id && group.name.toLowerCase() === name.toLowerCase())) return false;
    if (id !== null && !groups.some((group) => group.id === id)) return false;
    set({ groups: id === null
      ? [...groups, { id: crypto.randomUUID(), name, serverIds: [], collapsed: false }]
      : groups.map((group) => group.id === id ? { ...group, name } : group) });
    return true;
  },
  // Removing a group keeps its servers, which are displayed as ungrouped.
  deleteGroup: (id) => set((state) => ({ groups: state.groups.filter((group) => group.id !== id) })),
  toggleGroup: (id) => set((state) => ({ groups: state.groups.map((group) => group.id === id ? { ...group, collapsed: !group.collapsed } : group) })),
  reorderGroup: (id, targetId, position) => set((state) => {
    const group = state.groups.find((item) => item.id === id);
    if (!group || id === targetId || !state.groups.some((item) => item.id === targetId)) return state;
    const groups = state.groups.filter((item) => item.id !== id);
    const targetIndex = groups.findIndex((item) => item.id === targetId);
    groups.splice(targetIndex + (position === "after" ? 1 : 0), 0, group);
    return { groups };
  }),
  moveServer: (serverId, groupId, targetId, position) => set((state) => ({ groups: moveServerToGroup(state.groups, serverId, groupId, targetId, position) }))
}));
