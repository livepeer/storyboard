import type { ToolDefinition, ToolResult } from "./types";

const tools = new Map<string, ToolDefinition>();
let initialized = false;

/** Ensure tools are registered. Called automatically on first access. */
function ensureInitialized(): void {
  if (initialized && tools.size > 0) return;
  try {
    // Dynamic import to avoid circular deps — index.ts re-exports from registry.ts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initializeTools } = require("./index");
    initializeTools();
  } catch { /* tests may not have index.ts */ }
}

/**
 * Register a tool definition. Overwrites if name already exists.
 */
export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
  initialized = true;
}

/**
 * Register multiple tool definitions at once.
 */
export function registerTools(defs: ToolDefinition[]): void {
  for (const tool of defs) {
    tools.set(tool.name, tool);
  }
  initialized = true;
}

/**
 * Get a tool by name.
 */
export function getTool(name: string): ToolDefinition | undefined {
  ensureInitialized();
  return tools.get(name);
}

/**
 * List all registered tools.
 */
export function listTools(): ToolDefinition[] {
  ensureInitialized();
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
  ensureInitialized();
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
  initialized = false;
}
