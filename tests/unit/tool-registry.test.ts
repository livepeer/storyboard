import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTool,
  registerTools,
  getTool,
  listTools,
  executeTool,
  clearTools,
} from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";

function makeTool(name: string, result?: unknown): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: { type: "object", properties: {} },
    execute: async () => ({
      success: true,
      data: result ?? { ok: true },
    }),
  };
}

describe("Tool Registry", () => {
  beforeEach(() => clearTools());

  describe("registerTool", () => {
    it("registers a tool by name", () => {
      registerTool(makeTool("test_tool"));
      expect(getTool("test_tool")).toBeDefined();
      expect(getTool("test_tool")!.name).toBe("test_tool");
    });

    it("overwrites existing tool with same name", () => {
      registerTool(makeTool("t1"));
      registerTool({
        ...makeTool("t1"),
        description: "Updated",
      });
      expect(getTool("t1")!.description).toBe("Updated");
      expect(listTools()).toHaveLength(1);
    });
  });

  describe("registerTools", () => {
    it("registers multiple tools at once", () => {
      registerTools([makeTool("a"), makeTool("b"), makeTool("c")]);
      expect(listTools()).toHaveLength(3);
    });
  });

  describe("getTool", () => {
    it("returns undefined for unknown tool", () => {
      expect(getTool("nonexistent")).toBeUndefined();
    });
  });

  describe("listTools", () => {
    it("returns empty array when no tools registered", () => {
      expect(listTools()).toHaveLength(0);
    });

    it("returns all registered tools", () => {
      registerTools([makeTool("x"), makeTool("y")]);
      const names = listTools().map((t) => t.name);
      expect(names).toContain("x");
      expect(names).toContain("y");
    });
  });

  describe("executeTool", () => {
    it("executes a registered tool", async () => {
      registerTool(makeTool("exec_test", { value: 42 }));
      const result = await executeTool("exec_test", {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 42 });
    });

    it("returns error for unknown tool", async () => {
      const result = await executeTool("missing", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("catches execution errors", async () => {
      registerTool({
        ...makeTool("failing"),
        execute: async () => {
          throw new Error("boom");
        },
      });
      const result = await executeTool("failing", {});
      expect(result.success).toBe(false);
      expect(result.error).toBe("boom");
    });
  });

  describe("clearTools", () => {
    it("removes all tools", () => {
      registerTools([makeTool("a"), makeTool("b")]);
      expect(listTools()).toHaveLength(2);
      clearTools();
      expect(listTools()).toHaveLength(0);
    });
  });
});
