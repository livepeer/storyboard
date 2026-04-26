# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ux-enhancement.spec.ts >> Tier 2: Critical UX >> generating card shows elapsed timer
- Location: tests/e2e/ux-enhancement.spec.ts:96:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Generating')
Expected: visible
Timeout: 3000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 3000ms
  - waiting for locator('text=Generating')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]: Storyboard
    - generic [ref=e5]:
      - button "−" [ref=e6]
      - generic [ref=e7]: 100%
      - button "+" [ref=e8]
      - button "Fit" [ref=e9]
      - button "Train" [ref=e11]
      - button "Export" [ref=e12]
      - link "API" [ref=e13] [cursor=pointer]:
        - /url: /docs
      - button "?" [ref=e14]
      - button "⚙" [ref=e15]
  - generic [ref=e17]:
    - img
    - generic [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]: image
        - generic "Click to copy · Double-click to rename" [ref=e21] [cursor=pointer]: test-gen
        - generic "Click to copy \"gen-1\" to chat" [ref=e22] [cursor=pointer]: gen-1
        - generic [ref=e23]:
          - button "📌" [ref=e24]
          - button "—" [ref=e25]
          - button "×" [ref=e26]
      - generic [ref=e30]: 4s · ~4s left
  - generic [ref=e35]:
    - generic [ref=e36]:
      - generic [ref=e38]: Agent
      - button "—" [ref=e39]
    - generic [ref=e40]:
      - generic [ref=e41]: Connected — describe what you want to create
      - generic [ref=e42]:
        - generic [ref=e43]: "Try one of these:"
        - generic [ref=e44]:
          - button "a sunset painting" [ref=e45]
          - button "compare 4 models" [ref=e46]
          - button "/film a cat adventure" [ref=e47]
          - button "/story space journey" [ref=e48]
    - generic [ref=e49]:
      - generic [ref=e51]:
        - button "+ Generate" [ref=e52]:
          - generic [ref=e53]: +
          - text: Generate
        - button "✨ Restyle" [ref=e54]:
          - generic [ref=e55]: ✨
          - text: Restyle
        - button "▶ Animate" [ref=e56]:
          - generic [ref=e57]: ▶
          - text: Animate
        - button "📡 LV2V" [ref=e58]:
          - generic [ref=e59]: 📡
          - text: LV2V
        - button "🧠 Train" [ref=e60]:
          - generic [ref=e61]: 🧠
          - text: Train
      - generic [ref=e62]:
        - textbox "Create a dragon as image, then animate it..." [ref=e63]
        - button "Voice input" [ref=e64]:
          - img [ref=e65]
        - button "Expand editor for long prompts" [ref=e68]:
          - img [ref=e69]
  - generic [ref=e72]:
    - generic [ref=e73]: CAM
    - generic [ref=e74]: Camera
    - button "Start" [ref=e75]
  - generic [ref=e77]:
    - generic [ref=e82]: 🖱️
    - heading "3. Explore and iterate" [level=3] [ref=e83]
    - paragraph [ref=e84]: "Right-click any card for powerful options: restyle, animate, variations, face lock. Double-click images to zoom in. Press ? for all shortcuts."
    - paragraph [ref=e85]: This step will auto-advance when completed
    - generic [ref=e86]:
      - button "Skip" [ref=e87]
      - button "Get started" [ref=e88]
  - button "Open Next.js Dev Tools" [ref=e94] [cursor=pointer]:
    - img [ref=e95]
  - alert [ref=e98]
