/**
 * Hierarchy — E2E tests for Story → Epic → Episode → Card management.
 */
import { test, expect } from "@playwright/test";

test.describe("Content Hierarchy", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("sb_walkthrough_done", "1");
      localStorage.setItem("sdk_api_key", "test");
    });
    await page.reload();
    await page.waitForTimeout(500);
  });

  test("page loads without errors after hierarchy store migration", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForTimeout(1000);
    // No migration errors
    expect(errors.filter((e) => e.includes("migrate"))).toHaveLength(0);
  });

  test("/find command returns results", async ({ page }) => {
    // Add a card via store
    await page.evaluate(() => {
      const store = (window as any).__canvas;
      if (store) store.getState().addCard({ type: "image", title: "test-find-card", refId: "find-1" });
    });

    const textarea = page.locator("textarea").first();
    await textarea.fill("/find test-find");
    await textarea.press("Enter");
    await page.waitForTimeout(1000);

    // Should show a result
    const result = page.locator("text=Card:");
    await expect(result).toBeVisible({ timeout: 5000 });
  });

  test("/epic list shows message when no epics", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    await textarea.fill("/epic list");
    await textarea.press("Enter");
    await page.waitForTimeout(1000);

    const msg = page.locator("text=No epics");
    await expect(msg).toBeVisible({ timeout: 5000 });
  });

  test("SelectionBar appears with 2+ cards selected", async ({ page }) => {
    // Add 2 cards
    await page.evaluate(() => {
      const store = (window as any).__canvas;
      if (store) {
        store.getState().addCard({ type: "image", title: "h-card-1", refId: "h-1" });
        store.getState().addCard({ type: "image", title: "h-card-2", refId: "h-2" });
        const ids = store.getState().cards.map((c: any) => c.id);
        store.getState().selectCards(ids);
      }
    });

    await page.waitForTimeout(500);
    const bar = page.locator("text=selected");
    await expect(bar).toBeVisible({ timeout: 3000 });
  });
});
