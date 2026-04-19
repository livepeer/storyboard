import { createStore } from "zustand/vanilla";
import type { Artifact, ArtifactEdge, ArtifactStore, Viewport } from "../interfaces/artifact-store";

export interface ArtifactStoreOptions {
  /** Maximum number of artifacts to keep. Oldest are removed when exceeded. */
  maxArtifacts?: number;
  /** Card width in px. Default: 320. */
  cardW?: number;
  /** Card height in px. Default: 280. */
  cardH?: number;
  /** Gap between cards in px. Default: 24. */
  gap?: number;
  /** Number of columns in the auto-layout grid. Default: 5. */
  cols?: number;
}

const DEFAULT_W = 320;
const DEFAULT_H = 280;
const DEFAULT_GAP = 24;
const DEFAULT_COLS = 5;

function gridPosition(
  index: number,
  w: number,
  h: number,
  gap: number,
  cols: number,
): { x: number; y: number } {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: col * (w + gap),
    y: row * (h + gap),
  };
}

function edgeId(fromRefId: string, toRefId: string): string {
  return `${fromRefId}-->${toRefId}`;
}

export function createArtifactStore(opts?: ArtifactStoreOptions) {
  // Counters scoped to this store instance — no cross-contamination
  let idCounter = 0;
  let refCounter = 0;
  const nextId = () => String(++idCounter);
  const nextRefId = (type: string) => `${type}-${++refCounter}`;

  const cardW = opts?.cardW ?? DEFAULT_W;
  const cardH = opts?.cardH ?? DEFAULT_H;
  const gap = opts?.gap ?? DEFAULT_GAP;
  const cols = opts?.cols ?? DEFAULT_COLS;
  const maxArtifacts = opts?.maxArtifacts;

  return createStore<ArtifactStore>()((set, get) => ({
    artifacts: [],
    edges: [],
    viewport: { x: 0, y: 0, scale: 1 },
    selectedIds: [],

    add(opts: Partial<Artifact> & { type: string; title: string }): Artifact {
      const state = get();
      const index = state.artifacts.length;
      const pos = gridPosition(index, cardW, cardH, gap, cols);

      const artifact: Artifact = {
        id: opts.id ?? nextId(),
        refId: opts.refId ?? nextRefId(opts.type),
        type: opts.type,
        title: opts.title,
        url: opts.url,
        error: opts.error,
        metadata: opts.metadata,
        x: opts.x ?? pos.x,
        y: opts.y ?? pos.y,
        w: opts.w ?? cardW,
        h: opts.h ?? cardH,
      };

      set((s) => {
        let next = [...s.artifacts, artifact];
        if (maxArtifacts != null && next.length > maxArtifacts) {
          next = next.slice(next.length - maxArtifacts);
        }
        return { artifacts: next };
      });

      return artifact;
    },

    update(id: string, patch: Partial<Artifact>): void {
      set((s) => ({
        artifacts: s.artifacts.map((a) =>
          a.id === id ? { ...a, ...patch } : a,
        ),
      }));
    },

    remove(id: string): void {
      set((s) => {
        const artifact = s.artifacts.find((a) => a.id === id);
        if (!artifact) return s;
        const refId = artifact.refId;
        return {
          artifacts: s.artifacts.filter((a) => a.id !== id),
          edges: s.edges.filter(
            (e) => e.fromRefId !== refId && e.toRefId !== refId,
          ),
          selectedIds: s.selectedIds.filter((sid) => sid !== id),
        };
      });
    },

    getById(id: string): Artifact | undefined {
      return get().artifacts.find((a) => a.id === id);
    },

    getByRefId(refId: string): Artifact | undefined {
      return get().artifacts.find((a) => a.refId === refId);
    },

    connect(fromRefId: string, toRefId: string, meta?: Record<string, unknown>): void {
      const edge: ArtifactEdge = {
        id: edgeId(fromRefId, toRefId),
        fromRefId,
        toRefId,
        metadata: meta,
      };
      set((s) => {
        // Avoid duplicate edges
        const exists = s.edges.some(
          (e) => e.fromRefId === fromRefId && e.toRefId === toRefId,
        );
        if (exists) return s;
        return { edges: [...s.edges, edge] };
      });
    },

    disconnect(fromRefId: string, toRefId: string): void {
      set((s) => ({
        edges: s.edges.filter(
          (e) => !(e.fromRefId === fromRefId && e.toRefId === toRefId),
        ),
      }));
    },

    select(ids: string[]): void {
      set({ selectedIds: ids });
    },

    clearSelection(): void {
      set({ selectedIds: [] });
    },

    setViewport(v: Partial<Viewport>): void {
      set((s) => ({ viewport: { ...s.viewport, ...v } }));
    },

    zoomTo(scale: number, centerX?: number, centerY?: number): void {
      set((s) => ({
        viewport: {
          x: centerX ?? s.viewport.x,
          y: centerY ?? s.viewport.y,
          scale,
        },
      }));
    },

    applyLayout(
      positions: Array<{ id: string; x: number; y: number; w?: number; h?: number }>,
    ): void {
      set((s) => {
        const patchMap = new Map(positions.map((p) => [p.id, p]));
        return {
          artifacts: s.artifacts.map((a) => {
            const p = patchMap.get(a.id);
            if (!p) return a;
            return {
              ...a,
              x: p.x,
              y: p.y,
              w: p.w ?? a.w,
              h: p.h ?? a.h,
            };
          }),
        };
      });
    },
  }));
}
