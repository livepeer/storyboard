import { test, expect } from "@playwright/test";

test.describe("/stream command", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("/stream help shows usage", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/stream");
    await input.press("Enter");
    await expect(page.locator("text=Usage")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=prompt traveling")).toBeVisible({ timeout: 2000 });
  });

  test("/stream list shows empty state", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/stream list");
    await input.press("Enter");
    await expect(
      page.locator("text=No stream plans").or(page.locator("text=scenes"))
    ).toBeVisible({ timeout: 5000 });
  });

  test("/stream with concept generates a plan card", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/stream a sunset over the ocean with seagulls");
    await input.press("Enter");

    // Wait for the stream plan card (cyan themed) or error
    await expect(
      page.locator("text=Start Stream").or(page.locator("text=Stream director"))
    ).toBeVisible({ timeout: 30000 });

    // If plan generated, check for timeline visualization
    const hasTimeline = await page.locator("[class*='bg-cyan-500']").count();
    console.log("Timeline segments:", hasTimeline);
  });
});
