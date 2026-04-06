/**
 * Tool definitions for the agent plugin system.
 * Tools are shared across all plugins (built-in, Claude, OpenAI).
 */

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: string[];
  items?: JSONSchema;
  default?: unknown;
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition {
  /** Unique tool name (e.g., "inference", "canvas_create") */
  name: string;
  /** Human-readable description for LLM tool_use */
  description: string;
  /** JSON Schema for the tool's input parameters */
  parameters: JSONSchema;
  /** Execute the tool with validated input */
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}
