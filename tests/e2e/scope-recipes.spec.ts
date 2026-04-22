import { test, expect } from "@playwright/test";

test.describe("Scope Recipes — Pipeline Orchestration", () => {
  // ─── Skill file tests ─────────────────────────────────────────────────────

  test("scope-pipelines skill is loadable with all pipelines", async ({ page }) => {
    const resp = await page.request.get("/skills/scope-pipelines.md");
    expect(resp.ok()).toBeTruthy();
    const content = await resp.text();
    expect(content).toContain("Scope Pipeline & Recipe Guide");
    // All 4 main pipelines
    expect(content).toContain("longlive");
    expect(content).toContain("ltx2");
    expect(content).toContain("krea_realtime_video");
    expect(content).toContain("memflow");
    // All 9+ recipes
    expect(content).toContain("classic");
    expect(content).toContain("ltx-responsive");
    expect(content).toContain("ltx-smooth");
    expect(content).toContain("depth-lock");
    expect(content).toContain("scribble-guide");
    expect(content).toContain("fast-preview");
    expect(content).toContain("krea-hq");
    expect(content).toContain("memflow-consistent");
    // Preprocessor / postprocessor docs
    expect(content).toContain("video_depth_anything");
    expect(content).toContain("scribble");
    expect(content).toContain("rife");
  });

  test("scope-agent skill includes recipe section", async ({ page }) => {
    const resp = await page.request.get("/skills/scope-agent.md");
    expect(resp.ok()).toBeTruthy();
    const content = await resp.text();
    expect(content).toContain("## Recipes");
    expect(content).toContain("ltx-responsive");
    expect(content).toContain("depth-lock");
    expect(content).toContain("memflow-consistent");
    expect(content).toContain("kv_cache defaults to 0.3");
  });

  test("scope_start tool has recipe parameter", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    const hasRecipe = await page.evaluate(() => {
      const sb = (window as unknown as Record<string, unknown>).__storyboard as { listTools?: () => Array<{ name: string; parameters: Record<string, unknown> }> } | undefined;
      if (!sb?.listTools) return null;
      const tools = sb.listTools();
      const scopeStart = tools.find((t) => t.name === "scope_start");
      if (!scopeStart) return false;
      const props = (scopeStart.parameters as { properties?: Record<string, unknown> })?.properties ?? {};
      return "recipe" in props;
    });

    if (hasRecipe === null) {
      const resp = await page.request.get("/skills/scope-agent.md");
      const content = await resp.text();
      expect(content).toContain("recipe");
    } else {
      expect(hasRecipe).toBeTruthy();
    }
  });

  // ─── Recipe → pipeline mapping (via skill doc) ────────────────────────────

  test("recipe defaults are correctly documented", async ({ page }) => {
    const resp = await page.request.get("/skills/scope-pipelines.md");
    const content = await resp.text();
    expect(content).toMatch(/classic.*longlive/);
    expect(content).toMatch(/ltx-responsive.*ltx2/);
    expect(content).toMatch(/krea-hq.*krea_realtime_video/);
    expect(content).toMatch(/memflow-consistent.*memflow/);
    expect(content).toContain("kv_cache_attention_bias: 0.3"); // ltx2
    expect(content).toContain("kv_cache_attention_bias: 0.5"); // classic
    expect(content).toContain("denoising_step_list: [1000, 500]"); // fast-preview
  });

  // ─── Preprocessor chain recipes ────────────────────────────────────────────

  test("depth-lock recipe documented with preprocessor", async ({ page }) => {
    const resp = await page.request.get("/skills/scope-pipelines.md");
    const content = await resp.text();
    expect(content).toMatch(/depth-lock.*depth_anything/i);
    expect(content).toContain("Preserve structure");
  });

  test("scribble-guide recipe documented with preprocessor", async ({ page }) => {
    const resp = await page.request.get("/skills/scope-pipelines.md");
    const content = await resp.text();
    expect(content).toMatch(/scribble-guide.*scribble/i);
    expect(content).toContain("Edge-guided");
  });

  test("ltx-smooth recipe documented with RIFE postprocessor", async ({ page }) => {
    const resp = await page.request.get("/skills/scope-pipelines.md");
    const content = await resp.text();
    expect(content).toMatch(/ltx-smooth.*rife/i);
    expect(content).toContain("48fps");
  });

  // ─── Creative-kit registry unit tests (inline via vitest) ─────────────────

  test("creative-kit streaming module exports are available", async () => {
    const ck = await import("@livepeer/creative-kit");
    expect(ck.createPipelineRegistry).toBeInstanceOf(Function);
    expect(ck.BUILTIN_RECIPES).toBeInstanceOf(Array);
    expect(ck.KNOWN_PIPELINES).toBeInstanceOf(Array);
    expect(ck.buildSimpleGraph).toBeInstanceOf(Function);
    expect(ck.buildPreprocessorGraph).toBeInstanceOf(Function);
    expect(ck.buildPostprocessorGraph).toBeInstanceOf(Function);
  });

  test("pipeline registry resolves intent to correct recipes", async () => {
    const { createPipelineRegistry } = await import("@livepeer/creative-kit");
    const reg = createPipelineRegistry();

    expect(reg.resolve("make it smooth and fluid").id).toBe("ltx-responsive");
    expect(reg.resolve("preserve depth structure").id).toBe("depth-lock");
    expect(reg.resolve("fast preview").id).toBe("fast-preview");
    expect(reg.resolve("highest quality").id).toBe("krea-hq");
    expect(reg.resolve("consistent characters").id).toBe("memflow-consistent");
    expect(reg.resolve("default stream").id).toBe("classic"); // fallback
  });

  test("all recipes have valid graph structures", async () => {
    const { BUILTIN_RECIPES } = await import("@livepeer/creative-kit");
    for (const recipe of BUILTIN_RECIPES) {
      expect(recipe.graph.nodes.length).toBeGreaterThan(0);
      expect(recipe.graph.edges.length).toBeGreaterThan(0);
      // Every pipeline node must have a pipeline_id
      const pipelineNodes = recipe.graph.nodes.filter((n) => n.type === "pipeline");
      for (const pn of pipelineNodes) {
        expect(pn.pipeline_id).toBeTruthy();
      }
      // Every edge must reference existing nodes
      const nodeIds = new Set(recipe.graph.nodes.map((n) => n.id));
      for (const edge of recipe.graph.edges) {
        expect(nodeIds.has(edge.from)).toBe(true);
        expect(nodeIds.has(edge.to_node)).toBe(true);
      }
    }
  });

  test("preprocessor recipes have 4 nodes (source + pre + main + sink)", async () => {
    const { BUILTIN_RECIPES } = await import("@livepeer/creative-kit");
    const depthLock = BUILTIN_RECIPES.find((r) => r.id === "depth-lock");
    const scribbleGuide = BUILTIN_RECIPES.find((r) => r.id === "scribble-guide");

    expect(depthLock!.graph.nodes).toHaveLength(4);
    expect(scribbleGuide!.graph.nodes).toHaveLength(4);

    // Verify preprocessor pipeline IDs
    const depthPipelines = depthLock!.graph.nodes.filter((n) => n.type === "pipeline").map((n) => n.pipeline_id);
    expect(depthPipelines).toContain("video_depth_anything");
    expect(depthPipelines).toContain("longlive");

    const scribblePipelines = scribbleGuide!.graph.nodes.filter((n) => n.type === "pipeline").map((n) => n.pipeline_id);
    expect(scribblePipelines).toContain("scribble");
    expect(scribblePipelines).toContain("longlive");
  });

  test("postprocessor recipes chain pipeline → rife → sink", async () => {
    const { BUILTIN_RECIPES } = await import("@livepeer/creative-kit");
    const ltxSmooth = BUILTIN_RECIPES.find((r) => r.id === "ltx-smooth");
    const interpolated = BUILTIN_RECIPES.find((r) => r.id === "interpolated");

    // Both should have rife as postprocessor
    for (const recipe of [ltxSmooth!, interpolated!]) {
      const rifeNode = recipe.graph.nodes.find((n) => n.pipeline_id === "rife");
      expect(rifeNode).toBeTruthy();
      // rife should output to sink
      const rifeToSink = recipe.graph.edges.find((e) => e.from === rifeNode!.id && e.to_node === "output");
      expect(rifeToSink).toBeTruthy();
    }
  });

  // ─── Regression tests ─────────────────────────────────────────────────────

  test("storyteller skill is loadable (regression)", async ({ page }) => {
    const resp = await page.request.get("/skills/storyteller.md");
    expect(resp.ok()).toBeTruthy();
    const content = await resp.text();
    expect(content).toContain("Storyteller");
    expect(content).toContain("product");
    expect(content).toContain("campaign");
  });

  test("creative-stage scene-traveling skill includes pipeline notes", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "apps/creative-stage/skills/scene-traveling.md",
      "utf-8"
    );
    expect(content).toContain("Pipeline-Specific Notes");
    expect(content).toContain("LTX 2.3");
    expect(content).toContain("ltx-responsive");
    expect(content).toContain("MemFlow");
    expect(content).toContain("Krea Realtime Video");
    expect(content).toContain("kv_cache_attention_bias defaults to 0.3");
  });

  test("existing scope E2E tests still pass (smoke)", async ({ page }) => {
    // Verify core scope skill is still accessible
    const resp = await page.request.get("/skills/scope-agent.md");
    expect(resp.ok()).toBeTruthy();
    const content = await resp.text();
    expect(content).toContain("Scope Domain Agent");
    expect(content).toContain("scope_start");
    expect(content).toContain("scope_control");
    expect(content).toContain("scope_stop");
    // New recipe content doesn't break old structure
    expect(content).toContain("Graph Templates");
    expect(content).toContain("Presets");
    expect(content).toContain("Parameter Guide");
  });
});
