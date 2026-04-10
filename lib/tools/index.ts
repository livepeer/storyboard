/**
 * Tool registry initialization.
 * Import this module to register all built-in tools.
 */

export { registerTool, registerTools, getTool, listTools, executeTool, clearTools } from "./registry";
export type { ToolDefinition, ToolResult, JSONSchema } from "./types";

import { registerTools } from "./registry";
import { sdkTools } from "./sdk-tools";
import { canvasTools } from "./canvas-tools";
import { skillTools } from "./skill-tools";
import { compoundTools } from "./compound-tools";
import { memoryTools } from "./memory-tools";
import { projectTools } from "./project-tools";
import { scopeTools } from "./scope-tools";

/** Register all built-in tools */
export function initializeTools(): void {
  registerTools(compoundTools);   // create_media (compound) — listed first for Claude
  registerTools(projectTools);    // project_create, project_generate, project_iterate, project_status
  registerTools(sdkTools);        // inference, stream_*, capabilities, train_lora
  registerTools(scopeTools);      // scope_start, scope_control, scope_stop, scope_preset, scope_graph, scope_status
  registerTools(canvasTools);     // canvas_create, canvas_update, canvas_get, canvas_remove
  registerTools(skillTools);      // load_skill
  registerTools(memoryTools);     // memory_style, memory_rate, memory_preference
}
