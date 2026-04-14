import { describe, it, expect } from "vitest";
import { ProjectStore } from "../src/store.js";

describe("ProjectStore", () => {
  it("creates and retrieves a project", () => {
    const s = new ProjectStore();
    const p = s.create({
      title: "test",
      scenes: [{ id: "s1", title: "scene 1", prompt: "a cat" }],
      style: { visual_style: "watercolor", color_palette: "warm", mood: "calm" },
    });
    expect(p.id).toMatch(/^prj_/);
    expect(p.id).toBeDefined();
    expect(s.get(p.id)?.scenes).toHaveLength(1);
  });

  it("updates scene status independently", () => {
    const s = new ProjectStore();
    const p = s.create({ title: "x", scenes: [{ id: "a", title: "A", prompt: "p" }], style: {} });
    s.updateScene(p.id, "a", { status: "done", url: "http://x.png" });
    expect(s.get(p.id)?.scenes[0].status).toBe("done");
    expect(s.get(p.id)?.scenes[0].url).toBe("http://x.png");
  });

  it("list returns all created projects", () => {
    const s = new ProjectStore();
    s.create({ title: "a", scenes: [], style: {} });
    s.create({ title: "b", scenes: [], style: {} });
    expect(s.list()).toHaveLength(2);
  });

  it("updateScene throws on unknown project", () => {
    const s = new ProjectStore();
    expect(() => s.updateScene("nonexistent", "s1", { status: "done" })).toThrow(
      "Unknown project: nonexistent",
    );
  });

  it("updateScene throws on unknown scene", () => {
    const s = new ProjectStore();
    const p = s.create({ title: "x", scenes: [], style: {} });
    expect(() => s.updateScene(p.id, "ghost", { status: "done" })).toThrow("Unknown scene: ghost");
  });

  it("addScene appends a scene to the project", () => {
    const s = new ProjectStore();
    const p = s.create({ title: "x", scenes: [], style: {} });
    s.addScene(p.id, { id: "s2", title: "scene 2", prompt: "a dog" });
    expect(s.get(p.id)?.scenes).toHaveLength(1);
  });

  it("delete removes a project", () => {
    const s = new ProjectStore();
    const p = s.create({ title: "x", scenes: [], style: {} });
    expect(s.delete(p.id)).toBe(true);
    expect(s.get(p.id)).toBeUndefined();
  });
});
