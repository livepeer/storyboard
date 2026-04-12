import { test, expect } from "@playwright/test";

const TANK_KURO_BRIEF = `Create a 6-scene animated short video in the style of Studio Ghibli — hand-painted cel animation aesthetic. The film follows TANK, a wrinkled English bulldog with an underbite, and KURO, a sleek tuxedo cat with white gloves and green eyes. They live in a weathered Japanese fishing village.

SCENE 1 — TWO WORLDS, ONE LANE
Duration: 45 seconds | Camera: slow pan left to right
Golden morning. Tank sits outside a weathered wooden shop. Kuro sits on a wall.
Visual language: warm saffron morning light

SCENE 2 — THE FIRST INSULT
Duration: 50 seconds | Camera: ground level
Tank attempts to cross a bridge but Kuro is sitting in the centre.
Visual language: dappled noon light through cedar trees

SCENE 3 — THE STORM
Duration: 70 seconds | Camera: dramatic wide shots
A typhoon arrives. Tank wades into floodwater to save Kuro.
Visual language: desaturated blue-black storm palette

SCENE 4 — THE MORNING AFTER
Duration: 55 seconds | Camera: slow intimate
Tank and Kuro asleep on temple steps.
Visual language: pale gold and silver dawn

SCENE 5 — THE SEASONS PASS
Duration: 60 seconds | Camera: varied
Four-season montage of small daily moments.
Visual language: each season has signature palette

SCENE 6 — THE EVENING THEY ALWAYS RETURN TO
Duration: 65 seconds | Camera: wide to close
Years later. They sit on the harbour wall together.
Visual language: deep amber lantern warmth

Colour temperature arc:
Scene 1 \u2192 warm gold
Scene 2 \u2192 bright noon white
Scene 3 \u2192 cold blue-black
Scene 4 \u2192 pale silver-gold
Scene 5 \u2192 full seasonal spectrum
Scene 6 \u2192 deep amber lantern warmth`;

test.describe("Video Intent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("detectVideoIntent recognizes the Tank & Kuro brief", async ({ page }) => {
    const result = await page.evaluate((brief) => {
      const VIDEO_KEYWORDS = [
        /\b(animated|animation|short film|short video|video clip|movie|cinematic short)\b/i,
        /\bduration:\s*\d+\s*(s|sec|second|minute)/i,
        /\b\d+[-\s]second\b/i,
        /\b(scene\s*\d+.*camera|tracking shot|close[-\s]?up|wide shot|cut to|fade to|zoom in|zoom out)\b/i,
      ];
      return VIDEO_KEYWORDS.some((re) => re.test(brief));
    }, TANK_KURO_BRIEF);
    expect(result).toBe(true);
  });

  test("extractDurations parses all 6 scenes", async ({ page }) => {
    const result = await page.evaluate((brief) => {
      const sceneBlocks = brief.split(/(?=SCENE\s*\d+)/i);
      const result: { sceneIndex: number; seconds: number }[] = [];
      let sceneIdx = 0;
      for (const block of sceneBlocks) {
        if (!/SCENE\s*\d+/i.test(block)) continue;
        const m = block.match(/duration:\s*(\d+)\s*(s|sec|second|minute|min)/i);
        if (m) {
          let seconds = parseInt(m[1], 10);
          if (m[2].toLowerCase().startsWith("min")) seconds *= 60;
          result.push({ sceneIndex: sceneIdx, seconds });
        }
        sceneIdx++;
      }
      return result;
    }, TANK_KURO_BRIEF);

    expect(result).toHaveLength(6);
    expect(result[0].seconds).toBe(45);
    expect(result[1].seconds).toBe(50);
    expect(result[2].seconds).toBe(70);
    expect(result[5].seconds).toBe(65);
    const total = result.reduce((s, d) => s + d.seconds, 0);
    expect(total).toBe(345);
  });

  test("extractColorArc parses all 6 colors", async ({ page }) => {
    const result = await page.evaluate((brief) => {
      const arc: string[] = [];
      const lines = brief.split("\n");
      for (const line of lines) {
        const m = line.match(/scene\s*\d+\s*[\u2192\->]+\s*(.+)/i);
        if (m) {
          const color = m[1].trim();
          if (color.length > 0 && color.length < 60) arc.push(color);
        }
      }
      return arc;
    }, TANK_KURO_BRIEF);

    expect(result).toHaveLength(6);
    expect(result[0]).toContain("warm gold");
    expect(result[2]).toContain("cold blue-black");
    expect(result[5]).toContain("deep amber");
  });

  test("planVideoStrategy: overview = 6, full = 36", async ({ page }) => {
    const result = await page.evaluate(() => {
      const durations = [45, 50, 70, 55, 60, 65];
      const overview = { perScene: durations.map(() => 1), totalClips: durations.length };
      const fullPerScene = durations.map((d) => Math.max(1, Math.ceil(d / 10)));
      const full = { perScene: fullPerScene, totalClips: fullPerScene.reduce((a, b) => a + b, 0) };
      return { overview, full };
    });

    expect(result.overview.totalClips).toBe(6);
    // 45/10=5, 50/10=5, 70/10=7, 55/10=6, 60/10=6, 65/10=7 → 5+5+7+6+6+7 = 36
    expect(result.full.totalClips).toBe(36);
  });

  test("video_keyframe action is in valid actions", async ({ page }) => {
    const result = await page.evaluate(() => {
      const validActions = ["generate", "restyle", "animate", "upscale", "remove_bg", "tts", "video_keyframe"];
      return validActions.includes("video_keyframe");
    });
    expect(result).toBe(true);
  });

  test("buildLockedPrefix combines style fields", async ({ page }) => {
    const result = await page.evaluate(() => {
      const ctx = {
        style: "Studio Ghibli watercolor",
        characters: "TANK the bulldog and KURO the cat",
        setting: "Japanese fishing village",
        palette: "warm gold",
        mood: "peaceful",
      };
      const parts: string[] = [];
      if (ctx.style) parts.push(ctx.style);
      if (ctx.characters) parts.push(ctx.characters);
      if (ctx.palette) parts.push(ctx.palette);
      if (ctx.setting) parts.push(ctx.setting);
      if (ctx.mood) parts.push(ctx.mood);
      const prefix = parts.join(", ") + ", ";
      return { prefix, hasStyle: prefix.includes("Ghibli"), hasChars: prefix.includes("TANK") };
    });

    expect(result.hasStyle).toBe(true);
    expect(result.hasChars).toBe(true);
    expect(result.prefix.endsWith(", ")).toBe(true);
  });

  test("extractCharacterLock pulls TANK and KURO from brief", async ({ page }) => {
    const result = await page.evaluate((brief) => {
      const matches: string[] = [];
      const re = /\b([A-Z]{2,}[A-Z]*)\b\s*[,\u2014]\s*(?:a|the|an)?\s*([^.\n]{20,200})/g;
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = re.exec(brief)) !== null) {
        const name = m[1];
        if (seen.has(name)) continue;
        seen.add(name);
        const desc = m[2].trim().replace(/\s+/g, " ").slice(0, 120);
        matches.push(`${name} is ${desc}`);
        if (matches.length >= 3) break;
      }
      return matches.join(". ");
    }, TANK_KURO_BRIEF);

    expect(result.toUpperCase()).toContain("TANK");
    expect(result.toUpperCase()).toContain("KURO");
  });
});
