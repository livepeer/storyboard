import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { ToolDefinition } from "../../src/tools/types.js";

let registry: ToolRegistry;

const t1: ToolDefinition = {
  name: "test.one",
  description: "first",
  parameters: { type: "object", properties: {} },
  async execute() { return "ok"; },
};

const t2: ToolDefinition = {
  name: "test.two",
  description: "second",
  mcp_exposed: true,
  parameters: { type: "object", properties: {} },
  async execute() { return "ok"; },
};

beforeEach(() => {
  registry = new ToolRegistry();
});

describe("ToolRegistry", () => {
  it("registers and retrieves tools", () => {
    registry.register(t1);
    expect(registry.has("test.one")).toBe(true);
    expect(registry.get("test.one")).toBe(t1);
  });

  it("throws on duplicate registration", () => {
    registry.register(t1);
    expect(() => registry.register(t1)).toThrow(/already registered/);
  });

  it("list returns all tools", () => {
    registry.register(t1);
    registry.register(t2);
    expect(registry.list()).toHaveLength(2);
  });

  it("mcpExposed returns only tools flagged for MCP", () => {
    registry.register(t1);
    registry.register(t2);
    const exposed = registry.mcpExposed();
    expect(exposed).toHaveLength(1);
    expect(exposed[0].name).toBe("test.two");
  });

  it("schemas marshals tools into provider format", () => {
    registry.register(t1);
    const schemas = registry.schemas();
    expect(schemas[0]).toEqual({
      name: "test.one",
      description: "first",
      parameters: { type: "object", properties: {} },
    });
  });

  it("schemas accepts a filter", () => {
    registry.register(t1);
    registry.register(t2);
    const schemas = registry.schemas((t) => t.mcp_exposed === true);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe("test.two");
  });
});
