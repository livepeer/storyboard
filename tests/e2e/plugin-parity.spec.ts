import { test, expect } from "@playwright/test";

test.describe("Plugin Parity", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("app loads without uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForTimeout(2000);
    // Filter out browser-extension noise (MetaMask, etc.)
    const real = errors.filter(
      (e) => !e.includes("Extension context") && !e.includes("unpermitted intrinsics")
    );
    expect(real).toHaveLength(0);
  });

  test("/story help renders usage text", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/story help");
    await input.press("Enter");
    await expect(page.locator("text=Usage")).toBeVisible({ timeout: 5000 });
  });

  test("/organize on empty canvas shows friendly message", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/organize");
    await input.press("Enter");
    await expect(
      page.locator("text=Canvas is empty").or(page.locator("text=Organized"))
    ).toBeVisible({ timeout: 5000 });
  });

  test("/story list shows empty or populated state", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/story list");
    await input.press("Enter");
    await expect(
      page.locator("text=No stories yet").or(page.locator("text=Your stories"))
    ).toBeVisible({ timeout: 5000 });
  });

  test("slash commands render in blue", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/organize");
    await input.press("Enter");
    // Wait for the message to appear, then check for blue styling
    await page.waitForTimeout(500);
    const userMsgs = page.locator("[class*='bg-blue-500']");
    expect(await userMsgs.count()).toBeGreaterThan(0);
  });

  test("input clears after slash command", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/story help");
    await input.press("Enter");
    await expect(input).toHaveValue("");
  });

  test("/context shows context state", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/context");
    await input.press("Enter");
    // Should show either "No creative context" or the context details
    await expect(
      page.locator("text=No creative context").or(page.locator("text=Style"))
    ).toBeVisible({ timeout: 5000 });
  });
});
