import type { ToolDefinition } from "./types.js";
import type { ToolSchema } from "../providers/types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition<any, any>>();

  register(tool: ToolDefinition<any, any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition<any, any>[] {
    return [...this.tools.values()];
  }

  /** Tool subset exposed via MCP. [INV-7]: this list MUST be exactly 8. */
  mcpExposed(): ToolDefinition<any, any>[] {
    return this.list().filter((t) => t.mcp_exposed === true);
  }

  /** Marshal tool definitions into provider-facing schemas for the LLM. */
  schemas(filter?: (t: ToolDefinition<any, any>) => boolean): ToolSchema[] {
    return this.list()
      .filter(filter ?? (() => true))
      .map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
  }
}
