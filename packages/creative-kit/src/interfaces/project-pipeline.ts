/**
 * ProjectPipeline — generic batch-processing pipeline with status tracking.
 * Manages projects that contain ordered items (scenes, steps, tracks)
 * each progressing through a status workflow.
 */

export type ItemStatus = "pending" | "generating" | "done" | "failed" | "regenerating";
export type ProjectStatus = "planning" | "generating" | "complete";

export interface PipelineItem {
  index: number;
  title: string;
  prompt: string;
  action: string;
  status: ItemStatus;
  artifactRefId?: string;
  metadata?: Record<string, unknown>;
}

export interface Project {
  id: string;
  name: string;
  brief: string;
  items: PipelineItem[];
  status: ProjectStatus;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface ProjectPipeline {
  projects: Project[];
  activeProjectId: string | null;

  create(brief: string, items: Omit<PipelineItem, "status">[], meta?: Record<string, unknown>): Project;
  getActive(): Project | undefined;
  setActive(id: string | null): void;
  getById(id: string): Project | undefined;
  getByName(name: string): Project | undefined;

  updateItemStatus(projectId: string, index: number, status: ItemStatus, artifactRefId?: string): void;
  getNextBatch(projectId: string, batchSize?: number): PipelineItem[];
  isComplete(projectId: string): boolean;
}
