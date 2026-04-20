import { test, expect } from "@playwright/test";

test.describe("Creative Lab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3001");
  });

  test("home page shows mission picker", async ({ page }) => {
    await expect(page.locator("text=Pick a Mission")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=My Dream Pet")).toBeVisible();
    await expect(page.locator("text=Superhero Portrait")).toBeVisible();
    await expect(page.locator("text=Funny Animal")).toBeVisible();
  });

  test("mission cards show difficulty badges", async ({ page }) => {
    await expect(page.locator("text=starter").first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking a mission opens the step guide", async ({ page }) => {
    await page.locator("text=My Dream Pet").click();
    await expect(page.locator("text=Describe your dream pet")).toBeVisible({ timeout: 5000 });
  });

  test("hint button reveals hint text", async ({ page }) => {
    await page.locator("text=My Dream Pet").click();
    await page.locator("text=Need a hint").click();
    await expect(page.locator("text=fluffy dragon")).toBeVisible({ timeout: 2000 });
  });

  test("typing and submitting advances to next step", async ({ page }) => {
    await page.locator("text=My Dream Pet").click();
    const input = page.locator("textarea, input[type='text']").first();
    await input.fill("a sparkly unicorn cat");
    await page.locator("button:has-text('Go')").click();
    await expect(page.locator("text=Make it")).toBeVisible({ timeout: 5000 });
  });

  test("gallery page shows empty state", async ({ page }) => {
    await page.goto("http://localhost:3001/gallery");
    await expect(page.locator("text=Your Gallery is Empty")).toBeVisible({ timeout: 5000 });
  });

  test("header has gallery link", async ({ page }) => {
    await expect(page.locator("text=Gallery")).toBeVisible({ timeout: 5000 });
  });
});
