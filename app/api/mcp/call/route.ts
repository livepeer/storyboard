/**
 * Server-side MCP tool execution proxy.
 *
 * Same CORS rationale as /api/mcp/discover. Proxies the JSON-RPC
 * tools/call method to the MCP server so browser-side plugins can
 * execute MCP tools without hitting CORS.
 */

export async function POST(req: Request) {
  const { serverUrl, token, toolName, args } = (await req.json()) as {
    serverUrl: string;
    token?: string;
    toolName: string;
    args: Record<string, unknown>;
  };

  if (!serverUrl || !toolName) {
    return Response.json(
      { error: "serverUrl and toolName are required" },
      { status: 400 }
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const resp = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return Response.json(
        { error: `MCP tool call failed: ${resp.status}: ${text.slice(0, 200)}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: `MCP call failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 }
    );
  }
}
