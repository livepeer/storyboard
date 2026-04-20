/**
 * ArtifactStore — the core contract for managing creative artifacts.
 * Apps implement this with their own zustand store. Tools talk to
 * this interface, not to app-specific stores.
 */

export interface Artifact {
  id: string;
  refId: string;
  type: string;
  title: string;
  url?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArtifactEdge {
  id: string;
  fromRefId: string;
  toRefId: string;
  metadata?: Record<string, unknown>;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface ArtifactStore {
  artifacts: Artifact[];
  edges: ArtifactEdge[];
  viewport: Viewport;
  selectedIds: string[];

  add(opts: Partial<Artifact> & { type: string; title: string }): Artifact;
  update(id: string, patch: Partial<Artifact>): void;
  remove(id: string): void;
  getById(id: string): Artifact | undefined;
  getByRefId(refId: string): Artifact | undefined;

  connect(fromRefId: string, toRefId: string, meta?: Record<string, unknown>): void;
  disconnect(fromRefId: string, toRefId: string): void;

  select(ids: string[]): void;
  clearSelection(): void;

  setViewport(v: Partial<Viewport>): void;
  zoomTo(scale: number, centerX?: number, centerY?: number): void;

  applyLayout(positions: Array<{ id: string; x: number; y: number; w?: number; h?: number }>): void;
}
