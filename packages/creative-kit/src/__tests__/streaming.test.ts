import { describe, it, expect } from "vitest";
import { createPipelineRegistry } from "../streaming/pipeline-registry";
import { BUILTIN_RECIPES, KNOWN_PIPELINES } from "../streaming/recipes";
import { buildSimpleGraph, buildTextOnlyGraph, buildPreprocessorGraph, buildPostprocessorGraph } from "../streaming/graph-builder";

// ─── Graph Builder ──────────────────────────────────────────────────────────

describe("Graph Builder", () => {
  it("builds simple graph with source → pipeline → sink", () => {
    const g = buildSimpleGraph("longlive");
    expect(g.nodes).toHaveLength(3);
    expect(g.nodes[0].type).toBe("source");
    expect(g.nodes[1].type).toBe("pipeline");
    expect(g.nodes[1].pipeline_id).toBe("longlive");
    expect(g.nodes[2].type).toBe("sink");
    expect(g.edges).toHaveLength(2);
  });

  it("builds text-only graph without source", () => {
    const g = buildTextOnlyGraph("ltx2");
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes[0].pipeline_id).toBe("ltx2");
    expect(g.nodes[1].type).toBe("sink");
    expect(g.edges).toHaveLength(1);
  });

  it("builds preprocessor graph with 4 nodes", () => {
    const g = buildPreprocessorGraph("longlive", "video_depth_anything");
    expect(g.nodes).toHaveLength(4);
    const pipelineNodes = g.nodes.filter((n) => n.type === "pipeline");
    expect(pipelineNodes).toHaveLength(2);
    expect(pipelineNodes.map((n) => n.pipeline_id)).toContain("video_depth_anything");
    expect(pipelineNodes.map((n) => n.pipeline_id)).toContain("longlive");
  });

  it("builds postprocessor graph with 4 nodes", () => {
    const g = buildPostprocessorGraph("ltx2", "rife");
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toHaveLength(3);
    // Verify chain: source → ltx2 → rife → sink
    const edgeChain = g.edges.map((e) => `${e.from}→${e.to_node}`);
    expect(edgeChain).toContain("input→ltx2");
    expect(edgeChain).toContain("ltx2→rife");
    expect(edgeChain).toContain("rife→output");
  });
});

// ─── Built-in Recipes ──────────────────────────────────────────────────────

describe("Built-in Recipes", () => {
  it("has at least 9 recipes", () => {
    expect(BUILTIN_RECIPES.length).toBeGreaterThanOrEqual(9);
  });

  it("every recipe has required fields", () => {
    for (const r of BUILTIN_RECIPES) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.pipeline).toBeTruthy();
      expect(r.graph.nodes.length).toBeGreaterThan(0);
      expect(r.graph.edges.length).toBeGreaterThan(0);
      expect(["fast", "balanced", "quality"]).toContain(r.quality);
    }
  });

  it("classic recipe uses longlive", () => {
    const classic = BUILTIN_RECIPES.find((r) => r.id === "classic");
    expect(classic).toBeTruthy();
    expect(classic!.pipeline).toBe("longlive");
    expect(classic!.quality).toBe("balanced");
  });

  it("ltx-responsive uses ltx2 with kv_cache 0.3", () => {
    const ltx = BUILTIN_RECIPES.find((r) => r.id === "ltx-responsive");
    expect(ltx).toBeTruthy();
    expect(ltx!.pipeline).toBe("ltx2");
    expect(ltx!.defaults).toHaveProperty("kv_cache_attention_bias", 0.3);
  });

  it("depth-lock uses preprocessor graph", () => {
    const depth = BUILTIN_RECIPES.find((r) => r.id === "depth-lock");
    expect(depth).toBeTruthy();
    expect(depth!.graph.nodes.length).toBe(4);
    const depthNode = depth!.graph.nodes.find((n) => n.pipeline_id === "video_depth_anything");
    expect(depthNode).toBeTruthy();
  });

  it("ltx-smooth uses postprocessor graph with rife", () => {
    const smooth = BUILTIN_RECIPES.find((r) => r.id === "ltx-smooth");
    expect(smooth).toBeTruthy();
    const rifeNode = smooth!.graph.nodes.find((n) => n.pipeline_id === "rife");
    expect(rifeNode).toBeTruthy();
  });

  it("text-only recipe does not need input", () => {
    const textOnly = BUILTIN_RECIPES.find((r) => r.id === "text-only");
    expect(textOnly).toBeTruthy();
    expect(textOnly!.needsInput).toBe(false);
  });
});

