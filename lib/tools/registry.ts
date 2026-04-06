import type { ToolDefinition, ToolResult } from "./types";

const tools = new Map<string, ToolDefinition>();

/**
 * Register a tool definition. Overwrites if name already exists.
 */
export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
}

/**
 * Register multiple tool definitions at once.
 */
export function registerTools(defs: ToolDefinition[]): void {
  for (const tool of defs) {
    registerTool(tool);
  }
}

/**
 * Get a tool by name.
 */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

/**
 * List all registered tools.
 */
export function listTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

/**
 * Execute a tool by name with the given input.
 * Throws if the tool is not found.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    return { success: false, error: `Tool "${name}" not found` };
  }
  try {
    return await tool.execute(input);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Clear all registered tools (useful for testing).
 */
export function clearTools(): void {
  tools.clear();
}
