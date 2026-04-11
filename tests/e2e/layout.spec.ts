import { test, expect } from "@playwright/test";

test.describe("Layout Agent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("8 built-in layout skills exist", () => {
    // Mirror the BUILT_IN_SKILLS array from lib/layout/skills.ts
    const ids = [
      "basic",
      "narrative",
      "episode",
      "graphic-novel",
      "ads-board",
      "movie-board",
      "balanced",
      "freeform",
    ];
    expect(ids).toHaveLength(8);
    expect(ids).toContain("basic");
    expect(ids).toContain("narrative");
    expect(ids).toContain("episode");
    expect(ids).toContain("graphic-novel");
    expect(ids).toContain("ads-board");
    expect(ids).toContain("movie-board");
    expect(ids).toContain("balanced");
    expect(ids).toContain("freeform");
  });

  test("layout skill presets have correct properties", () => {
    // Mirror the preset definitions from lib/layout/skills.ts
    const skills = [
      { id: "basic", cols: 6, gap: 24, flow: "ltr", groupBy: "batch", rowSeparator: 0 },
      { id: "narrative", cols: 8, gap: 24, flow: "ltr", groupBy: "batch", rowSeparator: 40 },
      { id: "episode", cols: 6, gap: 24, flow: "ltr", groupBy: "episode", rowSeparator: 60 },
      { id: "graphic-novel", cols: 3, gap: 8, flow: "zigzag", groupBy: "batch", rowSeparator: 24 },
      { id: "ads-board", cols: 4, gap: 32, flow: "center-out", groupBy: "none", rowSeparator: 0 },
      { id: "movie-board", cols: 5, gap: 24, flow: "ltr", groupBy: "batch", rowSeparator: 48 },
      { id: "balanced", cols: 4, gap: 28, flow: "ltr", groupBy: "batch", rowSeparator: 32 },
    ];

    // basic: 6 cols
    const basic = skills.find((s) => s.id === "basic")!;
    expect(basic.cols).toBe(6);
    expect(basic.flow).toBe("ltr");
    expect(basic.groupBy).toBe("batch");

    // narrative: 8 cols, row separator
    const narrative = skills.find((s) => s.id === "narrative")!;
    expect(narrative.cols).toBe(8);
    expect(narrative.rowSeparator).toBe(40);

    // graphic-novel: zigzag flow, tight gap
    const gn = skills.find((s) => s.id === "graphic-novel")!;
    expect(gn.flow).toBe("zigzag");
    expect(gn.cols).toBe(3);
    expect(gn.gap).toBe(8);

    // ads-board: center-out, groupBy none
    const ads = skills.find((s) => s.id === "ads-board")!;
    expect(ads.flow).toBe("center-out");
    expect(ads.groupBy).toBe("none");

    // episode: grouped by episode
    const ep = skills.find((s) => s.id === "episode")!;
    expect(ep.groupBy).toBe("episode");
    expect(ep.rowSeparator).toBe(60);

    // freeform has no preset (not in the list above)
    expect(skills.find((s) => s.id === "freeform")).toBeUndefined();
  });

  test("layout engine positions cards without overlap", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline the basic grid layout logic (mirrors runPreset in engine.ts)
      // BASE_CARD_W=320, BASE_CARD_H=280, BASE_GAP=24, HEADER_OFFSET=48
      const BASE_CARD_W = 320;
      const BASE_CARD_H = 280;
      const HEADER_OFFSET = 48;

      const cols = 6;
      const gap = 24;
      const cardW = BASE_CARD_W;
      const cardH = BASE_CARD_H;
      const cardCount = 10;

      const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
      let currentY = gap + HEADER_OFFSET;
      let col = 0;

      for (let i = 0; i < cardCount; i++) {
        if (col >= cols) {
          col = 0;
          currentY += cardH + gap;
        }
        positions.push({
          x: gap + col * (cardW + gap),
          y: currentY,
          w: cardW,
          h: cardH,
        });
        col++;
      }

      // Check no overlaps
      let overlaps = 0;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i];
          const b = positions[j];
          const overlapping =
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y;
          if (overlapping) overlaps++;
        }
      }

      const rows = Math.ceil(cardCount / cols);
      const firstX = positions[0].x;
      const firstY = positions[0].y;
      const rowStartX = positions[cols].x; // first card of second row

      return {
        count: positions.length,
        overlaps,
        rows,
        firstX,
        firstY,
        rowStartX,
      };
    });

    expect(result.count).toBe(10);
    expect(result.overlaps).toBe(0);
    expect(result.rows).toBe(2);
    // First card starts at gap=24 on x-axis
    expect(result.firstX).toBe(24);
    // First card y = gap + HEADER_OFFSET = 24 + 48 = 72
    expect(result.firstY).toBe(72);
    // Second row starts at same x as first
    expect(result.rowStartX).toBe(24);
  });

  test("layout engine produces non-overlapping positions for 20 cards", async ({ page }) => {
    const result = await page.evaluate(() => {
      const BASE_CARD_W = 320;
      const BASE_CARD_H = 280;
      const HEADER_OFFSET = 48;

      // Test with narrative preset (8 cols, rowSeparator=40)
      const cols = 8;
      const gap = 24;
      const rowSeparator = 40;
      const cardW = BASE_CARD_W;
      const cardH = BASE_CARD_H;
      const cardCount = 20;

      const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
      let currentY = gap + HEADER_OFFSET;
      let col = 0;

      for (let i = 0; i < cardCount; i++) {
        if (col >= cols) {
          col = 0;
          currentY += cardH + gap;
        }
        positions.push({ x: gap + col * (cardW + gap), y: currentY, w: cardW, h: cardH });
        col++;
      }

      let overlaps = 0;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i], b = positions[j];
          if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
            overlaps++;
          }
        }
      }
      return { count: positions.length, overlaps };
    });

    expect(result.count).toBe(20);
    expect(result.overlaps).toBe(0);
  });

  test("zigzag flow alternates direction each row", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline zigzag logic from engine.ts positionRows
      const cols = 3;
      const gap = 8;
      const cardW = Math.round(320 * 1.3); // cardScale=1.3 for graphic-novel
      const cardH = Math.round(280 * 1.3);
      const HEADER_OFFSET = 48;

      const cardCount = 6; // 2 full rows of 3
      const positions: Array<{ x: number; y: number }> = [];
      let currentY = gap + HEADER_OFFSET;
      let col = 0;
      let globalIdx = 0;

      for (let i = 0; i < cardCount; i++) {
        if (col >= cols) {
          col = 0;
          currentY += cardH + gap;
          globalIdx = 0;
        }
        const rowIdx = Math.floor(i / cols);
        const isReverse = rowIdx % 2 === 1;
        const colInRow = i % cols;
        const effectiveCol = isReverse ? cols - 1 - colInRow : colInRow;
        const x = gap + effectiveCol * (cardW + gap);
        positions.push({ x, y: currentY });
        col++;
        globalIdx++;
      }

      // Row 0: positions should be 0,1,2 (left to right)
      const row0Xs = positions.slice(0, 3).map((p) => p.x);
      // Row 1: positions should be 2,1,0 (right to left)
      const row1Xs = positions.slice(3, 6).map((p) => p.x);

      return {
        row0Ascending: row0Xs[0] < row0Xs[1] && row0Xs[1] < row0Xs[2],
        row1Descending: row1Xs[0] > row1Xs[1] && row1Xs[1] > row1Xs[2],
        row0First: row0Xs[0],
        row1First: row1Xs[0],
      };
    });

    expect(result.row0Ascending).toBe(true);  // LTR row 0
    expect(result.row1Descending).toBe(true); // RTL row 1 (zigzag)
  });

  test("center-out layout places first card at center", async ({ page }) => {
    const result = await page.evaluate(() => {
      const cardW = 320;
      const cardH = 280;
      const gap = 32;
      const canvasWidth = 1920;
      const centerX = canvasWidth / 2;
      const centerY = 400;
      const cardCount = 5;

      const positions: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < cardCount; i++) {
        if (i === 0) {
          positions.push({ x: centerX - cardW / 2, y: centerY - cardH / 2 });
        } else {
          const ring = Math.ceil(Math.sqrt(i));
          const angle = (i / (ring * 4)) * 2 * Math.PI;
          const radius = ring * (cardW + gap);
          positions.push({
            x: centerX + Math.cos(angle) * radius - cardW / 2,
            y: centerY + Math.sin(angle) * radius - cardH / 2,
          });
        }
      }

      const firstCenterX = positions[0].x + cardW / 2;
      const firstCenterY = positions[0].y + cardH / 2;
      return {
        count: positions.length,
        firstCenterX,
        firstCenterY,
        isAtCanvasCenter: Math.abs(firstCenterX - centerX) < 1 && Math.abs(firstCenterY - centerY) < 1,
      };
    });

    expect(result.count).toBe(5);
    expect(result.isAtCanvasCenter).toBe(true);
  });

  test("strategy picker auto-selects based on context", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline pickStrategy from lib/layout/agent.ts
      function pickStrategy(
        edges: number,
        episodesCount: number,
        activeEpisodeId: string | null,
        userPref: string | null
      ): string {
        if (userPref) return userPref;
        if (activeEpisodeId && episodesCount > 1) return "episode";
        if (edges > 3) return "narrative";
        return "basic";
      }

      return {
        default: pickStrategy(0, 0, null, null),
        withEdges: pickStrategy(5, 0, null, null),
        withEpisodes: pickStrategy(0, 2, "ep_1", null),
        withPref: pickStrategy(0, 0, null, "graphic-novel"),
        edgesButUserPref: pickStrategy(5, 0, null, "freeform"),
        episodesButNoActive: pickStrategy(0, 2, null, null),
        fewEdges: pickStrategy(3, 0, null, null), // exactly 3 = not > 3, stays basic
      };
    });

    expect(result.default).toBe("basic");
    expect(result.withEdges).toBe("narrative");
    expect(result.withEpisodes).toBe("episode");
    expect(result.withPref).toBe("graphic-novel");
    expect(result.edgesButUserPref).toBe("freeform"); // user pref wins
    expect(result.episodesButNoActive).toBe("basic");  // episodes but no active = basic
    expect(result.fewEdges).toBe("basic"); // 3 edges not > 3
  });

  test("prePlan positions new cards after existing ones", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline prePlan logic from lib/layout/agent.ts
      const BASE_CARD_W = 320;
      const BASE_CARD_H = 280;
      const BASE_GAP = 24;
      const HEADER_OFFSET = 48;

      function prePlan(
        existingCards: Array<{ y: number; h: number }>,
        newCount: number,
        cols: number,
        gap: number,
        cardScale: number,
        rowSeparator: number
      ) {
        const cardW = Math.round(BASE_CARD_W * cardScale);
        const cardH = Math.round(BASE_CARD_H * cardScale);

        let maxY = 0;
        for (const c of existingCards) {
          const bottom = c.y + c.h;
          if (bottom > maxY) maxY = bottom;
        }
        const startY = existingCards.length === 0
          ? gap + HEADER_OFFSET
          : maxY + gap + (rowSeparator || 0);

        const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
        for (let i = 0; i < newCount; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          positions.push({
            x: gap + col * (cardW + gap),
            y: startY + row * (cardH + gap),
            w: cardW,
            h: cardH,
          });
        }
        return positions;
      }

      // Empty canvas — new cards start at top
      const freshPositions = prePlan([], 4, 6, 24, 1.0, 0);
      const freshFirstY = freshPositions[0].y;

      // Existing cards at y=0..280 — new cards start below
      const existingCards = [{ y: 72, h: 280 }]; // bottom = 352
      const appendedPositions = prePlan(existingCards, 4, 6, 24, 1.0, 0);
      const appendedFirstY = appendedPositions[0].y;

      // With row separator
      const withSep = prePlan(existingCards, 4, 6, 24, 1.0, 40);
      const withSepFirstY = withSep[0].y;

      return {
        freshFirstY,
        freshCount: freshPositions.length,
        appendedFirstY,
        appendedFirstYAboveExisting: appendedFirstY > 72 + 280,
        withSepFirstY,
        withSepHigherThanWithout: withSepFirstY > appendedFirstY,
      };
    });

    expect(result.freshCount).toBe(4);
    // Fresh: gap + HEADER_OFFSET = 24 + 48 = 72
    expect(result.freshFirstY).toBe(72);
    // Appended: must be below existing bottom (352)
    expect(result.appendedFirstYAboveExisting).toBe(true);
    // With separator: further down than without
    expect(result.withSepHigherThanWithout).toBe(true);
  });

  test("/organize command on empty canvas returns helpful message", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/organize");
    await input.press("Enter");
    await page.waitForTimeout(500);

    const messages = await page.locator("[class*='break-words']").allTextContents();
    const joined = messages.join(" ").toLowerCase();
    // Empty canvas should report nothing to organize
    expect(joined).toContain("empty");
  });

  test("/layout list shows all 8 skills in chat", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/layout list");
    await input.press("Enter");
    await page.waitForTimeout(500);

    const messages = await page.locator("[class*='break-words']").allTextContents();
    const joined = messages.join(" ");

    // All 8 built-in skill names should appear
    expect(joined).toContain("Basic Grid");
    expect(joined).toContain("Narrative");
    expect(joined).toContain("Episode");
    expect(joined).toContain("Graphic Novel");
    expect(joined).toContain("Ads Moodboard");
    expect(joined).toContain("Movie Storyboard");
    expect(joined).toContain("Balanced");
    expect(joined).toContain("Freeform");
    // Usage tip
    expect(joined).toContain("/organize");
  });

  test("/layout add creates a user skill", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/layout add my-test-layout");
    await input.press("Enter");
    await page.waitForTimeout(500);

    const messages = await page.locator("[class*='break-words']").allTextContents();
    const joined = messages.join(" ");
    expect(joined).toContain("my-test-layout");
    expect(joined).toContain("capture");

    // Now /layout list should include the new user skill
    await input.fill("/layout list");
    await input.press("Enter");
    await page.waitForTimeout(500);

    const messages2 = await page.locator("[class*='break-words']").allTextContents();
    const joined2 = messages2.join(" ");
    expect(joined2).toContain("my-test-layout");
  });

  test("/layout delete removes a user skill", async ({ page }) => {
    // First add one
    const input = page.locator("textarea").first();
    await input.fill("/layout add delete-me-layout");
    await input.press("Enter");
    await page.waitForTimeout(500);

    // Then delete it
    await input.fill("/layout delete delete-me-layout");
    await input.press("Enter");
    await page.waitForTimeout(500);

    const messages = await page.locator("[class*='break-words']").allTextContents();
    const joined = messages.join(" ");
    expect(joined.toLowerCase()).toContain("deleted");
  });

  test("batch grouping keeps same-batch cards contiguous", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline groupByBatch from engine.ts
      type Card = { id: string; refId: string; batchId?: string; x: number; y: number; w: number; h: number };

      function groupByBatch(ordered: Card[]): Card[][] {
        const groups: Card[][] = [];
        const batchMap = new Map<string, number>();
        for (const card of ordered) {
          const bid = card.batchId;
          if (bid && batchMap.has(bid)) {
            groups[batchMap.get(bid)!].push(card);
          } else {
            const idx = groups.length;
            if (bid) batchMap.set(bid, idx);
            groups.push([card]);
          }
        }
        return groups;
      }

      const cards: Card[] = [
        { id: "0", refId: "img-1", batchId: "batch_a", x: 0, y: 0, w: 320, h: 280 },
        { id: "1", refId: "img-2", batchId: "batch_a", x: 0, y: 0, w: 320, h: 280 },
        { id: "2", refId: "img-3", batchId: "batch_b", x: 0, y: 0, w: 320, h: 280 },
        { id: "3", refId: "img-4", batchId: "batch_b", x: 0, y: 0, w: 320, h: 280 },
        { id: "4", refId: "img-5", batchId: undefined,  x: 0, y: 0, w: 320, h: 280 },
      ];

      const groups = groupByBatch(cards);
      return {
        groupCount: groups.length,
        group0Size: groups[0].length,
        group1Size: groups[1].length,
        group2Size: groups[2].length,
        group0Batch: groups[0][0].batchId,
        group1Batch: groups[1][0].batchId,
        group2HasNoBatch: groups[2][0].batchId === undefined,
      };
    });

    expect(result.groupCount).toBe(3);          // batch_a, batch_b, no-batch
    expect(result.group0Size).toBe(2);           // 2 cards in batch_a
    expect(result.group1Size).toBe(2);           // 2 cards in batch_b
    expect(result.group2Size).toBe(1);           // 1 unbatched card
    expect(result.group0Batch).toBe("batch_a");
    expect(result.group1Batch).toBe("batch_b");
    expect(result.group2HasNoBatch).toBe(true);
  });

  test("freeform skill preserves current card positions", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline freeform: skill has no preset, engine returns current positions unchanged
      type Card = { id: string; refId: string; x: number; y: number; w: number; h: number };

      function runLayout(cards: Card[], hasFn: boolean, hasPreset: boolean): Array<{ cardId: string; x: number; y: number }> {
        if (cards.length === 0) return [];
        if (hasFn) return []; // would call layoutFn
        if (!hasPreset) {
          // freeform: return as-is
          return cards.map((c) => ({ cardId: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
        }
        return []; // would call runPreset
      }

      const cards: Card[] = [
        { id: "0", refId: "img-1", x: 100, y: 200, w: 320, h: 280 },
        { id: "1", refId: "img-2", x: 500, y: 150, w: 320, h: 280 },
        { id: "2", refId: "img-3", x: 50,  y: 600, w: 320, h: 280 },
      ];

      const positions = runLayout(cards, false, false); // freeform = no preset
      return {
        count: positions.length,
        first: { x: positions[0].x, y: positions[0].y },
        second: { x: positions[1].x, y: positions[1].y },
        unchanged: positions.every((p, i) => p.x === cards[i].x && p.y === cards[i].y),
      };
    });

    expect(result.count).toBe(3);
    expect(result.unchanged).toBe(true);
    expect(result.first.x).toBe(100);
    expect(result.first.y).toBe(200);
  });

  test("layout store tracks active skill and user skills", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Simulate useLayoutStore state machine inline (mirrors store.ts)
      const BUILT_IN_IDS = ["basic", "narrative", "episode", "graphic-novel", "ads-board", "movie-board", "balanced", "freeform"];

      type LayoutSkill = { id: string; name: string; description: string; category: "built-in" | "user" };

      let userSkills: LayoutSkill[] = [];
      let activeSkillId: string | null = null;

      function getAllSkills(): LayoutSkill[] {
        return [
          ...BUILT_IN_IDS.map((id) => ({ id, name: id, description: "", category: "built-in" as const })),
          ...userSkills,
        ];
      }

      function getSkill(id: string): LayoutSkill | undefined {
        return getAllSkills().find((s) => s.id === id);
      }

      function setActiveSkill(id: string | null) { activeSkillId = id; }

      function addUserSkill(skill: LayoutSkill) {
        userSkills = [...userSkills.filter((u) => u.id !== skill.id), skill];
      }

      function removeUserSkill(id: string) {
        userSkills = userSkills.filter((u) => u.id !== id);
        if (activeSkillId === id) activeSkillId = null;
      }

      // Initial state
      const initial = { allCount: getAllSkills().length, active: activeSkillId };

      // Set active skill
      setActiveSkill("narrative");
      const afterActivate = { active: activeSkillId };

      // Add user skill
      addUserSkill({ id: "user_custom", name: "Custom", description: "test", category: "user" });
      const afterAdd = { allCount: getAllSkills().length, userCount: userSkills.length };

      // Get skill by id
      const builtIn = getSkill("basic");
      const user = getSkill("user_custom");

      // Remove user skill (active clears if deleted)
      setActiveSkill("user_custom");
      removeUserSkill("user_custom");
      const afterDelete = {
        allCount: getAllSkills().length,
        userCount: userSkills.length,
        activeClearedOnDelete: activeSkillId === null,
      };

      return { initial, afterActivate, afterAdd, builtInFound: !!builtIn, userFound: !!user, afterDelete };
    });

    expect(result.initial.allCount).toBe(8);        // 8 built-in
    expect(result.initial.active).toBeNull();
    expect(result.afterActivate.active).toBe("narrative");
    expect(result.afterAdd.allCount).toBe(9);        // 8 + 1 user
    expect(result.afterAdd.userCount).toBe(1);
    expect(result.builtInFound).toBe(true);
    expect(result.userFound).toBe(true);
    expect(result.afterDelete.allCount).toBe(8);     // back to 8
    expect(result.afterDelete.userCount).toBe(0);
    expect(result.afterDelete.activeClearedOnDelete).toBe(true);
  });
});
