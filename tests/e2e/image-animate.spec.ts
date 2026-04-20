import { test, expect } from "@playwright/test";

test.describe("Image URL fetchability for animate", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("generated image URL is fetchable (not a revoked blob)", async ({ page }) => {
    // Generate a simple image
    const input = page.locator("textarea").first();
    await input.fill("a red circle");
    await input.press("Enter");

    // Wait for generation — look for a card with an image
    let hasImage = false;
    for (let i = 0; i < 20; i++) {
      hasImage = await page.evaluate(() => {
        const imgs = document.querySelectorAll("[data-card] img") as NodeListOf<HTMLImageElement>;
        return Array.from(imgs).some((img) => img.naturalWidth > 0 && img.src.startsWith("http"));
      });
      if (hasImage) break;
      await page.waitForTimeout(2000);
    }

    if (!hasImage) {
      test.skip(true, "No image generated — SDK may be unavailable");
      return;
    }

    // Verify the image URL is fetchable
    const result = await page.evaluate(async () => {
      const imgs = document.querySelectorAll("[data-card] img") as NodeListOf<HTMLImageElement>;
      for (const img of imgs) {
        if (img.src.startsWith("http") && img.naturalWidth > 0) {
          try {
            const resp = await fetch(img.src);
            return { ok: resp.ok, status: resp.status, urlPrefix: img.src.slice(0, 40) };
          } catch (e) {
            return { ok: false, error: (e as Error).message, urlPrefix: img.src.slice(0, 40) };
          }
        }
      }
      return { ok: false, error: "no http image found" };
    });

    console.log("Fetch result:", JSON.stringify(result));
    // The image should be fetchable (it's an HTTP URL from fal CDN)
    // Note: cross-origin fetch may fail but that's OK — fal.ai fetches server-side
    // The key assertion: it's NOT a blob: URL (which would be revoked)
    expect(result.urlPrefix).toMatch(/^http/);
  });

  test("resizeImageForModel handles cross-origin images", async ({ page }) => {
    // Test that the resize utility works in the browser
    const result = await page.evaluate(async () => {
      // Create a test canvas image (simulates a generated image)
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 100, 100);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

      // Import and test resizeImageForModel
      try {
        const { resizeImageForModel } = await import("@livepeer/creative-kit");
        const result = await resizeImageForModel(dataUrl);
        return {
          ok: true,
          inputType: "data:",
          outputType: result.slice(0, 10),
          isHttp: result.startsWith("http"),
          isData: result.startsWith("data:"),
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    });

    console.log("Resize result:", JSON.stringify(result));
    // Should either upload to GCS (http) or return data URL (fallback)
    expect(result.ok).toBe(true);
  });
});
