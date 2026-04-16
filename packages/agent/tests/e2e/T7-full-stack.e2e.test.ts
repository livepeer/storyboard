import { describe, it, expect } from "vitest";
import { AgentRunner } from "../../src/agent/runner.js";
import { GeminiProvider } from "../../src/providers/gemini.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { WorkingMemoryStore } from "../../src/memory/working.js";
import { SessionMemoryStore } from "../../src/memory/session.js";
import { MCP_EXPOSED_TOOLS } from "../../src/tools/builtin/index.js";
import { HostedSdkClient } from "../../src/capabilities/client.js";
import type { ToolDefinition } from "../../src/tools/types.js";

const KEY = process.env.DAYDREAM_API_KEY ?? "";
const GKEY = process.env.GEMINI_API_KEY ?? "";

describe.skipIf(!KEY || !GKEY)("T7 — full-stack agent → live SDK", () => {
  it("creates a single image end-to-end", async () => {
    const tools = new ToolRegistry();
    const sdk = new HostedSdkClient({ baseUrl: "https://sdk.daydream.monster", apiKey: KEY });

    // Wrap each MCP tool to delegate create_media to the live hosted SDK
    for (const t of MCP_EXPOSED_TOOLS) {
      const wrapped: ToolDefinition = {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        mcp_exposed: t.mcp_exposed,
        tier: t.tier,
        async execute(args, ctx) {
          if (t.name === "livepeer.create_media") {
            const session = await sdk.createSession();
            const result = await sdk.inference(session.session_id, "flux-schnell", args as Record<string, unknown>);
            return JSON.stringify(result);
          }
          return t.execute(args, ctx);
        },
      };
      tools.register(wrapped as any);
    }

    const provider = new GeminiProvider({ apiKey: GKEY });
    const runner = new AgentRunner(provider, tools, new WorkingMemoryStore(), new SessionMemoryStore());
    const result = await runner.run({ user: "make a single watercolor cat image" });

    // Look for any URL mentioned in the assistant's tool results
    const urls: string[] = [];
    for (const turn of result.turns) {
      if (turn.message.role === "tool") {
        const m = turn.message.content.match(/https?:\/\/[^\s"]+/);
        if (m) urls.push(m[0]);
      }
    }
    expect(urls.length).toBeGreaterThan(0);
    expect(result.totalUsage.input + result.totalUsage.output).toBeLessThan(2000);
  }, 90_000);
});
