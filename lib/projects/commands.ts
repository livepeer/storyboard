/**
 * /project command handler — manage projects from the chat.
 *
 * Subcommands:
 *   /project               → help text
 *   /project list           → show all projects with status
 *   /project switch <id>    → set a project as the active one
 *   /project add <prompt>   → create a new empty project from a name/brief
 *   /project show [id]      → show details of active or specific project
 *   /project clear          → remove all projects
 */

import { useProjectStore } from "./store";
import type { Project } from "./types";

/** Envelope marker for project list — MessageBubble renders with clickable names */
export const PROJECT_LIST_MARKER = "@@projectlist@@";
export const PROJECT_LIST_END = "@@/projectlist@@";

export function isProjectListEnvelope(text: string): boolean {
  return text.startsWith(PROJECT_LIST_MARKER) && text.includes(PROJECT_LIST_END);
}

export interface ProjectListData {
  projects: Array<{
    id: string;
    name: string;
    brief: string;
    status: string;
    sceneCount: number;
    doneCount: number;
    isActive: boolean;
    age: string;
  }>;
}

export function parseProjectListEnvelope(text: string): ProjectListData | null {
  if (!isProjectListEnvelope(text)) return null;
  const inner = text
    .slice(PROJECT_LIST_MARKER.length, text.indexOf(PROJECT_LIST_END))
    .trim();
  try {
    return JSON.parse(inner) as ProjectListData;
  } catch {
    return null;
  }
}

function renderProjectListEnvelope(data: ProjectListData): string {
  return `${PROJECT_LIST_MARKER}${JSON.stringify(data)}${PROJECT_LIST_END}`;
}

