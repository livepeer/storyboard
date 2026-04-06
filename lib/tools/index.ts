/**
 * Tool registry initialization.
 * Import this module to register all built-in tools.
 */

export { registerTool, registerTools, getTool, listTools, executeTool, clearTools } from "./registry";
export type { ToolDefinition, ToolResult, JSONSchema } from "./types";

import { registerTools } from "./registry";
import { sdkTools } from "./sdk-tools";
import { canvasTools } from "./canvas-tools";

/** Register all built-in tools */
export function initializeTools(): void {
  registerTools(sdkTools);
  registerTools(canvasTools);
}
