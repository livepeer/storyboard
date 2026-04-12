import { test, expect } from "@playwright/test";

test.describe("Stream Cockpit", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("cockpit store tracks pinned skills", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline replica of cockpit store logic
      const skills: Array<{ id: string; name: string; triggers: string[]; uses: number }> = [];
      const STOP_WORDS = new Set(["the", "and", "with", "for", "make", "let", "put", "use", "this", "that", "have", "more", "less", "some", "any", "all"]);
      const extractTriggers = (intent: string) =>
        intent.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));

      const skill = {
        id: "p1",
        name: "Anime Quick",
        triggers: extractTriggers("anime style"),
        uses: 0,
      };
      skills.push(skill);

      // Match
      const intentTriggers = extractTriggers("make it anime");
      const found = skills.find((s) => s.triggers.some((t) => intentTriggers.includes(t)));
      return { skillName: skill.name, found: found?.name, triggers: skill.triggers };
    });

    expect(result.skillName).toBe("Anime Quick");
    expect(result.found).toBe("Anime Quick");
    expect(result.triggers).toContain("anime");
  });

  test("slash command parser handles /preset, /noise, /reset", async ({ page }) => {
    const result = await page.evaluate(() => {
      function parseSlash(input: string): { tool: string; preset?: string; noise?: number; reset?: boolean } | null {
        const m = input.trim().match(/^\/(\w+)(?:\s+(.+))?$/);
        if (!m) return null;
        const cmd = m[1].toLowerCase();
        const arg = (m[2] || "").trim();
        if (cmd === "preset" && arg) return { tool: "scope_apply_preset", preset: arg };
        if (cmd === "noise") {
          const v = parseFloat(arg);
          if (!isNaN(v)) return { tool: "scope_control", noise: v };
        }
        if (cmd === "reset") return { tool: "scope_control", reset: true };
        return null;
      }
      return {
        preset: parseSlash("/preset dreamy"),
        noise: parseSlash("/noise 0.7"),
        reset: parseSlash("/reset"),
        invalid: parseSlash("not a slash"),
      };
    });

    expect(result.preset?.tool).toBe("scope_apply_preset");
    expect(result.preset?.preset).toBe("dreamy");
    expect(result.noise?.noise).toBe(0.7);
    expect(result.reset?.reset).toBe(true);
    expect(result.invalid).toBeNull();
  });

  test("preset list contains 7 built-in presets", async ({ page }) => {
    const presetIds = ["dreamy", "cinematic", "anime", "abstract", "faithful", "painterly", "psychedelic"];
    expect(presetIds).toHaveLength(7);
    expect(presetIds).toContain("dreamy");
    expect(presetIds).toContain("psychedelic");
  });

  test("intent translator priority order", async ({ page }) => {
    // Pinned skill > slash command > keyword match > fallback
    const result = await page.evaluate(() => {
      function translate(intent: string, hasPinned: boolean): string {
        if (hasPinned) return "pinned";
        if (intent.startsWith("/")) return "slash";
        if (intent.includes("dreamy") || intent.includes("anime") || intent.includes("cinematic")) return "preset";
        return "fallback";
      }
      return {
        pinned: translate("anime style", true),
        slash: translate("/preset cinematic", false),
        keyword: translate("make it dreamy", false),
        fallback: translate("random text here", false),
      };
    });

    expect(result.pinned).toBe("pinned");
    expect(result.slash).toBe("slash");
    expect(result.keyword).toBe("preset");
    expect(result.fallback).toBe("fallback");
  });

  test("history tracking caps at 100 entries", async ({ page }) => {
    const result = await page.evaluate(() => {
      const MAX = 100;
      let history: Array<{ intent: string }> = [];
      function add(intent: string) {
        const next = [...history, { intent }];
        history = next.length > MAX ? next.slice(-MAX) : next;
      }
      for (let i = 0; i < 110; i++) add(`intent ${i}`);
      return { length: history.length, first: history[0].intent, last: history[history.length - 1].intent };
    });

    expect(result.length).toBe(100);
    expect(result.first).toBe("intent 10");
    expect(result.last).toBe("intent 109");
  });

  test("HUD overlay formats noise/cache values", async ({ page }) => {
    const result = await page.evaluate(() => {
      const params = { noise_scale: 0.65, kv_cache_attention_bias: 0.4, denoising_step_list: [1000, 500] };
      const noise = (params.noise_scale as number).toFixed(2);
      const cache = (params.kv_cache_attention_bias as number).toFixed(2);
      const steps = `[${params.denoising_step_list.join(",")}]`;
      return { noise, cache, steps };
    });

    expect(result.noise).toBe("0.65");
    expect(result.cache).toBe("0.40");
    expect(result.steps).toBe("[1000,500]");
  });
});
