import { ToolRegistry } from "@livepeer/agent";
import { CanvasStore } from "./store.js";
import { canvasGetTool } from "./tools/get.js";
import { canvasCreateTool } from "./tools/create.js";
import { canvasUpdateTool } from "./tools/update.js";
import { canvasRemoveTool } from "./tools/remove.js";
import { canvasOrganizeTool } from "./tools/organize.js";

export { CanvasStore } from "./store.js";
export type { CanvasCard } from "./store.js";
export { autoLayout, narrativeLayout } from "./layout.js";
export {
  canvasGetTool,
  canvasCreateTool,
  canvasUpdateTool,
  canvasRemoveTool,
  canvasOrganizeTool,
};

export interface RegisterCanvasPackOpts {
  tools: ToolRegistry;
  store?: CanvasStore;
}

export function registerCanvasPack(opts: RegisterCanvasPackOpts): CanvasStore {
  const store = opts.store ?? new CanvasStore();
  opts.tools.register(canvasGetTool(store));
  opts.tools.register(canvasCreateTool(store));
  opts.tools.register(canvasUpdateTool(store));
  opts.tools.register(canvasRemoveTool(store));
  opts.tools.register(canvasOrganizeTool(store));
  return store;
}
