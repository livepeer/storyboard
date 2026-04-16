/**
 * MCP client — discovers tools and executes tool calls against MCP servers.
 * Used server-side in the API route (not in the browser).
 */

import type {
  McpServerConfig,
  McpToolDef,
  McpToolCallResponse,
} from "./types";

/**
 * Discover tools from an MCP server via the Streamable HTTP transport.
 * Sends a JSON-RPC request to the server's endpoint.
 */
export async function discoverTools(
  server: McpServerConfig
): Promise<McpToolDef[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (server.token) {
    headers["Authorization"] = `Bearer ${server.token}`;
  }

  const resp = await fetch(server.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });

  if (!resp.ok) {
    throw new Error(
      `MCP server ${server.name} returned ${resp.status}`
    );
  }

  const data = (await resp.json()) as {
    result?: {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: McpToolDef["inputSchema"];
      }>;
    };
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`MCP error from ${server.name}: ${data.error.message}`);
  }

  const tools = data.result?.tools || [];
  return tools.map((t) => ({
    name: `mcp__${server.id}__${t.name}`,
    description: `[${server.name}] ${t.description || t.name}`,
    inputSchema: t.inputSchema || { type: "object" as const },
    _mcpServerId: server.id,
    _mcpServerUrl: server.url,
  }));
}

/**
 * Execute a tool call against an MCP server.
 */
export async function executeToolCall(
  serverUrl: string,
  token: string | undefined,
  originalToolName: string,
  args: Record<string, unknown>
): Promise<McpToolCallResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(serverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: originalToolName,
        arguments: args,
      },
    }),
  });

  if (!resp.ok) {
    return {
      content: [{ type: "text", text: `MCP server error: HTTP ${resp.status}` }],
      isError: true,
    };
  }

  const data = (await resp.json()) as {
    result?: McpToolCallResponse;
    error?: { message: string };
  };

  if (data.error) {
    return {
      content: [{ type: "text", text: `MCP error: ${data.error.message}` }],
      isError: true,
    };
  }

  return data.result || { content: [{ type: "text", text: "No result" }] };
}

// ---------------------------------------------------------------------------
// Browser-safe proxies — route through /api/mcp/* to avoid CORS
// ---------------------------------------------------------------------------

/**
 * Discover tools via the server-side proxy at /api/mcp/discover.
 * Use this from browser-side code (Gemini/OpenAI plugins). The direct
 * discoverTools() hits CORS because MCP servers don't set
 * Access-Control-Allow-Origin headers.
 */
export async function discoverToolsViaProxy(
  server: McpServerConfig
): Promise<McpToolDef[]> {
  const resp = await fetch("/api/mcp/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverUrl: server.url, token: server.token }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error((err as Record<string, string>).error || `MCP proxy error ${resp.status}`);
  }

  const data = (await resp.json()) as {
    result?: { tools?: Array<{ name: string; description?: string; inputSchema?: McpToolDef["inputSchema"] }> };
    error?: { message: string };
  };

  if (data.error) throw new Error(`MCP error: ${data.error.message}`);
  const tools = data.result?.tools || [];
  return tools.map((t) => ({
    name: `mcp__${server.id}__${t.name}`,
    description: `[${server.name}] ${t.description || t.name}`,
    inputSchema: t.inputSchema || { type: "object" as const },
    _mcpServerId: server.id,
    _mcpServerUrl: server.url,
  }));
}

/**
 * Execute a tool call via the server-side proxy at /api/mcp/call.
 * Browser-safe equivalent of executeToolCall().
 */
export async function executeToolCallViaProxy(
  serverUrl: string,
  token: string | undefined,
  originalToolName: string,
  args: Record<string, unknown>
): Promise<McpToolCallResponse> {
  const resp = await fetch("/api/mcp/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverUrl, token, toolName: originalToolName, args }),
  });

  if (!resp.ok) {
    return {
      content: [{ type: "text", text: `MCP proxy error: HTTP ${resp.status}` }],
      isError: true,
    };
  }

  const data = (await resp.json()) as {
    result?: McpToolCallResponse;
    error?: { message: string };
  };

  if (data.error) {
    return {
      content: [{ type: "text", text: `MCP error: ${data.error.message}` }],
      isError: true,
    };
  }

  return data.result || { content: [{ type: "text", text: "No result" }] };
}

/**
 * Check if a tool name is an MCP tool (prefixed with mcp__).
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith("mcp__");
}

/**
 * Parse an MCP tool name to extract server ID and original tool name.
 * Format: mcp__{serverId}__{originalName}
 */
export function parseMcpToolName(toolName: string): {
  serverId: string;
  originalName: string;
} | null {
  const match = toolName.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
  if (!match) return null;
  return { serverId: match[1], originalName: match[2] };
}

/**
 * Convert MCP tool definitions to Anthropic tool format for Claude.
 */
export function mcpToolsToAnthropicFormat(
  tools: McpToolDef[]
): Array<{
  name: string;
  description: string;
  input_schema: McpToolDef["inputSchema"];
}> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description || t.name,
    input_schema: t.inputSchema,
  }));
}

/**
 * Convert MCP tool definitions to OpenAI function format.
 */
export function mcpToolsToOpenAIFormat(
  tools: McpToolDef[]
): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: McpToolDef["inputSchema"];
  };
}> {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description || t.name,
      parameters: t.inputSchema,
    },
  }));
}