function ageLabel(createdAt: number): string {
  const ms = Date.now() - createdAt;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function projectDisplayName(project: Project): string {
  // Extract the friendly part before the _suffix
  const parts = project.id.split("_");
  return parts.length > 1 ? parts.slice(0, -1).join("_") : project.id;
}

export async function handleProjectCommand(args: string): Promise<string> {
  const trimmed = args.trim();
  const [sub, ...rest] = trimmed.split(/\s+/);
  const restArgs = rest.join(" ").trim();
  const lowerSub = sub?.toLowerCase() ?? "";

  if (!trimmed) return projectHelp();

  if (lowerSub === "list" || lowerSub === "ls") return projectList();

  if (lowerSub === "switch" || lowerSub === "use" || lowerSub === "select") {
    if (!restArgs) return "Usage: /project switch <name or id>";
    return projectSwitch(restArgs);
  }

  if (lowerSub === "add" || lowerSub === "create" || lowerSub === "new") {
    if (!restArgs) return "Usage: /project add <brief description>";
    return projectAdd(restArgs);
  }

  if (lowerSub === "show" || lowerSub === "info") {
    return projectShow(restArgs);
  }

  if (lowerSub === "replay" || lowerSub === "rerun") {
    return projectReplay(restArgs);
  }

  if (lowerSub === "clear") {
    useProjectStore.getState().clearProjects();
    return "All projects cleared.";
  }

  // Treat as brief for a new project
  return projectAdd(trimmed);
}

function projectHelp(): string {
  return [
    "Usage:",
    "  /project list              — show all projects",
    "  /project show [name]       — details of active or named project",
    "  /project switch <name>     — set as active project",
    "  /project add <brief>       — create a new project",
    "  /project replay [name]     — regenerate all scenes from stored prompts",
    "  /project clear             — remove all projects",
    "",
    "Active project receives all new cards from agent generation.",
  ].join("\n");
}

function projectList(): string {
  const store = useProjectStore.getState();
  const projects = store.projects;
  if (projects.length === 0) {
    return "No projects yet. Generate images or use /project add <brief> to create one.";
  }

  const data: ProjectListData = {
    projects: projects.map((p) => ({
      id: p.id,
      name: projectDisplayName(p),
      brief: p.brief.slice(0, 80),
      status: p.status,
      sceneCount: p.scenes.length,
      doneCount: p.scenes.filter((s) => s.status === "done").length,
      isActive: p.id === store.activeProjectId,
      age: ageLabel(p.createdAt),
    })),
  };

  return renderProjectListEnvelope(data);
}

function projectSwitch(query: string): string {
  const store = useProjectStore.getState();
  const lower = query.toLowerCase();

  // Match by id, friendly name, or partial match
  const match = store.projects.find((p) => {
    if (p.id === query) return true;
    if (p.id.toLowerCase().startsWith(lower)) return true;
    const name = projectDisplayName(p).toLowerCase();
    if (name === lower || name.startsWith(lower)) return true;
    return false;
  });

  if (!match) {
    return `No project matching "${query}". Use /project list to see available projects.`;
  }

  store.setActiveProject(match.id);
  const name = projectDisplayName(match);
  return `Switched to project "${name}" (${match.scenes.length} scenes, ${match.status})`;
}

function projectAdd(brief: string): string {
  const store = useProjectStore.getState();
  const project = store.createProject(brief, []);
  const name = projectDisplayName(project);
  return `Created project "${name}" — it's now the active project. New cards will be grouped here.`;
}

function projectShow(idOrEmpty: string): string {
  const store = useProjectStore.getState();
  const project = idOrEmpty
    ? store.projects.find((p) => {
        const lower = idOrEmpty.toLowerCase();
        return p.id === idOrEmpty
          || p.id.toLowerCase().startsWith(lower)
          || projectDisplayName(p).toLowerCase().startsWith(lower);
      })
    : store.getActiveProject();

  if (!project) {
    return idOrEmpty
      ? `No project matching "${idOrEmpty}".`
      : "No active project. Use /project list or /project add <brief>.";
  }

  const name = projectDisplayName(project);
  const lines = [
    `Project: ${name}`,
    `Brief: ${project.brief}`,
    `Status: ${project.status}`,
    `Scenes: ${project.scenes.length} (${project.scenes.filter((s) => s.status === "done").length} done)`,
  ];

  if (project.tokensUsed) {
    const t = project.tokensUsed;
    lines.push(`Tokens: ${(t.input + t.output).toLocaleString()} across ${t.turns} turn${t.turns === 1 ? "" : "s"}`);
  }

  if (project.scenes.length > 0) {
    lines.push("");
    for (const s of project.scenes) {
      const icon = s.status === "done" ? "✓" : s.status === "generating" ? "⏳" : "○";
      const ref = s.cardRefId ? ` → ${s.cardRefId}` : "";
      lines.push(`  ${icon} Scene ${s.index + 1}: ${s.title}${ref}`);
    }
  }

  return lines.join("\n");
}

/**
 * Replay a project — reset all scenes to pending and run project_generate.
 * Uses the stored prompts/actions/style so the result is a fresh generation
 * from the same blueprint.
 */
async function projectReplay(idOrEmpty: string): Promise<string> {
  const store = useProjectStore.getState();
  const project = idOrEmpty
    ? store.projects.find((p) => {
        const lower = idOrEmpty.toLowerCase();
        return p.id === idOrEmpty
          || p.id.toLowerCase().startsWith(lower)
          || projectDisplayName(p).toLowerCase().startsWith(lower);
      })
    : store.getActiveProject();

  if (!project) {
    return idOrEmpty
      ? `No project matching "${idOrEmpty}".`
      : "No active project. Use /project list to pick one.";
  }
  if (project.scenes.length === 0) {
    return `Project "${projectDisplayName(project)}" has no scenes to replay.`;
  }

  // Reset all scenes to pending
  for (let i = 0; i < project.scenes.length; i++) {
    store.updateSceneStatus(project.id, i, "pending");
  }
  store.updateProjectStatus(project.id, "generating");
  store.setActiveProject(project.id);

  // Run project_generate
  try {
    const { listTools } = await import("@/lib/tools/registry");
    const genTool = listTools().find((t) => t.name === "project_generate");
    if (!genTool) return "Replay failed: project_generate tool not registered.";
    await genTool.execute({ project_id: project.id });
  } catch (e) {
    return `Replay failed: ${e instanceof Error ? e.message : "unknown"}`;
  }

  const name = projectDisplayName(project);
  return `Replayed "${name}" — ${project.scenes.length} scenes regenerated. Check the canvas.`;
}
