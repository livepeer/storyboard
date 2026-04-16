import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../src/tools/registry.js";
import { registerBuiltinTools, MCP_EXPOSED_TOOLS } from "../../src/tools/builtin/index.js";

describe("built-in tools scaffold", () => {
  it("registerBuiltinTools registers exactly 8 MCP-exposed tools [INV-7]", () => {
    const r = new ToolRegistry();
    registerBuiltinTools(r);
    const exposed = r.mcpExposed();
    expect(exposed).toHaveLength(8);
  });

  it("MCP exposed tools have unique names with livepeer.* prefix", () => {
    const names = MCP_EXPOSED_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.startsWith("livepeer."))).toBe(true);
  });

  it("registry includes 14 total tools (8 MCP + 6 memory)", () => {
    const r = new ToolRegistry();
    registerBuiltinTools(r);
    expect(r.list()).toHaveLength(14);
  });
});
