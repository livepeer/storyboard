import {
  discoverTools,
  mcpToolsToAnthropicFormat,
  isMcpTool,
  parseMcpToolName,
  executeToolCall,
} from "@/lib/mcp/client";
import type { McpServerConfig, McpToolDef } from "@/lib/mcp/types";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { messages, tools, system, stream, mcpServers } = await req.json();

  // Discover MCP tools from connected servers
  let mcpToolDefs: McpToolDef[] = [];
  const mcpServerMap = new Map<string, McpServerConfig>();

  if (mcpServers && Array.isArray(mcpServers)) {
    for (const server of mcpServers as McpServerConfig[]) {
      if (!server.connected || !server.url) continue;
      mcpServerMap.set(server.id, server);
      try {
        const discovered = await discoverTools(server);
        mcpToolDefs.push(...discovered);
      } catch {
        // Server unreachable — skip silently, tools just won't be available
      }
    }
  }

  // Combine storyboard tools + MCP tools
  const allTools = [
    ...(tools || []),
    ...mcpToolsToAnthropicFormat(mcpToolDefs),
  ];

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system,
    tools: allTools,
    messages,
  };

  if (stream) {
    body.stream = true;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return Response.json(
        { error: `Anthropic API error ${resp.status}: ${text.slice(0, 200)}` },
        { status: resp.status }
      );
    }

    // Forward SSE stream
    return new Response(resp.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming (default)
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return Response.json(
      { error: `Anthropic API error ${resp.status}: ${text.slice(0, 200)}` },
      { status: resp.status }
    );
  }

  const result = await resp.json();

  // Check if response has MCP tool calls that need server-side execution
  const content = result.content as Array<{
    type: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;

  const mcpToolCalls = content?.filter(
    (b) => b.type === "tool_use" && b.name && isMcpTool(b.name)
  );

  if (mcpToolCalls && mcpToolCalls.length > 0) {
    // Execute MCP tool calls server-side and return results alongside the response
    const mcpResults: Array<{
      tool_use_id: string;
      name: string;
      result: string;
    }> = [];

    for (const tc of mcpToolCalls) {
      const parsed = parseMcpToolName(tc.name!);
      if (!parsed) {
        mcpResults.push({
          tool_use_id: tc.id!,
          name: tc.name!,
          result: JSON.stringify({ error: "Invalid MCP tool name" }),
        });
        continue;
      }

      const server = mcpServerMap.get(parsed.serverId);
      if (!server) {
        mcpResults.push({
          tool_use_id: tc.id!,
          name: tc.name!,
          result: JSON.stringify({
            error: `MCP server "${parsed.serverId}" not connected`,
          }),
        });
        continue;
      }

      const mcpResult = await executeToolCall(
        server.url,
        server.token,
        parsed.originalName,
        tc.input || {}
      );

      const textContent = mcpResult.content
        .map((c) => c.text || "")
        .filter(Boolean)
        .join("\n");

      mcpResults.push({
        tool_use_id: tc.id!,
        name: tc.name!,
        result: mcpResult.isError
          ? JSON.stringify({ error: textContent })
          : textContent || JSON.stringify(mcpResult.content),
      });
    }

    // Return both the original response and MCP results
    return Response.json({
      ...result,
      _mcpResults: mcpResults,
    });
  }

  return Response.json(result);
}
