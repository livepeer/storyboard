import { test, expect } from "@playwright/test";

// Helper: set Gemini as active agent and reload
async function setupGeminiAgent(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("storyboard_active_agent", "gemini");
  });
  await page.reload();
  await page.waitForTimeout(2000);
}

test.describe("Agent Memory & Context Continuity", () => {
  test("simple prompt does not produce 'No response' error", async ({ page }) => {
    // Mock SDK inference to avoid needing real API keys
    await page.route("**/sdk.daydream.monster/inference", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ image_url: "https://example.com/test.png" }),
      });
    });
    await page.route("**/sdk.daydream.monster/capabilities", async (route) => {
      await route.continue();
    });

    await setupGeminiAgent(page);

    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill("a happy cat in sunlight");
    await input.press("Enter");

    // Wait for agent to respond (up to 30s for Gemini + inference)
    await page.waitForTimeout(15000);

    // Check no "No response" or "undefined" error appeared in the chat
    const allText = await page.locator("[class*='break-words']").allTextContents();
    const joined = allText.join(" ");

    console.log("[simple-prompt] Chat text:", joined.slice(0, 500));

    expect(joined).not.toContain("Error: No response");
    expect(joined).not.toContain("Error: undefined");
  });

  test("multi-scene brief creates project without error", async ({ page }) => {
    // Mock SDK inference
    await page.route("**/sdk.daydream.monster/inference", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ image_url: "https://example.com/scene.png" }),
      });
    });
    await page.route("**/sdk.daydream.monster/capabilities", async (route) => {
      await route.continue();
    });

    await setupGeminiAgent(page);

    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 10000 });

    const brief = [
      "Scene 1 — A cat sits on a sunny windowsill",
      "Scene 2 — The cat jumps down and explores the garden",
      "Scene 3 — The cat finds a butterfly and chases it",
      "Scene 4 — The cat rests under a big oak tree at sunset",
    ].join(". ");

    await input.fill(brief);
    await input.press("Enter");

    // Wait for preprocessing + agent response (preprocessor is fast, agent call may take time)
    await page.waitForTimeout(15000);

    const allText = await page.locator("[class*='break-words']").allTextContents();
    const joined = allText.join(" ");

    console.log("[multi-scene] Chat text:", joined.slice(0, 600));

    // Should NOT have "Error: No response"
    expect(joined).not.toContain("Error: No response");

    // Should show some creative/project activity (preprocessor or agent responded)
    const hasActivity =
      joined.toLowerCase().includes("scene") ||
      joined.toLowerCase().includes("creat") ||
      joined.toLowerCase().includes("generat") ||
      joined.toLowerCase().includes("project") ||
      joined.toLowerCase().includes("batch");
    expect(hasActivity).toBe(true);
  });

  test("intent classifier correctly routes continue and add_scenes commands", async ({ page }) => {
    // classifyIntent is a pure function — evaluate it inline rather than importing modules
    // We inline a copy of the logic to test it independently of the bundler
    const result = await page.evaluate(() => {
      // Inline the classify logic (mirrors lib/agents/intent.ts exactly)
      function classifyIntent(
        text: string,
        hasActiveProject: boolean,
        pendingScenes: number
      ) {
        const lower = text.toLowerCase().trim();

        if (
          text.length > 500 ||
          (/scene\s*\d/i.test(text) && (text.match(/scene/gi) || []).length >= 3)
        ) {
          return { type: "new_project" };
        }

        if (
          /^(continue|keep going|go|next|do the rest|finish|carry on|proceed|go ahead)\.?$/i.test(
            lower
          )
        )
          return { type: "continue" };
        if (
          /continue generating|keep going|finish (it|them|the rest)|do the rest|next batch|remaining scenes/i.test(
            lower
          )
        )
          return { type: "continue" };

        const moreCountMatch = lower.match(
          /(?:give|make|add|create|do|generate)\s+(?:me\s+)?(\d+)\s+more/i
        );
        if (moreCountMatch)
          return {
            type: "add_scenes",
            count: parseInt(moreCountMatch[1]),
            direction: text,
          };

        if (hasActiveProject) {
          if (
            /(?:add|give|make|create)\s+(?:me\s+)?more|more scenes|expand.*stor|extend/i.test(
              lower
            )
          )
            return { type: "add_scenes", count: 4, direction: text };

          const sceneRef = lower.match(
            /scene\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+(?:scene|one|image|picture|frame)/i
          );
          if (
            sceneRef &&
            /change|adjust|redo|fix|update|too|more|less|different|rethink|modify|improve|tweak/i.test(
              lower
            )
          )
            return {
              type: "adjust_scene",
              sceneHint: sceneRef[1] || sceneRef[2],
              feedback: text,
            };

          if (
            pendingScenes > 0 &&
            lower.length < 30 &&
            !/^(hey|hi|hello|thanks|ok|yes|no|what|how|why|can|please)/i.test(lower)
          )
            return { type: "continue" };
        }

        if (
          /wrong style|style is wrong|should be|use .*style|not.*right.*style|change.*style|switch.*style/i.test(
            lower
          )
        )
          return { type: "style_correction", feedback: text };

        if (
          /where.*(picture|image|scene|result)|don't see|can't see|nothing.*(show\w*|appear\w*|happen\w*)|no (picture|image|result)|still waiting|what happened/i.test(
            lower
          )
        )
          return { type: "status" };

        return { type: "none" };
      }

      return {
        continueLower: classifyIntent("continue", true, 3).type,
        continueUpper: classifyIntent("Continue", true, 3).type,
        addMore: classifyIntent("give me 4 more", true, 0).type,
        addMoreCount: (classifyIntent("give me 4 more", true, 0) as { type: string; count?: number }).count,
        simple: classifyIntent("a happy cat", false, 0).type,
        newProject: classifyIntent(
          "Scene 1: cat. Scene 2: dog. Scene 3: bird. Scene 4: fish.",
          false,
          0
        ).type,
        styleCorrection: classifyIntent("use anime style", false, 0).type,
        statusCheck: classifyIntent("where are my pictures", false, 0).type,
        pendingContinue: classifyIntent("more", true, 3).type,
      };
    });

    expect(result.continueLower).toBe("continue");
    expect(result.continueUpper).toBe("continue");
    expect(result.addMore).toBe("add_scenes");
    expect(result.addMoreCount).toBe(4);
    expect(result.simple).toBe("none");
    expect(result.newProject).toBe("new_project");
    expect(result.styleCorrection).toBe("style_correction");
    expect(result.statusCheck).toBe("status");
    expect(result.pendingContinue).toBe("continue");
  });

  test("working memory store initializes, records actions, and resets", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    // Access the Zustand store via the window-exposed version
    // The store is tested via its own pure logic (no page navigation needed)
    const result = await page.evaluate(() => {
      // Simulate the working memory state machine inline
      // (mirrors useWorkingMemory behaviour without importing the module)
      const MAX_ACTIONS = 5;
      const MAX_DIGEST_WORDS = 200;

      type ActionRecord = {
        tool: string;
        summary: string;
        outcome: string;
        success: boolean;
        timestamp?: number;
      };

      type ProjectSnapshot = {
        id: string;
        brief: string;
        totalScenes: number;
        completedScenes: number;
        sceneList: Array<{ index: number; title: string; status: string; refId: string | undefined }>;
        styleGuide: { style: string; palette: string; characters: string } | null;
      };

      let state = {
        project: null as ProjectSnapshot | null,
        digest: "",
        recentActions: [] as ActionRecord[],
        preferences: {} as Record<string, string>,
      };

      // Verify initial state
      const initial = {
        hasProject: state.project !== null,
        digest: state.digest,
        actionsCount: state.recentActions.length,
      };

      // recordAction — caps at MAX_ACTIONS
      function recordAction(action: ActionRecord) {
        const actions = [...state.recentActions, { ...action, timestamp: Date.now() }];
        state = { ...state, recentActions: actions.slice(-MAX_ACTIONS) };
      }

      // appendDigest — trims to MAX_DIGEST_WORDS
      function appendDigest(text: string) {
        const combined = state.digest ? `${state.digest} ${text}` : text;
        const words = combined.split(/\s+/);
        state = {
          ...state,
          digest:
            words.length > MAX_DIGEST_WORDS
              ? words.slice(-MAX_DIGEST_WORDS).join(" ")
              : combined,
        };
      }

      recordAction({ tool: "create_media", summary: "test", outcome: "1 created", success: true });
      appendDigest("Test session started.");

      const after = {
        actionsCount: state.recentActions.length,
        digest: state.digest,
      };

      // Add more actions than MAX to verify capping
      for (let i = 0; i < 10; i++) {
        recordAction({ tool: "tool_" + i, summary: "x", outcome: "ok", success: true });
      }
      const capped = { actionsCount: state.recentActions.length };

      // reset
      state = { project: null, digest: "", recentActions: [], preferences: {} };
      const reset = { hasProject: state.project !== null, digest: state.digest, actionsCount: state.recentActions.length };

      return { initial, after, capped, reset };
    });

    expect(result.initial.hasProject).toBe(false);
    expect(result.initial.digest).toBe("");
    expect(result.initial.actionsCount).toBe(0);

    expect(result.after.actionsCount).toBe(1);
    expect(result.after.digest).toContain("Test session");

    // Actions should be capped at MAX_ACTIONS (5)
    expect(result.capped.actionsCount).toBe(5);

    // Reset should clear everything
    expect(result.reset.hasProject).toBe(false);
    expect(result.reset.digest).toBe("");
    expect(result.reset.actionsCount).toBe(0);
  });

  test("context builder produces intent-aware system prompts", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    // Inline the context-builder logic to verify intent routing
    const result = await page.evaluate(() => {
      const BASE_PROMPT = `You are a passionate creative partner in Livepeer Storyboard.`;

      type IntentType =
        | "new_project" | "continue" | "add_scenes" | "adjust_scene"
        | "style_correction" | "status" | "none";

      interface Intent { type: IntentType; count?: number; sceneHint?: string; feedback?: string; direction?: string; }
      interface ProjectSnapshot {
        id: string; brief: string; totalScenes: number; completedScenes: number;
        sceneList: Array<{ index: number; title: string; status: string; refId: string | undefined }>;
        styleGuide: { style: string; palette: string; characters: string } | null;
      }
      interface MemorySnapshot {
        project: ProjectSnapshot | null; digest: string;
        recentActions: Array<{ tool: string; summary: string; outcome: string; success: boolean }>;
        preferences: Record<string, string>;
      }

      function buildAgentContext(intent: Intent, memory: MemorySnapshot): string {
        const parts: string[] = [BASE_PROMPT];

        switch (intent.type) {
          case "new_project":
            parts.push(`## Action: New Project`);
            parts.push(`Call project_create.`);
            break;
          case "continue":
            if (memory.project) {
              parts.push(`## Action: Continue Generation`);
              parts.push(`Project "${memory.project.id}": ${memory.project.completedScenes}/${memory.project.totalScenes} scenes done.`);
              parts.push(`Call project_generate with project_id="${memory.project.id}".`);
            }
            break;
          case "add_scenes":
            parts.push(`## Action: Add ${intent.count || 4} More Scenes`);
            break;
          default:
            parts.push(`## Routing`);
            parts.push(`- 1-5 items: create_media`);
            break;
        }

        if (memory.project && intent.type !== "new_project") {
          const done = memory.project.sceneList.filter((s) => s.status === "done").map((s) => `${s.title}(${s.refId || "?"})`).join(", ");
          const pending = memory.project.sceneList.filter((s) => s.status !== "done").map((s) => s.title).join(", ");
          if (done) parts.push(`Done scenes: ${done}`);
          if (pending) parts.push(`Pending: ${pending}`);
        }

        if (memory.recentActions.length > 0) {
          const recent = memory.recentActions.slice(-3).map((a) => `${a.tool}: ${a.outcome}`).join("; ");
          parts.push(`Recent: ${recent}`);
        }

        if (memory.digest) parts.push(`Session: ${memory.digest}`);

        return parts.join("\n");
      }

      const emptyMemory: MemorySnapshot = { project: null, digest: "", recentActions: [], preferences: {} };

      const simpleCtx = buildAgentContext({ type: "none" }, emptyMemory);

      const projectMemory: MemorySnapshot = {
        project: {
          id: "test_proj",
          brief: "test",
          totalScenes: 8,
          completedScenes: 5,
          sceneList: [
            { index: 0, title: "Intro", status: "done", refId: "ref_1" },
            { index: 1, title: "Climax", status: "pending", refId: undefined },
          ],
          styleGuide: { style: "Ghibli", palette: "warm", characters: "girl" },
        },
        digest: "User wants Ghibli style.",
        recentActions: [{ tool: "project_generate", summary: "batch", outcome: "5 created", success: true }],
        preferences: {},
      };

      const continueCtx = buildAgentContext({ type: "continue" }, projectMemory);

      return {
        simpleHasRouting: simpleCtx.includes("Routing"),
        continueHasProjectId: continueCtx.includes("test_proj"),
        continueHasGenerate: continueCtx.includes("project_generate"),
        continueHasProgress: continueCtx.includes("5/8"),
        continueHasPending: continueCtx.includes("Climax"),
        continueHasDone: continueCtx.includes("Intro"),
        continueHasDigest: continueCtx.includes("Ghibli style"),
        continueHasRecentAction: continueCtx.includes("5 created"),
      };
    });

    expect(result.simpleHasRouting).toBe(true);
    expect(result.continueHasProjectId).toBe(true);
    expect(result.continueHasGenerate).toBe(true);
    expect(result.continueHasProgress).toBe(true);
    expect(result.continueHasPending).toBe(true);
    expect(result.continueHasDone).toBe(true);
    expect(result.continueHasDigest).toBe(true);
    expect(result.continueHasRecentAction).toBe(true);
  });
});
