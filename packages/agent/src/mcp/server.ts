import { ToolRegistry } from "../tools/registry.js";
import type { McpRequest, McpResponse, McpToolDef } from "./types.js";

export class McpServer {
  constructor(private tools: ToolRegistry) {}

  listTools(): McpToolDef[] {
    return this.tools.list()
      .filter((t) => t.mcp_exposed === true)
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      }));
  }

  async handle(req: McpRequest): Promise<McpResponse> {
    try {
      switch (req.method) {
        case "initialize":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: { protocolVersion: "2024-11-05", capabilities: { tools: {} } },
          };
        case "tools/list":
          return { jsonrpc: "2.0", id: req.id, result: { tools: this.listTools() } };
        case "tools/call": {
          const { name, arguments: args } = req.params as {
            name: string;
            arguments: Record<string, unknown>;
          };
          const tool = this.tools.get(name);
          if (!tool || tool.mcp_exposed !== true) {
            return {
              jsonrpc: "2.0",
              id: req.id,
              error: { code: -32601, message: `Unknown tool: ${name}` },
            };
          }
          const result = await tool.execute(args, {});
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }] },
          };
        }
      }
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: `Unknown method: ${req.method}` },
      };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32603, message: (e as Error).message },
      };
    }
  }

  async serve(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): Promise<void> {
    let buf = "";
    for await (const chunk of stdin) {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const req = JSON.parse(line) as McpRequest;
          const res = await this.handle(req);
          stdout.write(JSON.stringify(res) + "\n");
        } catch (e) {
          // Malformed JSON — write a parse error
          stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" },
            }) + "\n",
          );
        }
      }
    }
  }
}
