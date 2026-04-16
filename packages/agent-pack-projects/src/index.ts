import { ToolRegistry } from "@livepeer/agent";
import { ProjectStore } from "./store.js";
import { projectCreateTool } from "./tools/create.js";
import { projectIterateTool } from "./tools/iterate.js";
import { projectGenerateTool } from "./tools/generate.js";
import { projectStatusTool } from "./tools/status.js";

export { ProjectStore } from "./store.js";
export type { Scene, Project, ProjectStyle } from "./store.js";
export { projectCreateTool, projectIterateTool, projectGenerateTool, projectStatusTool };

export interface RegisterProjectsPackOpts {
  tools: ToolRegistry;
  store?: ProjectStore;
}

export function registerProjectsPack(opts: RegisterProjectsPackOpts): ProjectStore {
  const store = opts.store ?? new ProjectStore();
  opts.tools.register(projectCreateTool(store));
  opts.tools.register(projectIterateTool(store));
  opts.tools.register(projectGenerateTool(store));
  opts.tools.register(projectStatusTool(store));
  return store;
}
