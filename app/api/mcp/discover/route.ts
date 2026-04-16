/**
 * Server-side MCP tool discovery proxy.
 *
 * MCP servers don't set CORS headers (they're designed for server-to-
 * server or stdio transport). Browser-side discoverTools() from
 * lib/mcp/client.ts fails with "Failed to fetch" due to CORS block.
 * This route proxies the JSON-RPC tools/list call server-side where
 * there's no CORS enforcement.
 *
 * Used by Gemini and OpenAI plugins. Claude's route handles MCP
 * discovery inline in /api/agent/chat/route.ts.
 */

export async function POST(req: Request) {
  const { serverUrl, token } = (await req.json()) as {
    serverUrl: string;
    token?: string;
  };

  if (!serverUrl) {
    return Response.json({ error: "serverUrl is required" }, { status: 400 });
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
        method: "tools/list",
        params: {},
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return Response.json(
        { error: `MCP server returned ${resp.status}: ${text.slice(0, 200)}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: `MCP discovery failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 }
    );
  }
}
