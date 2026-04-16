import { describe, it, expect, beforeEach } from "vitest";
import { AgentRunner } from "../../src/agent/runner.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { WorkingMemoryStore } from "../../src/memory/working.js";
import { SessionMemoryStore } from "../../src/memory/session.js";
import { makeMock, textResponse, toolCallResponse } from "../helpers/mock-provider.js";
import type { ToolDefinition } from "../../src/tools/types.js";

let registry: ToolRegistry;
let working: WorkingMemoryStore;
let session: SessionMemoryStore;

beforeEach(() => {
  registry = new ToolRegistry();
  working = new WorkingMemoryStore();
  session = new SessionMemoryStore();
});

describe("AgentRunner", () => {
  it("returns plain text when the provider has no tool calls", async () => {
    const mock = makeMock(textResponse("hello world"));
    const runner = new AgentRunner(mock, registry, working, session);
    const result = await runner.run({ user: "say hi" });
    expect(result.finalText).toBe("hello world");
    expect(result.iterations).toBe(1);
    expect(result.turns).toHaveLength(2); // user + assistant
  });

  it("executes a tool call and feeds the result back to the model", async () => {
    const echoTool: ToolDefinition = {
      name: "test.echo",
      description: "echo",
      parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      async execute(args: any) { return `echoed: ${args.text}`; },
    };
    registry.register(echoTool);

    const mock = makeMock(
      toolCallResponse("call_1", "test.echo", { text: "hi" }),
      textResponse("done after echo"),
    );
    const runner = new AgentRunner(mock, registry, working, session);
    const result = await runner.run({ user: "echo hi" });
    expect(result.finalText).toBe("done after echo");
    expect(result.iterations).toBe(2);
    expect(session.snapshot().tool_call_log).toHaveLength(1);
    expect(session.snapshot().tool_call_log[0].result?.content).toBe("echoed: hi");
  });

  it("handles unknown tool gracefully without crashing", async () => {
    const mock = makeMock(
      toolCallResponse("call_1", "nonexistent.tool", {}),
      textResponse("recovered"),
    );
    const runner = new AgentRunner(mock, registry, working, session);
    const result = await runner.run({ user: "do thing" });
    expect(result.finalText).toBe("recovered");
    const log = session.snapshot().tool_call_log;
    expect(log[0].result?.ok).toBe(false);
    expect(log[0].result?.content).toContain("Unknown tool");
  });

  it("accumulates token usage across iterations", async () => {
    const echoTool: ToolDefinition = {
      name: "test.echo",
      description: "echo",
      parameters: { type: "object", properties: {} },
      async execute() { return "ok"; },
    };
    registry.register(echoTool);

    const mock = makeMock(
      toolCallResponse("call_1", "test.echo", {}),
      textResponse("done"),
    );
    const runner = new AgentRunner(mock, registry, working, session);
    const result = await runner.run({ user: "echo" });
    expect(result.totalUsage.input).toBeGreaterThan(0);
    expect(result.totalUsage.output).toBeGreaterThan(0);
  });

  it("respects maxIterations to prevent infinite tool-call loops", async () => {
    const t: ToolDefinition = {
      name: "test.loop",
      description: "loops forever",
      parameters: { type: "object", properties: {} },
      async execute() { return "again"; },
    };
    registry.register(t);
    // Mock returns a tool call every iteration — max should cap it
    const responses = Array.from({ length: 20 }, () => toolCallResponse("c", "test.loop", {}));
    const mock = makeMock(...responses);
    const runner = new AgentRunner(mock, registry, working, session);
    const result = await runner.run({ user: "loop", maxIterations: 5 });
    expect(result.iterations).toBe(5);
  });

  it("includes working memory marshal in the system prompt", async () => {
    working.setContext({
      style: "Studio Ghibli",
      palette: "warm",
      characters: "girl",
      setting: "village",
      rules: "",
      mood: "magical",
    });
    const mock = makeMock(textResponse("got context"));
    const runner = new AgentRunner(mock, registry, working, session);
    await runner.run({ user: "anything" });
    const sentReq = mock.received[0];
    expect(sentReq.messages[0].role).toBe("system");
    expect(sentReq.messages[0].content).toContain("Studio Ghibli");
  });
});
