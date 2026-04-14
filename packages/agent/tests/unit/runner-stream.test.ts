import { describe, it, expect, beforeEach } from "vitest";
import { AgentRunner } from "../../src/agent/runner.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { WorkingMemoryStore } from "../../src/memory/working.js";
import { SessionMemoryStore } from "../../src/memory/session.js";
import { makeMock, textResponse, toolCallResponse } from "../helpers/mock-provider.js";
import type { ToolDefinition } from "../../src/tools/types.js";
import type { RunEvent } from "../../src/types.js";

let registry: ToolRegistry;
let working: WorkingMemoryStore;
let session: SessionMemoryStore;

beforeEach(() => {
  registry = new ToolRegistry();
  working = new WorkingMemoryStore();
  session = new SessionMemoryStore();
});

describe("AgentRunner.runStream", () => {
  it("emits text events progressively as chunks arrive", async () => {
    // textResponse("hello") yields a single text chunk with text="hello".
    // We verify text events arrive, plus usage, plus done.
    const mock = makeMock(textResponse("hello"));
    const runner = new AgentRunner(mock, registry, working, session);

    const events: RunEvent[] = [];
    for await (const e of runner.runStream({ user: "hi" })) {
      events.push(e);
    }

    const textEvents = events.filter((e) => e.kind === "text");
    expect(textEvents.length).toBeGreaterThanOrEqual(1);
    // The concatenated text should equal "hello"
    const combined = textEvents.map((e) => (e as { kind: "text"; text: string }).text).join("");
    expect(combined).toBe("hello");

    expect(events.some((e) => e.kind === "usage")).toBe(true);
    expect(events.some((e) => e.kind === "done")).toBe(true);
  });

  it("emits tool_call before tool_result for each call", async () => {
    const echoTool: ToolDefinition = {
      name: "test.echo",
      description: "echo",
      parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      async execute(args: any) {
        return `echoed: ${args.text}`;
      },
    };
    registry.register(echoTool);

    const mock = makeMock(
      toolCallResponse("call_1", "test.echo", { text: "hi" }),
      textResponse("done after echo"),
    );
    const runner = new AgentRunner(mock, registry, working, session);

    const events: RunEvent[] = [];
    for await (const e of runner.runStream({ user: "echo hi" })) {
      events.push(e);
    }

    const toolCallIdx = events.findIndex((e) => e.kind === "tool_call");
    const toolResultIdx = events.findIndex((e) => e.kind === "tool_result");

    expect(toolCallIdx).toBeGreaterThanOrEqual(0);
    expect(toolResultIdx).toBeGreaterThan(toolCallIdx);

    const toolCall = events[toolCallIdx] as Extract<RunEvent, { kind: "tool_call" }>;
    expect(toolCall.name).toBe("test.echo");
    expect(toolCall.id).toBe("call_1");

    const toolResult = events[toolResultIdx] as Extract<RunEvent, { kind: "tool_result" }>;
    expect(toolResult.ok).toBe(true);
    expect(toolResult.content).toBe("echoed: hi");
  });

  it("emits turn_done after each assistant turn", async () => {
    const echoTool: ToolDefinition = {
      name: "test.echo2",
      description: "echo",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "ok";
      },
    };
    registry.register(echoTool);

    const mock = makeMock(
      toolCallResponse("call_1", "test.echo2", {}),
      textResponse("final"),
    );
    const runner = new AgentRunner(mock, registry, working, session);

    const events: RunEvent[] = [];
    for await (const e of runner.runStream({ user: "go" })) {
      events.push(e);
    }

    const turnDoneEvents = events.filter((e) => e.kind === "turn_done");
    // Two iterations: one tool call turn + one text turn → 2 turn_done events
    expect(turnDoneEvents.length).toBe(2);
  });

  it("yields done exactly once at the end with RunResult matching run()", async () => {
    const mock = makeMock(textResponse("hello world"));
    const runner = new AgentRunner(mock, registry, working, session);

    const events: RunEvent[] = [];
    for await (const e of runner.runStream({ user: "hi" })) {
      events.push(e);
    }

    const doneEvents = events.filter((e) => e.kind === "done");
    expect(doneEvents).toHaveLength(1);

    const doneEvent = doneEvents[0] as Extract<RunEvent, { kind: "done" }>;
    expect(doneEvent.result.finalText).toBe("hello world");
    expect(doneEvent.result.iterations).toBe(1);
    expect(doneEvent.result.turns.length).toBeGreaterThan(0);
    expect(doneEvent.result.totalUsage.input).toBeGreaterThan(0);

    // Verify the terminal event is "done" (no error events)
    expect(events.some((e) => e.kind === "error")).toBe(false);
    expect(events[events.length - 1].kind).toBe("done");
  });

  it("emits error event and terminates without done on provider error", async () => {
    // Inject an error chunk directly via makeMock
    const mock = makeMock([{ kind: "error", error: "model overloaded" }]);
    const runner = new AgentRunner(mock, registry, working, session);

    const events: RunEvent[] = [];
    for await (const e of runner.runStream({ user: "hi" })) {
      events.push(e);
    }

    const errorEvents = events.filter((e) => e.kind === "error");
    expect(errorEvents.length).toBe(1);

    const errorEvent = errorEvents[0] as Extract<RunEvent, { kind: "error" }>;
    expect(errorEvent.error).toContain("model overloaded");

    // Must NOT emit done after error
    expect(events.some((e) => e.kind === "done")).toBe(false);
  });
});
