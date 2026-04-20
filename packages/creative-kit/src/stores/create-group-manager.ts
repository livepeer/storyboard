import { createStore } from "zustand/vanilla";
import type { ArtifactGroup, GroupManager } from "../interfaces/group-manager";

const CYCLING_COLORS = [
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#84cc16",
  "#f97316",
] as const;

export function createGroupManager() {
  let colorIndex = 0;
  const nextColor = () => CYCLING_COLORS[colorIndex++ % CYCLING_COLORS.length];
  return createStore<GroupManager>()((set, get) => ({
    groups: [],
    activeGroupId: null,

    createGroup(name: string, artifactIds: string[]): ArtifactGroup {
      const group: ArtifactGroup = {
        id: `grp_${Date.now()}`,
        name,
        artifactIds: [...new Set(artifactIds)],
        color: nextColor(),
      };
      set((s) => ({ groups: [...s.groups, group] }));
      return group;
    },

    updateGroup(groupId: string, patch: Partial<Pick<ArtifactGroup, "name" | "color" | "metadata">>): void {
      set((s) => ({
        groups: s.groups.map((g) => g.id === groupId ? { ...g, ...patch } : g),
      }));
    },

    removeGroup(groupId: string): void {
      set((s) => ({
        groups: s.groups.filter((g) => g.id !== groupId),
        activeGroupId: s.activeGroupId === groupId ? null : s.activeGroupId,
      }));
    },

    addToGroup(groupId: string, artifactIds: string[]): void {
      set((s) => ({
        groups: s.groups.map((g) => {
          if (g.id !== groupId) return g;
          const existing = new Set(g.artifactIds);
          for (const id of artifactIds) existing.add(id);
          return { ...g, artifactIds: [...existing] };
        }),
      }));
    },

    removeFromGroup(groupId: string, artifactIds: string[]): void {
      const toRemove = new Set(artifactIds);
      set((s) => ({
        groups: s.groups.map((g) => {
          if (g.id !== groupId) return g;
          return { ...g, artifactIds: g.artifactIds.filter((id) => !toRemove.has(id)) };
        }),
      }));
    },

    getGroupForArtifact(artifactId: string): ArtifactGroup | undefined {
      return get().groups.find((g) => g.artifactIds.includes(artifactId));
    },

    activate(id: string | null): void {
      set({ activeGroupId: id });
    },
  }));
}
