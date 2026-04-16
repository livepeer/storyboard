/**
 * MCP (Model Context Protocol) types for tool discovery and execution.
 */

/** Stored MCP server configuration */
export interface McpServerConfig {
  /** Unique ID for this connection */
  id: string;
  /** Display name */
  name: string;
  /** MCP server URL (SSE or streamable HTTP endpoint) */
  url: string;
  /** Auth type */
  authType: "none" | "bearer" | "oauth";
  /** Bearer token or OAuth access token */
  token?: string;
  /** Whether the server is currently connected */
  connected: boolean;
  /** Last successful connection timestamp */
  lastConnected?: number;
}

/** MCP tool definition (from server's tools/list response) */
export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  /** Which MCP server provides this tool */
  _mcpServerId: string;
  _mcpServerUrl: string;
}

/** MCP tool call request */
export interface McpToolCallRequest {
  serverUrl: string;
  token?: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/** MCP tool call response */
export interface McpToolCallResponse {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/** Pre-configured popular MCP servers */
export interface McpPreset {
  id: string;
  name: string;
  description: string;
  url: string;
  authType: "bearer" | "oauth" | "none";
  icon: string;
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "gmail-local",
    name: "Gmail (Local)",
    description: "Local Gmail MCP — run scripts/gmail-mcp-server.ts first",
    url: "http://localhost:3100/mcp",
    authType: "none",
    icon: "\u2709",
  },
  {
    id: "gmail",
    name: "Gmail (Claude.ai)",
    description: "Anthropic-hosted — requires Claude client approval",
    url: "https://gmail.mcp.claude.com/mcp",
    authType: "oauth",
    icon: "\u2709",
  },
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Access files and documents",
    url: "https://gdrive.mcp.claude.com/mcp",
    authType: "oauth",
    icon: "\uD83D\uDCC1",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Post messages and read channels",
    url: "https://slack.mcp.claude.com/mcp",
    authType: "oauth",
    icon: "\uD83D\uDCAC",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read and write Notion pages",
    url: "https://notion.mcp.claude.com/mcp",
    authType: "oauth",
    icon: "\uD83D\uDCD3",
  },
];
