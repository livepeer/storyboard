/**
 * GroupManager — generic artifact grouping (episodes, collections, folders).
 */

export interface ArtifactGroup {
  id: string;
  name: string;
  artifactIds: string[];
  color: string;
  metadata?: Record<string, unknown>;
}

export interface GroupManager {
  groups: ArtifactGroup[];
  activeGroupId: string | null;

  createGroup(name: string, artifactIds: string[]): ArtifactGroup;
  addToGroup(groupId: string, artifactIds: string[]): void;
  removeFromGroup(groupId: string, artifactIds: string[]): void;
  getGroupForArtifact(artifactId: string): ArtifactGroup | undefined;
  activate(id: string | null): void;
}
