import type { Artifact, ArtifactEdge } from "../interfaces/artifact-store";

export interface CanvasSnapshot {
  cards: Artifact[];
  edges: ArtifactEdge[];
}

export interface NamedSnapshot extends CanvasSnapshot {
  name: string;
  timestamp: number;
  thumbnail?: string;
}

export interface HistoryManager {
  pushUndo(snapshot: CanvasSnapshot): void;
  undo(): CanvasSnapshot | null;
  redo(): CanvasSnapshot | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  saveSnapshot(name: string, snapshot: CanvasSnapshot, thumbnail?: string): void;
  restoreSnapshot(name: string): CanvasSnapshot | null;
  listSnapshots(): NamedSnapshot[];
  removeSnapshot(name: string): void;
}

const STORAGE_KEY = "canvas_snapshots";

function loadSnapshots(): NamedSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSnapshots(snapshots: NamedSnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // localStorage full or unavailable — silently drop
  }
}

export function createHistoryManager(opts?: {
  maxUndo?: number;
  maxSnapshots?: number;
}): HistoryManager {
  const maxUndo = opts?.maxUndo ?? 50;
  const maxSnapshots = opts?.maxSnapshots ?? 20;

  const undoStack: CanvasSnapshot[] = [];
  const redoStack: CanvasSnapshot[] = [];

  const manager: HistoryManager = {
    pushUndo(snapshot: CanvasSnapshot): void {
      undoStack.push(snapshot);
      if (undoStack.length > maxUndo) {
        undoStack.shift();
      }
      // New mutation clears redo history
      redoStack.length = 0;
    },

    undo(): CanvasSnapshot | null {
      const snapshot = undoStack.pop() ?? null;
      if (snapshot) {
        redoStack.push(snapshot);
      }
      return snapshot;
    },

    redo(): CanvasSnapshot | null {
      const snapshot = redoStack.pop() ?? null;
      if (snapshot) {
        undoStack.push(snapshot);
      }
      return snapshot;
    },

    get canUndo(): boolean {
      return undoStack.length > 0;
    },

    get canRedo(): boolean {
      return redoStack.length > 0;
    },

    saveSnapshot(
      name: string,
      snapshot: CanvasSnapshot,
      thumbnail?: string,
    ): void {
      const snapshots = loadSnapshots();
      // Replace if same name exists
      const idx = snapshots.findIndex((s) => s.name === name);
      const entry: NamedSnapshot = {
        ...snapshot,
        name,
        timestamp: Date.now(),
        thumbnail,
      };
      if (idx >= 0) {
        snapshots[idx] = entry;
      } else {
        snapshots.push(entry);
        // Evict oldest if over limit
        while (snapshots.length > maxSnapshots) {
          snapshots.shift();
        }
      }
      persistSnapshots(snapshots);
    },

    restoreSnapshot(name: string): CanvasSnapshot | null {
      const snapshots = loadSnapshots();
      const found = snapshots.find((s) => s.name === name);
      if (!found) return null;
      return { cards: found.cards, edges: found.edges };
    },

    listSnapshots(): NamedSnapshot[] {
      return loadSnapshots();
    },

    removeSnapshot(name: string): void {
      const snapshots = loadSnapshots().filter((s) => s.name !== name);
      persistSnapshots(snapshots);
    },
  };

  return manager;
}
