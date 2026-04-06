import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPlugin,
  setActivePlugin,
  getActivePlugin,
  getActivePluginId,
  getPluginList,
} from "@/lib/agents/registry";
import type { AgentPlugin, AgentEvent, CanvasContext } from "@/lib/agents/types";

function makePlugin(id: string, name: string): AgentPlugin {
  return {
    id,
    name,
    description: `Test plugin: ${name}`,
    configFields: [],
    async *sendMessage(
      text: string,
      _context: CanvasContext
    ): AsyncGenerator<AgentEvent> {
      yield { type: "text", content: `Echo: ${text}` };
      yield { type: "done" };
    },
    configure() {},
    stop() {},
  };
}

// Reset registry between tests
function resetRegistry() {
  // The registry uses module-level state, so we re-register to reset
  const list = getPluginList();
  // We can't truly clear it without an export, so we test additively
}

describe("Agent Plugin Interface", () => {
  const testPlugin = makePlugin("test-agent", "Test Agent");

  beforeEach(() => {
    registerPlugin(testPlugin);
  });

  describe("registerPlugin", () => {
    it("registers a plugin", () => {
      const list = getPluginList();
      expect(list.some((p) => p.id === "test-agent")).toBe(true);
    });
  });

  describe("setActivePlugin", () => {
    it("sets the active plugin", () => {
      setActivePlugin("test-agent");
      expect(getActivePluginId()).toBe("test-agent");
    });

    it("throws for unregistered plugin", () => {
      expect(() => setActivePlugin("nonexistent")).toThrow(
        'Plugin "nonexistent" not registered'
      );
    });
  });

  describe("getActivePlugin", () => {
    it("returns the active plugin", () => {
      setActivePlugin("test-agent");
      const plugin = getActivePlugin();
      expect(plugin).toBeDefined();
      expect(plugin!.id).toBe("test-agent");
      expect(plugin!.name).toBe("Test Agent");
    });
  });

  describe("AgentPlugin interface", () => {
    it("has required readonly properties", () => {
      expect(testPlugin.id).toBe("test-agent");
      expect(testPlugin.name).toBe("Test Agent");
      expect(testPlugin.description).toBeDefined();
      expect(testPlugin.configFields).toEqual([]);
    });

    it("sendMessage yields events as async generator", async () => {
      const context: CanvasContext = {
        cards: [],
        capabilities: [],
      };
      const events: AgentEvent[] = [];
      for await (const event of testPlugin.sendMessage("hello", context)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("text");
      expect(events[0].content).toBe("Echo: hello");
      expect(events[1].type).toBe("done");
    });

    it("stop() and configure() are callable", () => {
      expect(() => testPlugin.stop()).not.toThrow();
      expect(() => testPlugin.configure({ key: "value" })).not.toThrow();
    });
  });

  describe("AgentEvent types", () => {
    it("supports all event types", async () => {
      const allEventsPlugin: AgentPlugin = {
        id: "all-events",
        name: "All Events",
        description: "Test",
        configFields: [],
        async *sendMessage(): AsyncGenerator<AgentEvent> {
          yield { type: "text", content: "Hello" };
          yield { type: "tool_call", name: "inference", input: { prompt: "test" } };
          yield { type: "tool_result", name: "inference", result: { url: "http://..." } };
          yield { type: "card_created", refId: "step_0", content: "Dragon" };
          yield { type: "error", content: "Something failed" };
          yield { type: "done" };
        },
        configure() {},
        stop() {},
      };

      registerPlugin(allEventsPlugin);
      const context: CanvasContext = { cards: [], capabilities: [] };
      const events: AgentEvent[] = [];
      for await (const event of allEventsPlugin.sendMessage("test", context)) {
        events.push(event);
      }

      expect(events).toHaveLength(6);
      expect(events.map((e) => e.type)).toEqual([
        "text",
        "tool_call",
        "tool_result",
        "card_created",
        "error",
        "done",
      ]);
    });
  });

  describe("Plugin switching", () => {
    it("switches between plugins without state loss", () => {
      const pluginA = makePlugin("plugin-a", "Plugin A");
      const pluginB = makePlugin("plugin-b", "Plugin B");
      registerPlugin(pluginA);
      registerPlugin(pluginB);

      setActivePlugin("plugin-a");
      expect(getActivePluginId()).toBe("plugin-a");

      setActivePlugin("plugin-b");
      expect(getActivePluginId()).toBe("plugin-b");

      // Switch back
      setActivePlugin("plugin-a");
      expect(getActivePluginId()).toBe("plugin-a");
      expect(getActivePlugin()!.name).toBe("Plugin A");
    });
  });
});