```

# Test source

```ts
  8   |  * - Persist: does my work survive refresh?
  9   |  */
  10  | import { test, expect } from "@playwright/test";
  11  | 
  12  | test.describe("Tier 1: Existential UX", () => {
  13  |   test.beforeEach(async ({ page }) => {
  14  |     // Clear localStorage to simulate first visit
  15  |     await page.goto("/");
  16  |     await page.evaluate(() => {
  17  |       localStorage.removeItem("storyboard_canvas");
  18  |       localStorage.removeItem("sdk_api_key");
  19  |     });
  20  |     await page.reload();
  21  |     await page.waitForTimeout(500);
  22  |   });
  23  | 
  24  |   test("first visit shows starter prompt chips", async ({ page }) => {
  25  |     // User should see example prompts to try
  26  |     const chips = page.locator("button", { hasText: "a sunset painting" });
  27  |     await expect(chips).toBeVisible({ timeout: 5000 });
  28  |   });
  29  | 
  30  |   test("first visit shows API key warning when not set", async ({ page }) => {
  31  |     const warning = page.locator("text=Setup needed");
  32  |     await expect(warning).toBeVisible({ timeout: 5000 });
  33  |   });
  34  | 
  35  |   test("canvas persists cards across refresh", async ({ page }) => {
  36  |     // Set a fake API key to suppress warning
  37  |     await page.evaluate(() => localStorage.setItem("sdk_api_key", "test"));
  38  |     await page.reload();
  39  |     await page.waitForTimeout(500);
  40  | 
  41  |     // Add a card via the store directly
  42  |     await page.evaluate(() => {
  43  |       const store = (window as any).__canvas;
  44  |       if (store) {
  45  |         store.getState().addCard({ type: "image", title: "test-persist", refId: "persist-1" });
  46  |       }
  47  |     });
  48  | 
  49  |     // Verify card exists
  50  |     const cardsBefore = await page.evaluate(() => {
  51  |       const store = (window as any).__canvas;
  52  |       return store?.getState().cards.length || 0;
  53  |     });
  54  |     expect(cardsBefore).toBeGreaterThan(0);
  55  | 
  56  |     // Reload the page
  57  |     await page.reload();
  58  |     await page.waitForTimeout(1000);
  59  | 
  60  |     // Card should still exist
  61  |     const cardsAfter = await page.evaluate(() => {
  62  |       const store = (window as any).__canvas;
  63  |       return store?.getState().cards.length || 0;
  64  |     });
  65  |     expect(cardsAfter).toBeGreaterThan(0);
  66  |   });
  67  | 
  68  |   test("image card shows zoom-in cursor (lightbox ready)", async ({ page }) => {
  69  |     await page.evaluate(() => localStorage.setItem("sdk_api_key", "test"));
  70  |     await page.reload();
  71  |     await page.waitForTimeout(500);
  72  | 
  73  |     // Add a card with a URL
  74  |     await page.evaluate(() => {
  75  |       const store = (window as any).__canvas;
  76  |       if (store) {
  77  |         const card = store.getState().addCard({ type: "image", title: "test-img", refId: "img-test" });
  78  |         store.getState().updateCard(card.id, { url: "https://placehold.co/400x300" });
  79  |       }
  80  |     });
  81  |     await page.waitForTimeout(500);
  82  | 
  83  |     // Check that the image has cursor-zoom-in class
  84  |     const img = page.locator("img.cursor-zoom-in");
  85  |     await expect(img).toBeVisible({ timeout: 3000 });
  86  |   });
  87  | });
  88  | 
  89  | test.describe("Tier 2: Critical UX", () => {
  90  |   test.beforeEach(async ({ page }) => {
  91  |     await page.goto("/");
  92  |     await page.evaluate(() => localStorage.setItem("sdk_api_key", "test"));
  93  |     await page.waitForTimeout(500);
  94  |   });
  95  | 
  96  |   test("generating card shows elapsed timer", async ({ page }) => {
  97  |     // Add a card without URL (generating state)
  98  |     await page.evaluate(() => {
  99  |       const store = (window as any).__canvas;
  100 |       if (store) {
  101 |         store.getState().addCard({ type: "image", title: "test-gen", refId: "gen-1" });
  102 |       }
  103 |     });
  104 | 
  105 |     // Should show "Generating... 0s" then increment
  106 |     await page.waitForTimeout(1500);
  107 |     const spinner = page.locator("text=Generating");
> 108 |     await expect(spinner).toBeVisible({ timeout: 3000 });
      |                           ^ Error: expect(locator).toBeVisible() failed
  109 |     // Should show elapsed time (at least "1s")
  110 |     const text = await spinner.textContent();
  111 |     expect(text).toMatch(/\d+s/);
  112 |   });
  113 | 
  114 |   test("error card shows retry button when prompt exists", async ({ page }) => {
  115 |     // Add a card with error + prompt + capability
  116 |     await page.evaluate(() => {
  117 |       const store = (window as any).__canvas;
  118 |       if (store) {
  119 |         const card = store.getState().addCard({ type: "image", title: "test-err", refId: "err-1" });
  120 |         store.getState().updateCard(card.id, {
  121 |           error: "Test error",
  122 |           prompt: "a sunset",
  123 |           capability: "flux-dev",
  124 |         });
  125 |       }
  126 |     });
  127 | 
  128 |     const retryBtn = page.locator("button", { hasText: "Retry" });
  129 |     await expect(retryBtn).toBeVisible({ timeout: 3000 });
  130 |   });
  131 | });
  132 | 
  133 | test.describe("Tier 3: Discoverability", () => {
  134 |   test("keyboard shortcut ? shows shortcuts modal", async ({ page }) => {
  135 |     await page.goto("/");
  136 |     await page.waitForTimeout(500);
  137 | 
  138 |     // Press ? key (not in an input)
  139 |     await page.keyboard.press("?");
  140 | 
  141 |     const modal = page.locator("text=Keyboard Shortcuts");
  142 |     await expect(modal).toBeVisible({ timeout: 3000 });
  143 | 
  144 |     // Shows expected shortcuts
  145 |     await expect(page.locator("text=Undo")).toBeVisible();
  146 |     await expect(page.locator("text=Redo")).toBeVisible();
  147 |     await expect(page.locator("text=Fullscreen view")).toBeVisible();
  148 |   });
  149 | });
  150 | 
  151 | test.describe("Tier 4: Polish", () => {
  152 |   test("page loads without errors", async ({ page }) => {
  153 |     await page.goto("/");
  154 |     await page.waitForTimeout(1000);
  155 | 
  156 |     // No JavaScript errors
  157 |     const errors: string[] = [];
  158 |     page.on("pageerror", (err) => errors.push(err.message));
  159 | 
  160 |     // Canvas renders
  161 |     const canvas = page.locator("[data-testid='canvas']").or(page.locator("canvas")).or(page.locator(".dot-grid"));
  162 |     // Chat panel renders
  163 |     const chat = page.locator("textarea");
  164 |     await expect(chat).toBeVisible({ timeout: 5000 });
  165 |   });
  166 | 
  167 |   test("undo/redo works via keyboard", async ({ page }) => {
  168 |     await page.goto("/");
  169 |     await page.evaluate(() => localStorage.setItem("sdk_api_key", "test"));
  170 |     await page.waitForTimeout(500);
  171 | 
  172 |     // Add a card
  173 |     await page.evaluate(() => {
  174 |       const store = (window as any).__canvas;
  175 |       if (store) store.getState().addCard({ type: "image", title: "undo-test", refId: "undo-1" });
  176 |     });
  177 | 
  178 |     const countBefore = await page.evaluate(() => {
  179 |       return (window as any).__canvas?.getState().cards.length || 0;
  180 |     });
  181 |     expect(countBefore).toBe(1);
  182 | 
  183 |     // Cmd+Z to undo (click canvas first to unfocus textarea)
  184 |     await page.click("body", { position: { x: 10, y: 10 } });
  185 |     await page.keyboard.press("Meta+z");
  186 |     await page.waitForTimeout(300);
  187 | 
  188 |     const countAfter = await page.evaluate(() => {
  189 |       return (window as any).__canvas?.getState().cards.length || 0;
  190 |     });
  191 |     expect(countAfter).toBe(0);
  192 |   });
  193 | });
  194 | 
```