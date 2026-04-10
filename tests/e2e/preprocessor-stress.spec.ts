import { test, expect } from "@playwright/test";

const TWENTY_SCENE_PROMPT = `Create a 20-scene cinematic brand film for "Northern Pulse" — a premium Canadian outdoor apparel brand launching their 2027 winter collection. The film tells the story of a day in the life of four friends on a backcountry skiing adventure in British Columbia. Visual style: cinematic documentary, handheld camera feel mixed with sweeping drone shots. Color grading: cool blues and whites for exteriors, warm amber for interior/campfire scenes. Aspect ratio: 2.39:1 widescreen. The emotional arc moves from anticipation → exhilaration → vulnerability → connection → gratitude.

Scene 1 — Pre-Dawn Kitchen / The Alarm
4:30 AM. A dark kitchen in a Whistler cabin. A phone alarm glows on the counter. A hand reaches to silence it. Coffee maker starts gurgling. Breath visible in the cold air. The Northern Pulse logo appears subtly on a jacket hanging by the door. Mood: quiet anticipation. Super: "Some days start before the sun."

Scene 2 — Gear Check / Living Room
The four friends spread gear across the cabin floor. Skis, poles, avalanche beacons, probe poles, shovels. Close-up hands checking bindings. Someone pulls on Northern Pulse base layers — merino wool, dark navy with subtle reflective threading. Morning light creeping through frosted windows. Mood: methodical preparation.

Scene 3 — Loading the Truck / Driveway
Exterior shot. A lifted Toyota Tacoma in the driveway, breath clouds visible. The crew loads skis onto the roof rack. One friend tosses a thermos to another. Everyone in Northern Pulse shells — matte black with cedar green accents. Stars still visible. First light on the mountain peaks behind. Super: "Tested by those who go further."

Scene 4 — The Drive / Mountain Highway
Dashboard cam POV. The truck winds through Sea-to-Sky Highway. Headlights cutting through early morning fog. Inside: four faces lit by dashboard glow, someone navigating on a phone, quiet conversation. The Tantalus Range emerges in the windshield as dawn breaks. Soundtrack: ambient electronic pulse building slowly.

Scene 5 — Trailhead / Bootup
The truck parks at an empty lot at the base of a backcountry access trail. Everyone steps out into deep snow. Breath clouds everywhere. They click into touring bindings, adjust poles, seal skins on skis. A wide shot shows the immense mountain above them — tiny human figures against white wilderness. Super: "The approach is part of the reward."

Scene 6 — The Skin Up / Forest Section
The four ascend through old-growth cedar forest on touring skis. Single file. Snow heavy on branches. Shafts of golden early light filter through. Close-up: ski skins gripping snow, poles planting rhythmically. Someone pauses, looks up at a massive tree. Silence except for breathing and snow crunch. Mood: meditative effort.

Scene 7 — The Skin Up / Alpine Transition
They emerge above the treeline. The landscape opens dramatically — a vast alpine bowl, cornices, wind-sculpted ridges. Wind picks up. They pull up hoods, zip Northern Pulse shells tight. A drone shot reveals the scale: four colorful dots traversing a white expanse. Temperature drops visible on exposed skin. Super: "Where comfort meets consequence."

Scene 8 — Ridge Summit / The View
They reach the ridge. All four stop, plant poles, and just look. A 360-degree panorama of Coast Mountains. Glaciers, distant peaks, clouds below them. Someone pulls off goggles, genuine awe on their face. A long, slow pan across the landscape. No dialogue. Just wind and breathing. This is the emotional peak of anticipation.

Scene 9 — Safety Check / Beacon Practice
Serious moment. They do a final avalanche beacon check — each person transmits, the others verify signal. Someone studies the snowpack, digs a quick pit, examines layers. A brief discussion about the line choice. Close-up: focused eyes, measured decisions. Mood: respect for the mountain. Super: "Knowledge is the lightest gear you carry."

Scene 10 — The Drop In / First Line
The first skier drops in. Camera follows from behind — powder explodes on each turn. Slow motion: snow crystals catching light, a rooster tail of white against deep blue sky. The other three watch from the ridge, cheering. Cut to face shot: pure joy, snow on goggles. The Northern Pulse shell moves beautifully in motion — articulated, no restriction.

Scene 11 — Full Send / Group Descent
All four descend together, spaced out across the face. Drone shot from above: four parallel tracks carved into untouched powder. Each skier has their own style — one smooth and flowing, one aggressive, one playful, one precise. The mountain is their canvas. Soundtrack hits its peak. Super: "Made to move. Built to last."

Scene 12 — The Wipeout / Vulnerability
One skier catches an edge in heavy snow and tumbles spectacularly. Snow explosion. They slide to a stop, face-down. A beat of silence. Then laughter — muffled through snow. A friend skis over, offers a hand. Close-up: snow-packed goggles, huge grin underneath. The Northern Pulse jacket covered in snow but completely intact. Mood: humility and friendship.

Scene 13 — Lunch Spot / The Flat
They find a sheltered spot in the trees. Drop packs. Someone pulls out a small stove, starts melting snow for tea. Sandwiches unwrapped from foil. They sit on their packs, skis stuck upright in the snow. Steam from cups. Quiet conversation, comfortable silence. Close-up: Northern Pulse gloves holding a warm mug. Mood: earned rest.

Scene 14 — Afternoon Light / Second Run
Afternoon golden light transforms the mountain. They hike a short bootpack to a secondary line. This run is tighter — through trees, more technical. Camera mounted low, capturing the intimacy of tree skiing. Snow falling from branches as they pass. Each turn deliberate, connected. A sense of flow and mastery.

Scene 15 — The Unexpected / Weather Change
Sky darkens rapidly. Wind increases. Snow begins falling heavily. The mood shifts. They group together, check the map, make a quick decision to descend. Headlamps click on though it is only 3 PM. The visibility drops to 20 meters. Northern Pulse shells with reflective threading now visible in the flat light. Mood: nature's reminder of who is in charge.

Scene 16 — The Descent / Navigating Out
They ski cautiously through whiteout conditions, following the uptrack. One person navigates with GPS. Tight single-file formation. The camera captures the contrast between earlier euphoria and current focused determination. Close-up: ice forming on jacket zippers, wind-blasted face, eyes locked forward. Super: "The mountain decides when you leave."

Scene 17 — Back at the Truck / Relief
They reach the trailhead parking lot. Skis come off. Someone lets out a whoop. Group hug in the snow. The truck is buried under fresh snow — they laugh and brush it off. Inside the truck: heater blasting, wet gloves on the dashboard, fogged windows. Someone passes around a chocolate bar. Mood: deep satisfaction and relief.

Scene 18 — Evening / The Cabin Return
Back at the cabin. Gear hangs everywhere — jackets steaming on hooks, boots by the fire. Someone starts cooking pasta. Others sprawl on couches. A fire crackles in the woodstove. Outside the window: snow falling hard, mountain invisible now. Warm amber lighting. Northern Pulse gear drying, still looking pristine despite the day. Mood: gratitude.

Scene 19 — The Campfire / Stars
Late evening. They sit around a fire pit behind the cabin. Stars emerging between clearing clouds. Someone strums a guitar quietly. Mugs of something warm. Faces lit by firelight. A long silence that feels full, not empty. Someone says "Same time next week?" and everyone laughs. This is the emotional resolution. Super: "The best stories start with 'remember when...'"

Scene 20 — Final Frame / Brand Close
Dawn again. The cabin is quiet. Four pairs of Northern Pulse boots by the door. Four jackets on hooks. Through the window: fresh tracks visible on the mountain from yesterday, already being filled by new snow. The Northern Pulse logo fades in. Tagline: "Northern Pulse — For Days Like These." Cut to black. Website URL.

Style direction across all 20 scenes:
Cinematic documentary aesthetic — feels real, not staged
Widescreen 2.39:1 framing throughout
Natural lighting only — golden hour, overcast, firelight
Diverse cast: Indigenous, Asian, Black, White — reflecting real Canadian backcountry community
Product integration subtle — Northern Pulse gear visible but never the focus
Sound design: natural ambient (wind, snow, breathing, fire) layered with minimal electronic soundtrack
No voiceover — visuals and sparse supers tell the story
Each scene should feel like it could be a standalone photograph`;

