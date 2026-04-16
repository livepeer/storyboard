export interface Scene {
  id: string;
  title: string;
  prompt: string;
  status?: "pending" | "in_progress" | "done" | "failed";
  url?: string;
  capability?: string;
}

export interface ProjectStyle {
  visual_style?: string;
  color_palette?: string;
  mood?: string;
  prompt_prefix?: string;
}

export interface Project {
  id: string;
  title: string;
  scenes: Scene[];
  style: ProjectStyle;
  createdAt: number;
}

export class ProjectStore {
  private projects = new Map<string, Project>();

  create(input: Omit<Project, "id" | "createdAt">): Project {
    const id = `prj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const project: Project = { ...input, id, createdAt: Date.now() };
    this.projects.set(id, project);
    return project;
  }

  get(id: string): Project | undefined {
    return this.projects.get(id);
  }

  list(): Project[] {
    return [...this.projects.values()];
  }

  delete(id: string): boolean {
    return this.projects.delete(id);
  }

  addScene(projectId: string, scene: Scene): void {
    const p = this.projects.get(projectId);
    if (!p) throw new Error(`Unknown project: ${projectId}`);
    p.scenes.push(scene);
  }

  updateScene(projectId: string, sceneId: string, patch: Partial<Scene>): void {
    const p = this.projects.get(projectId);
    if (!p) throw new Error(`Unknown project: ${projectId}`);
    const i = p.scenes.findIndex((s) => s.id === sceneId);
    if (i < 0) throw new Error(`Unknown scene: ${sceneId}`);
    p.scenes[i] = { ...p.scenes[i], ...patch };
  }
}
