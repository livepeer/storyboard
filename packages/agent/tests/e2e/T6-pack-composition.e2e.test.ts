/**
 * T6 — Pack composition e2e
 *
 * Validates that agent-pack-projects and agent-pack-canvas register their
 * tools into a shared ToolRegistry, that [INV-7] holds (zero mcp_exposed),
 * and that the AgentRunner can call a pack tool end-to-end via MockProvider.
 */

import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../src/tools/registry.js";
import { AgentRunner } from "../../src/agent/runner.js";
import { WorkingMemoryStore } from "../../src/memory/working.js";
import { SessionMemoryStore } from "../../src/memory/session.js";
import { MockProvider } from "../../src/providers/mock.js";
import { registerProjectsPack } from "@livepeer/agent-pack-projects";
import { registerCanvasPack } from "@livepeer/agent-pack-canvas";

describe("T6 — pack composition", () => {
  it("both packs register their tools into a shared ToolRegistry", () => {
    const tools = new ToolRegistry();
    registerProjectsPack({ tools });
    registerCanvasPack({ tools });
    expect(tools.get("project_create")).toBeDefined();
    expect(tools.get("project_iterate")).toBeDefined();
    expect(tools.get("project_generate")).toBeDefined();
    expect(tools.get("project_status")).toBeDefined();
    expect(tools.get("canvas_get")).toBeDefined();
    expect(tools.get("canvas_create")).toBeDefined();
    expect(tools.get("canvas_update")).toBeDefined();
    expect(tools.get("canvas_remove")).toBeDefined();
    expect(tools.get("canvas_organize")).toBeDefined();
  });

  it("[INV-7] none of the pack tools are mcp_exposed", () => {
    const tools = new ToolRegistry();
    registerProjectsPack({ tools });
    registerCanvasPack({ tools });
    const exposed = tools.mcpExposed();
    expect(exposed).toHaveLength(0);
  });

  it("AgentRunner can call a pack tool via MockProvider", async () => {
    const tools = new ToolRegistry();
    registerProjectsPack({ tools });

    const provider = new MockProvider({
      responses: [
        [
          { kind: "tool_call_start", id: "1", name: "project_create" },
          {
            kind: "tool_call_args",
            id: "1",
            args_delta: JSON.stringify({
              title: "Test Film",
              scenes: [{ id: "s1", title: "Opening", prompt: "a misty forest at dawn" }],
            }),
          },
          { kind: "tool_call_end", id: "1" },
          { kind: "usage", usage: { input: 100, output: 50 } },
          { kind: "done" },
        ],
        [
          { kind: "text", text: "done" },
          { kind: "usage", usage: { input: 50, output: 10 } },
          { kind: "done" },
        ],
      ],
    });

    const runner = new AgentRunner(
      provider,
      tools,
      new WorkingMemoryStore(),
      new SessionMemoryStore(),
    );
    const result = await runner.run({ user: "create a project" });
    expect(result.iterations).toBe(2);
    expect(result.finalText).toBe("done");
    // Verify the tool was actually called (provider received 2 requests)
    expect(provider.callCount).toBe(2);
  });
});
