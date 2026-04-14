import { describe, it, expect } from "vitest";
import { McpServer } from "../../../src/mcp/server.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { MCP_EXPOSED_TOOLS } from "../../../src/tools/builtin/index.js";

function makeRegistryWithMcpTools(): ToolRegistry {
  const reg = new ToolRegistry();
  for (const t of MCP_EXPOSED_TOOLS) reg.register(t as any);
  return reg;
}

describe("McpServer", () => {
  it("exposes exactly 8 tools [INV-7]", () => {
    const reg = makeRegistryWithMcpTools();
    const server = new McpServer(reg);
    expect(server.listTools()).toHaveLength(8);
  });

  it("rejects calls to non-mcp-exposed tools", async () => {
    const reg = makeRegistryWithMcpTools();
    reg.register({
      name: "memory_recall_test",
      description: "",
      parameters: {},
      mcp_exposed: false,
      async execute() { return "ok"; },
    } as any);
    const server = new McpServer(reg);
    const res = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "memory_recall_test", arguments: {} },
    });
    expect(res.error?.code).toBe(-32601);
  });

  it("initialize returns protocolVersion 2024-11-05", async () => {
    const reg = makeRegistryWithMcpTools();
    const server = new McpServer(reg);
    const res = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {} },
    });
    expect((res.result as any).protocolVersion).toBe("2024-11-05");
  });

  it("unknown method returns -32601", async () => {
    const reg = makeRegistryWithMcpTools();
    const server = new McpServer(reg);
    const res = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "garbage",
    });
    expect(res.error?.code).toBe(-32601);
  });
});
