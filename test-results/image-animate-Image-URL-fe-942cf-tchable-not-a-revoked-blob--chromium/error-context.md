# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: image-animate.spec.ts >> Image URL fetchability for animate >> generated image URL is fetchable (not a revoked blob)
- Location: tests/e2e/image-animate.spec.ts:9:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForTimeout: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]: Storyboard
    - generic [ref=e5]:
      - button "−" [ref=e6]
      - generic [ref=e7]: 100%
      - button "+" [ref=e8]
      - button "Fit" [ref=e9]
      - button "Train" [ref=e11]
      - button "⚙" [ref=e12]
  - generic [ref=e14]:
    - img
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: image
        - generic "Click to copy \"Red circle\" to chat" [ref=e18] [cursor=pointer]: Red circle
        - generic "Click to copy \"img-1\" to chat" [ref=e19] [cursor=pointer]: img-1
        - generic [ref=e20]:
          - button "📌" [ref=e21]
          - button "—" [ref=e22]
          - button "×" [ref=e23]
      - generic [ref=e25]:
        - generic [ref=e26]: "!"
        - generic [ref=e27]: Authentication failed — check your API key
        - generic [ref=e28]: Right-click for options
  - generic [ref=e31]:
    - generic [ref=e32]:
      - generic [ref=e34]: Agent
      - button "—" [ref=e35]
    - generic [ref=e36]:
      - generic [ref=e37]: Connected — describe what you want to create
      - generic "Click to copy" [ref=e38] [cursor=pointer]: a red circle
      - generic [ref=e39]: "All 1 failed: Authentication failed — check your API key"
      - generic "Click to copy" [ref=e40] [cursor=pointer]: A red circle, coming right up! What's next?
      - generic [ref=e41]: 2.8s — 3,682 tokens (3,641 in / 41 out, 3,311 cached)
    - generic [ref=e42]:
      - generic [ref=e43]:
        - button "+ Generate" [ref=e44]:
          - generic [ref=e45]: +
          - text: Generate
        - button "✨ Restyle" [ref=e46]:
          - generic [ref=e47]: ✨
          - text: Restyle
        - button "▶ Animate" [ref=e48]:
          - generic [ref=e49]: ▶
          - text: Animate
        - button "📡 LV2V" [ref=e50]:
          - generic [ref=e51]: 📡
          - text: LV2V
        - button "🧠 Train" [ref=e52]:
          - generic [ref=e53]: 🧠
          - text: Train
      - generic [ref=e54]:
        - textbox "Create a dragon as image, then animate it..." [active] [ref=e55]
        - button "Expand editor for long prompts" [ref=e56]:
          - img [ref=e57]
  - generic [ref=e60]:
    - generic [ref=e61]: CAM
    - generic [ref=e62]: Camera
    - button "Start" [ref=e63]
  - button "Open Next.js Dev Tools" [ref=e69] [cursor=pointer]:
    - img [ref=e70]
  - alert [ref=e73]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Image URL fetchability for animate", () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto("http://localhost:3000");
  6  |     await page.waitForSelector("textarea", { timeout: 10000 });
  7  |   });
  8  | 
  9  |   test("generated image URL is fetchable (not a revoked blob)", async ({ page }) => {
  10 |     // Generate a simple image
  11 |     const input = page.locator("textarea").first();
  12 |     await input.fill("a red circle");
  13 |     await input.press("Enter");
  14 | 
  15 |     // Wait for generation — look for a card with an image
  16 |     let hasImage = false;
  17 |     for (let i = 0; i < 20; i++) {
  18 |       hasImage = await page.evaluate(() => {
  19 |         const imgs = document.querySelectorAll("[data-card] img") as NodeListOf<HTMLImageElement>;
  20 |         return Array.from(imgs).some((img) => img.naturalWidth > 0 && img.src.startsWith("http"));
  21 |       });
  22 |       if (hasImage) break;
> 23 |       await page.waitForTimeout(2000);
     |                  ^ Error: page.waitForTimeout: Test timeout of 30000ms exceeded.
  24 |     }
  25 | 
  26 |     if (!hasImage) {
  27 |       test.skip(true, "No image generated — SDK may be unavailable");
  28 |       return;
  29 |     }
  30 | 
  31 |     // Verify the image URL is fetchable
  32 |     const result = await page.evaluate(async () => {
  33 |       const imgs = document.querySelectorAll("[data-card] img") as NodeListOf<HTMLImageElement>;
  34 |       for (const img of imgs) {
  35 |         if (img.src.startsWith("http") && img.naturalWidth > 0) {
  36 |           try {
  37 |             const resp = await fetch(img.src);
  38 |             return { ok: resp.ok, status: resp.status, urlPrefix: img.src.slice(0, 40) };
  39 |           } catch (e) {
  40 |             return { ok: false, error: (e as Error).message, urlPrefix: img.src.slice(0, 40) };
  41 |           }
  42 |         }
  43 |       }
  44 |       return { ok: false, error: "no http image found" };
  45 |     });
  46 | 
  47 |     console.log("Fetch result:", JSON.stringify(result));
  48 |     // The image should be fetchable (it's an HTTP URL from fal CDN)
  49 |     // Note: cross-origin fetch may fail but that's OK — fal.ai fetches server-side
  50 |     // The key assertion: it's NOT a blob: URL (which would be revoked)
  51 |     expect(result.urlPrefix).toMatch(/^http/);
  52 |   });
  53 | 
  54 |   test("resizeImageForModel handles cross-origin images", async ({ page }) => {
  55 |     // Test that the resize utility works in the browser
  56 |     const result = await page.evaluate(async () => {
  57 |       // Create a test canvas image (simulates a generated image)
  58 |       const canvas = document.createElement("canvas");
  59 |       canvas.width = 100;
  60 |       canvas.height = 100;
  61 |       const ctx = canvas.getContext("2d")!;
  62 |       ctx.fillStyle = "red";
  63 |       ctx.fillRect(0, 0, 100, 100);
  64 |       const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  65 | 
  66 |       // Import and test resizeImageForModel
  67 |       try {
  68 |         const { resizeImageForModel } = await import("@livepeer/creative-kit");
  69 |         const result = await resizeImageForModel(dataUrl);
  70 |         return {
  71 |           ok: true,
  72 |           inputType: "data:",
  73 |           outputType: result.slice(0, 10),
  74 |           isHttp: result.startsWith("http"),
  75 |           isData: result.startsWith("data:"),
  76 |         };
  77 |       } catch (e) {
  78 |         return { ok: false, error: (e as Error).message };
  79 |       }
  80 |     });
  81 | 
  82 |     console.log("Resize result:", JSON.stringify(result));
  83 |     // Should either upload to GCS (http) or return data URL (fallback)
  84 |     expect(result.ok).toBe(true);
  85 |   });
  86 | });
  87 | 
```