// ─── Known Pipelines ────────────────────────────────────────────────────────

describe("Known Pipelines", () => {
  it("includes longlive, ltx2, krea, memflow", () => {
    const ids = KNOWN_PIPELINES.map((p) => p.id);
    expect(ids).toContain("longlive");
    expect(ids).toContain("ltx2");
    expect(ids).toContain("krea_realtime_video");
    expect(ids).toContain("memflow");
  });

  it("ltx2 has default kv_cache 0.3", () => {
    const ltx = KNOWN_PIPELINES.find((p) => p.id === "ltx2");
    expect(ltx!.default_kv_cache).toBe(0.3);
    expect(ltx!.default_fps).toBe(24);
  });

  it("preprocessors have low vram", () => {
    const depth = KNOWN_PIPELINES.find((p) => p.id === "video_depth_anything");
    expect(depth!.vram_gb).toBe(1);
    expect(depth!.capabilities).toContain("preprocessor");
  });
});

// ─── Pipeline Registry ──────────────────────────────────────────────────────

describe("Pipeline Registry", () => {
  const registry = createPipelineRegistry();

  it("getRecipe returns known recipes", () => {
    expect(registry.getRecipe("classic")).toBeTruthy();
    expect(registry.getRecipe("ltx-responsive")).toBeTruthy();
    expect(registry.getRecipe("nonexistent")).toBeUndefined();
  });

  it("resolve maps intent keywords to recipes", () => {
    expect(registry.resolve("make it smooth and fluid").id).toBe("ltx-responsive");
    expect(registry.resolve("preserve depth structure").id).toBe("depth-lock");
    expect(registry.resolve("fast preview please").id).toBe("fast-preview");
    expect(registry.resolve("highest quality render").id).toBe("krea-hq");
    expect(registry.resolve("consistent characters throughout").id).toBe("memflow-consistent");
    expect(registry.resolve("sketch-based generation").id).toBe("scribble-guide");
  });

  it("resolve falls back to classic for unknown intent", () => {
    expect(registry.resolve("just a normal stream").id).toBe("classic");
    expect(registry.resolve("hello world").id).toBe("classic");
  });

  it("listRecipes filters by quality", () => {
    const fast = registry.listRecipes("fast");
    expect(fast.length).toBeGreaterThan(0);
    expect(fast.every((r) => r.quality === "fast")).toBe(true);

    const quality = registry.listRecipes("quality");
    expect(quality.length).toBeGreaterThan(0);
    expect(quality.every((r) => r.quality === "quality")).toBe(true);
  });

  it("listRecipes without filter returns all", () => {
    expect(registry.listRecipes().length).toBe(BUILTIN_RECIPES.length);
  });

  it("accepts custom recipes", () => {
    const custom = createPipelineRegistry(undefined, [
      {
        id: "my-custom",
        name: "Custom",
        description: "test",
        pipeline: "longlive",
        graph: buildSimpleGraph("longlive"),
        defaults: {},
        quality: "balanced",
        capabilities: [],
        needsInput: true,
      },
    ]);
    expect(custom.getRecipe("my-custom")).toBeTruthy();
    expect(custom.getRecipe("classic")).toBeTruthy(); // built-in still available
  });
});
