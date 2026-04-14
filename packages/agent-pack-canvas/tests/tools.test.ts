import { describe, it, expect } from "vitest";
import { ToolRegistry } from "@livepeer/agent";
import { CanvasStore } from "../src/store.js";
import { canvasGetTool } from "../src/tools/get.js";
import { canvasCreateTool } from "../src/tools/create.js";
import { canvasUpdateTool } from "../src/tools/update.js";
import { canvasRemoveTool } from "../src/tools/remove.js";
import { canvasOrganizeTool } from "../src/tools/organize.js";
import { registerCanvasPack } from "../src/index.js";

function makeSetup() {
  const tools = new ToolRegistry();
  const store = new CanvasStore();
  return { tools, store };
}

describe("canvas_create tool", () => {
  it("adds a card and returns it", async () => {
    const { tools, store } = makeSetup();
    tools.register(canvasCreateTool(store));
    const result = JSON.parse(
      await tools.get("canvas_create")!.execute(
        { id: "c1", refId: "c1", type: "image", url: "https://example.com/img.png" },
        {},
      ),
    );
    expect(result.id).toBe("c1");
    expect(result.url).toBe("https://example.com/img.png");
    expect(result.x).toBe(0);
    expect(store.get("c1")).toBeDefined();
  });
});

describe("canvas_get tool", () => {
  it("retrieves an existing card by id", async () => {
    const { tools, store } = makeSetup();
    store.add({ id: "c2", refId: "ref2", type: "video", x: 10, y: 20, w: 320, h: 200 });
    tools.register(canvasGetTool(store));
    const result = JSON.parse(await tools.get("canvas_get")!.execute({ id: "c2" }, {}));
    expect(result.id).toBe("c2");
    expect(result.type).toBe("video");
  });

  it("throws on unknown card", async () => {
    const { tools, store } = makeSetup();
    tools.register(canvasGetTool(store));
    await expect(tools.get("canvas_get")!.execute({ id: "ghost" }, {})).rejects.toThrow(
      "Card not found: ghost",
    );
  });
});

describe("canvas_update tool", () => {
  it("patches card fields", async () => {
    const { tools, store } = makeSetup();
    store.add({ id: "c3", refId: "c3", type: "image", x: 0, y: 0, w: 320, h: 200 });
    tools.register(canvasUpdateTool(store));
    const result = JSON.parse(
      await tools.get("canvas_update")!.execute({ id: "c3", x: 50, url: "https://new.png" }, {}),
    );
    expect(result.x).toBe(50);
    expect(result.url).toBe("https://new.png");
  });
});

describe("canvas_remove tool", () => {
  it("removes a card and returns ok: true", async () => {
    const { tools, store } = makeSetup();
    store.add({ id: "c4", refId: "c4", type: "audio", x: 0, y: 0, w: 320, h: 200 });
    tools.register(canvasRemoveTool(store));
    const result = JSON.parse(await tools.get("canvas_remove")!.execute({ id: "c4" }, {}));
    expect(result.ok).toBe(true);
    expect(store.get("c4")).toBeUndefined();
  });

  it("returns ok: false for nonexistent card", async () => {
    const { tools, store } = makeSetup();
    tools.register(canvasRemoveTool(store));
    const result = JSON.parse(await tools.get("canvas_remove")!.execute({ id: "ghost" }, {}));
    expect(result.ok).toBe(false);
  });
});

describe("canvas_organize tool", () => {
  it("applies auto layout", async () => {
    const { tools, store } = makeSetup();
    store.add({ id: "a", refId: "a", type: "image", x: 0, y: 0, w: 320, h: 200, batchId: "b1" });
    store.add({ id: "b", refId: "b", type: "image", x: 0, y: 0, w: 320, h: 200, batchId: "b1" });
    tools.register(canvasOrganizeTool(store));
    const result = JSON.parse(
      await tools.get("canvas_organize")!.execute({ mode: "auto" }, {}),
    );
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("auto");
  });

  it("applies narrative layout", async () => {
    const { tools, store } = makeSetup();
    store.add({ id: "a", refId: "a", type: "image", x: 0, y: 0, w: 320, h: 200, batchId: "b1" });
    store.add({ id: "b", refId: "b", type: "image", x: 0, y: 0, w: 320, h: 200, batchId: "b2" });
    tools.register(canvasOrganizeTool(store));
    await tools.get("canvas_organize")!.execute({ mode: "narrative" }, {});
    expect(store.get("a")!.y).toBe(0);
    expect(store.get("b")!.y).toBe(200 + 24);
  });
});

describe("registerCanvasPack", () => {
  it("registers all 5 tools", () => {
    const tools = new ToolRegistry();
    registerCanvasPack({ tools });
    expect(tools.get("canvas_get")).toBeDefined();
    expect(tools.get("canvas_create")).toBeDefined();
    expect(tools.get("canvas_update")).toBeDefined();
    expect(tools.get("canvas_remove")).toBeDefined();
    expect(tools.get("canvas_organize")).toBeDefined();
  });

  it("[INV-7] none of the canvas pack tools are mcp_exposed", () => {
    const tools = new ToolRegistry();
    registerCanvasPack({ tools });
    expect(tools.mcpExposed()).toHaveLength(0);
  });
});
