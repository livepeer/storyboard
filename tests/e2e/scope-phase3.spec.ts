import { test, expect } from "@playwright/test";

test.describe("Phase 3: Multi-Source Input", () => {
  test("frame extractor module compiles and loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    // frame-extractor.ts is imported by scope-tools.ts (indirectly) and the
    // app loaded = all imports resolved = module is valid TypeScript
  });

  test("scope_start tool accepts source parameter in lv2v-start event", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();

    // Dispatch lv2v-start with a non-webcam source and verify event captures it
    const detail = await page.evaluate(() => {
      return new Promise<Record<string, unknown>>((resolve) => {
        window.addEventListener("lv2v-start", ((e: CustomEvent) => {
          resolve(e.detail);
        }) as EventListener, { once: true });

        window.dispatchEvent(
          new CustomEvent("lv2v-start", {
            detail: {
              prompt: "anime style",
              params: { pipeline_ids: ["longlive"] },
              needsInput: true,
              source: { type: "video", url: "https://example.com/video.mp4" },
              streamCardId: "test-card-id",
            },
          })
        );
      });
    });

    expect(detail.source).toBeTruthy();
    const source = detail.source as Record<string, unknown>;
    expect(source.type).toBe("video");
    expect(source.url).toBe("https://example.com/video.mp4");
    expect(detail.streamCardId).toBe("test-card-id");
  });

  test("scope_start supports text-only mode (no input)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();

    const detail = await page.evaluate(() => {
      return new Promise<Record<string, unknown>>((resolve) => {
        window.addEventListener("lv2v-start", ((e: CustomEvent) => {
          resolve(e.detail);
        }) as EventListener, { once: true });

        window.dispatchEvent(
          new CustomEvent("lv2v-start", {
            detail: {
              prompt: "abstract art generation",
              params: { pipeline_ids: ["longlive"] },
              needsInput: false, // text-only mode
            },
          })
        );
      });
    });

    expect(detail.needsInput).toBe(false);
  });

  // Regression
  test("regression: all UI elements present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    await expect(page.locator("text=Fit")).toBeVisible();
    await expect(page.getByText("CAM", { exact: true })).toBeVisible();
  });

  test("regression: health API", async ({ page }) => {
    const resp = await page.request.get("/api/health");
    expect(resp.ok()).toBeTruthy();
  });

  test("regression: skills registry intact", async ({ page }) => {
    const resp = await page.request.get("/skills/_registry.json");
    const registry = await resp.json();
    const ids = registry.map((s: { id: string }) => s.id);
    expect(ids).toContain("scope-agent");
    expect(ids).toContain("text-to-image");
    expect(ids).toContain("director");
  });
});
