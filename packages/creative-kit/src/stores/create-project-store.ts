import { createStore } from "zustand/vanilla";
import type {
  ItemStatus,
  PipelineItem,
  Project,
  ProjectPipeline,
} from "../interfaces/project-pipeline";

export interface ProjectStoreOptions {
  /** Maximum number of projects to keep. Oldest are removed when exceeded. Default: 30. */
  maxProjects?: number;
}

const FILLER_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "that", "this",
  "these", "those", "i", "my", "me", "we", "our", "you", "your",
]);

function toFriendlyName(brief: string): string {
  const words = brief
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !FILLER_WORDS.has(w))
    .slice(0, 4);

  return words.length > 0 ? words.join("-") : "project";
}

export function createProjectStore(opts?: ProjectStoreOptions) {
  let projectCounter = 0;
  const maxProjects = opts?.maxProjects ?? 30;

  return createStore<ProjectPipeline>()((set, get) => ({
    projects: [],
    activeProjectId: null,

    create(
      brief: string,
      items: Omit<PipelineItem, "status">[],
      meta?: Record<string, unknown>,
    ): Project {
      const counter = ++projectCounter;
      const friendlyName = toFriendlyName(brief);
      const id = `${friendlyName}_${counter.toString(36)}`;

      const project: Project = {
        id,
        name: friendlyName,
        brief,
        items: items.map((item) => ({ ...item, status: "pending" as ItemStatus })),
        status: "planning",
        createdAt: Date.now(),
        metadata: meta,
      };

      set((s) => {
        let next = [...s.projects, project];
        if (next.length > maxProjects) {
          next = next.slice(next.length - maxProjects);
        }
        return { projects: next, activeProjectId: id };
      });

      return project;
    },

    getActive(): Project | undefined {
      const { projects, activeProjectId } = get();
      return projects.find((p) => p.id === activeProjectId);
    },

    setActive(id: string | null): void {
      set({ activeProjectId: id });
    },

    getById(id: string): Project | undefined {
      return get().projects.find((p) => p.id === id);
    },

    getByName(name: string): Project | undefined {
      const lower = name.toLowerCase();
      return get().projects.find(
        (p) =>
          p.id.toLowerCase().includes(lower) ||
          p.name.toLowerCase().includes(lower) ||
          p.brief.toLowerCase().includes(lower),
      );
    },

    updateItemStatus(
      projectId: string,
      index: number,
      status: ItemStatus,
      artifactRefId?: string,
    ): void {
      set((s) => ({
        projects: s.projects.map((p) => {
          if (p.id !== projectId) return p;
          const items = p.items.map((item) => {
            if (item.index !== index) return item;
            return {
              ...item,
              status,
              ...(artifactRefId !== undefined ? { artifactRefId } : {}),
            };
          });
          // Recompute project status
          const allDone = items.every((item) => item.status === "done");
          const anyGenerating = items.some(
            (item) => item.status === "generating" || item.status === "regenerating",
          );
          const projectStatus = allDone
            ? "complete"
            : anyGenerating
            ? "generating"
            : p.status === "complete"
            ? "generating"
            : p.status;
          return { ...p, items, status: projectStatus };
        }),
      }));
    },

    getNextBatch(projectId: string, batchSize = 5): PipelineItem[] {
      const project = get().projects.find((p) => p.id === projectId);
      if (!project) return [];
      return project.items
        .filter((item) => item.status === "pending" || item.status === "regenerating")
        .slice(0, batchSize);
    },

    isComplete(projectId: string): boolean {
      const project = get().projects.find((p) => p.id === projectId);
      if (!project || project.items.length === 0) return false;
      return project.items.every((item) => item.status === "done");
    },
  }));
}