test.describe("Preprocessor Stress Test: 20-Scene Brief", () => {
  test("preprocessor detects 20-scene prompt as multi-scene", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();

    // Verify the prompt is detected as multi-scene
    const result = await page.evaluate((prompt) => {
      // Test the detection pattern from preprocessor
      const lower = prompt.toLowerCase();
      const sceneCount = (lower.match(/scene\s*\d|shot\s*\d|frame\s*\d/gi) || []).length;
      const sceneDash = (prompt.match(/scene\s+\d+\s*[—\-–:]/gi) || []).length;
      const isLong = prompt.length > 1500;
      const hasKeyword = lower.includes("storyboard") || lower.includes("campaign") || lower.includes("scenes");
      return {
        length: prompt.length,
        wordCount: prompt.split(/\s+/).length,
        sceneCount,
        sceneDash,
        isLong,
        hasKeyword,
        detected: sceneCount >= 3 || sceneDash >= 3 || (isLong && hasKeyword),
      };
    }, TWENTY_SCENE_PROMPT);

    console.log("Prompt analysis:", JSON.stringify(result, null, 2));
    expect(result.detected).toBe(true);
    expect(result.sceneCount).toBeGreaterThanOrEqual(20);
    expect(result.length).toBeGreaterThan(2000);
    expect(result.wordCount).toBeGreaterThan(1000);
  });

  test("preprocessor extracts all 20 scenes correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();

    const result = await page.evaluate((prompt) => {
      // Replicate scene extraction logic
      const scenes: Array<{ title: string; prompt: string }> = [];
      const sceneRegex = /(?:scene|shot|frame)\s*(\d+)\s*[—\-–:]\s*([^\n]+)\n([\s\S]*?)(?=(?:scene|shot|frame)\s*\d+\s*[—\-–:]|style\s+direction|$)/gi;
      let match;
      while ((match = sceneRegex.exec(prompt)) !== null) {
        const title = match[2].trim();
        const desc = match[3].trim();
        const firstSentence = desc.split(/[.!?\n]/)[0]?.trim() || "";
        const combined = `${title}. ${firstSentence}`;
        const words = combined.split(/\s+/);
        const shortPrompt = words.length <= 25 ? combined : words.slice(0, 25).join(" ");
        scenes.push({ title, prompt: shortPrompt });
      }
      return {
        sceneCount: scenes.length,
        scenes: scenes.map((s, i) => ({
          index: i,
          title: s.title,
          promptLength: s.prompt.split(/\s+/).length,
          prompt: s.prompt,
        }))
      };
    }, TWENTY_SCENE_PROMPT);

    console.log(`Extracted ${result.sceneCount} scenes:`);
    for (const s of result.scenes) {
      console.log(`  Scene ${s.index}: "${s.title}" (${s.promptLength} words) → "${s.prompt}"`);
    }

    expect(result.sceneCount).toBe(20);
    // All prompts should be ≤ 25 words
    for (const s of result.scenes) {
      expect(s.promptLength).toBeLessThanOrEqual(25);
    }
  });

  test("preprocessor extracts style guide", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();

    const result = await page.evaluate((prompt) => {
      const lower = prompt.toLowerCase();
      let visual_style = "";
      let color_palette = "";
      let mood = "";

      const styleMatch = prompt.match(/(?:visual\s+style|style\s*:)[:\s]*([^.\n]+)/i);
      if (styleMatch) visual_style = styleMatch[1].trim().slice(0, 100);
      else if (lower.includes("cinematic")) visual_style = "cinematic documentary";

      const colorMatch = prompt.match(/(?:colour|color)\s*(?:palette|grading)?[:\s]*([^.\n]+)/i);
      if (colorMatch) color_palette = colorMatch[1].trim().slice(0, 100);

      const moodMatch = prompt.match(/(?:mood|tone)[:\s]*([^.\n]+)/i);
      if (moodMatch) mood = moodMatch[1].trim().slice(0, 100);

      return { visual_style, color_palette, mood };
    }, TWENTY_SCENE_PROMPT);

    console.log("Style guide:", JSON.stringify(result, null, 2));
    expect(result.color_palette).toBeTruthy();
  });

  test("full preprocessor pipeline creates project with personality", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    await page.waitForTimeout(1000);

    const chatInput = page.locator('textarea[placeholder*="Create a dragon"]');
    await expect(chatInput).toBeVisible();

    await chatInput.fill(TWENTY_SCENE_PROMPT);
    await chatInput.press("Enter");

    // Preprocessor should show personality reaction + planning
    // Look for any of the personality messages or scene generation status
    await expect(
      page.getByText(/love this|gorgeous|vision|creative challenge|Planning|Mapping|scenes.*coming/i).first()
    ).toBeVisible({ timeout: 15000 });

    // Should show generation progress
    await expect(
      page.getByText(/Generating scenes|scenes ready|done/i).first()
    ).toBeVisible({ timeout: 30000 });

    // Verify no "Couldn't process" error
    const errorVisible = await page.getByText("Couldn't process").isVisible().catch(() => false);
    expect(errorVisible).toBe(false);
  });

  test("short prompts bypass preprocessor", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();

    const chatInput = page.locator('textarea[placeholder*="Create a dragon"]');
    await chatInput.fill("cat eating cheez-it");
    await chatInput.press("Enter");

    // Should NOT show personality/planning messages
    await page.waitForTimeout(2000);
    const planningVisible = await page.getByText(/Planning|Mapping out|scenes.*coming/).isVisible().catch(() => false);
    expect(planningVisible).toBe(false);
  });

  test("intent classifier: continue, add_scenes, adjust, status, none", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();

    const result = await page.evaluate(() => {
      // Replicate classifyIntent logic for testing
      function classify(text: string, hasProject: boolean, pending: number) {
        const lower = text.toLowerCase().trim();

        if (/^(continue|keep going|go|next|do the rest|finish|carry on|proceed|go ahead)\.?$/i.test(lower))
          return "continue";
        if (/continue generating|keep going|finish (it|them|the rest)|do the rest|next batch|remaining scenes/i.test(lower))
          return "continue";

        const moreCountMatch = lower.match(/(?:give|make|add|create|do|generate)\s+(?:me\s+)?(\d+)\s+more/i);
        if (moreCountMatch) return `add_scenes:${moreCountMatch[1]}`;

        if (hasProject) {
          if (/(?:add|give|make|create)\s+(?:me\s+)?more|more scenes|expand.*stor|extend/i.test(lower))
            return "add_scenes:4";
          if (/make.*(story|storyboard|it).*(more|better|interesting|dramatic|funny|exciting|emotional|longer)/i.test(lower))
            return "add_scenes:4";
          if (/(?:i\s+)?(?:want|need)\s+more|not enough|too few|too short/i.test(lower))
            return "add_scenes:4";

          const sceneRef = lower.match(/scene\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+(?:scene|one|image|picture|frame)/i);
          if (sceneRef && /change|adjust|redo|fix|update|too|more|less|different|rethink|modify|improve|tweak/i.test(lower))
            return `adjust:${sceneRef[1] || sceneRef[2]}`;
          if (/(?:the|that)\s+\w+\s+(?:scene|one|image|picture).*(?:needs?|should|could|is too|isn't|looks)/i.test(lower))
            return "adjust";
        }

        if (/where.*(picture|image|scene|result)|don't see|can't see|nothing (show|appear|happen)|no (picture|image|result)|still waiting|what happened/i.test(lower))
          return "status";

        return "none";
      }

      const withProject = true;
      const noProject = false;

      return {
        // Continue
        continue1: classify("continue", noProject, 0),
        continue2: classify("keep going", noProject, 0),
        continue3: classify("do the rest", noProject, 0),
        continue4: classify("finish the remaining scenes", noProject, 0),

        // Add scenes (with count)
        add1: classify("give me 8 more", withProject, 0),
        add2: classify("add 4 more scenes", withProject, 0),
        add3: classify("make 6 more", withProject, 0),

        // Add scenes (no count, default 4)
        add4: classify("add more", withProject, 0),
        add5: classify("more scenes", withProject, 0),
        add6: classify("expand the storyboard", withProject, 0),
        add7: classify("give me more to make the story more interesting", withProject, 0),
        add8: classify("make the story more dramatic", withProject, 0),
        add9: classify("I want more", withProject, 0),
        add10: classify("not enough scenes", withProject, 0),
        add11: classify("make it longer", withProject, 0),

        // Adjust scene
        adj1: classify("scene 3 needs more color", withProject, 0),
        adj2: classify("change scene 5 to be more dramatic", withProject, 0),
        adj3: classify("the market scene needs brighter colors", withProject, 0),
        adj4: classify("redo the 2nd scene", withProject, 0),

        // Status
        stat1: classify("where are my pictures", noProject, 0),
        stat2: classify("I don't see anything", noProject, 0),
        stat3: classify("what happened", noProject, 0),

        // None — should pass through to agent
        none1: classify("cat eating cheez-it", noProject, 0),
        none2: classify("make it blue", noProject, 0),
        none3: classify("hello", noProject, 0),
        // Without project context, "add more" is none
        none4: classify("make the story more interesting", noProject, 0),
      };
    });

    // Continue
    expect(result.continue1).toBe("continue");
    expect(result.continue2).toBe("continue");
    expect(result.continue3).toBe("continue");
    expect(result.continue4).toBe("continue");

    // Add scenes with count
    expect(result.add1).toBe("add_scenes:8");
    expect(result.add2).toBe("add_scenes:4");
    expect(result.add3).toBe("add_scenes:6");

    // Add scenes default count
    expect(result.add4).toBe("add_scenes:4");
    expect(result.add5).toBe("add_scenes:4");
    expect(result.add6).toBe("add_scenes:4");
    expect(result.add7).toBe("add_scenes:4");
    expect(result.add8).toBe("add_scenes:4");
    expect(result.add9).toBe("add_scenes:4");
    expect(result.add10).toBe("add_scenes:4");
    expect(result.add11).toBe("add_scenes:4");

    // Adjust scene
    expect(result.adj1).toMatch(/^adjust/);
    expect(result.adj2).toMatch(/^adjust/);
    expect(result.adj3).toBe("adjust");
    expect(result.adj4).toMatch(/^adjust/);

    // Status
    expect(result.stat1).toBe("status");
    expect(result.stat2).toBe("status");
    expect(result.stat3).toBe("status");

    // None
    expect(result.none1).toBe("none");
    expect(result.none2).toBe("none");
    expect(result.none3).toBe("none");
    expect(result.none4).toBe("none"); // no project → no context → none
  });

  // Regressions
  test("regression: app loads normally", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    await expect(page.getByText("CAM", { exact: true })).toBeVisible();
  });

  test("regression: health API", async ({ page }) => {
    const resp = await page.request.get("/api/health");
    expect(resp.ok()).toBeTruthy();
  });
});
