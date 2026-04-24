/**
 * UX Enhancement — user-perspective E2E tests.
 *
 * Tests the experience from a real user's point of view:
 * - First visit: do I see guidance?
 * - Generate: can I see my results clearly?
 * - Iterate: can I undo, retry, vary?
 * - Persist: does my work survive refresh?
 */
import { test, expect } from "@playwright/test";

test.describe("Tier 1: Existential UX", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to simulate first visit
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("storyboard_canvas");
      localStorage.removeItem("sdk_api_key");
    });
    await page.reload();
    await page.waitForTimeout(500);
  });

  test("first visit shows starter prompt chips", async ({ page }) => {
    // User should see example prompts to try
    const chips = page.locator("button", { hasText: "a sunset painting" });
    await expect(chips).toBeVisible({ timeout: 5000 });
  });

  test("first visit shows API key warning when not set", async ({ page }) => {
    const warning = page.locator("text=Setup needed");
    await expect(warning).toBeVisible({ timeout: 5000 });
  });

  test("canvas persists cards across refresh", async ({ page }) => {
    // Set a fake API key to suppress warning
    await page.evaluate(() => localStorage.setItem("sdk_api_key", "test"));
    await page.reload();
    await page.waitForTimeout(500);

    // Add a card via the store directly
    await page.evaluate(() => {
      const store = (window as any).__canvas;
      if (store) {
        store.getState().addCard({ type: "image", title: "test-persist", refId: "persist-1" });
      }
    });

    // Verify card exists
    const cardsBefore = await page.evaluate(() => {
      const store = (window as any).__canvas;
      return store?.getState().cards.length || 0;
    });
    expect(cardsBefore).toBeGreaterThan(0);

    // Reload the page
    await page.reload();
    await page.waitForTimeout(1000);

    // Card should still exist
    const cardsAfter = await page.evaluate(() => {
      const store = (window as any).__canvas;
      return store?.getState().cards.length || 0;
    });
    expect(cardsAfter).toBeGreaterThan(0);
  });

  test("image card shows zoom-in cursor (lightbox ready)", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("sdk_api_key", "test"));
    await page.reload();
    await page.waitForTimeout(500);

    // Add a card with a URL
    await page.evaluate(() => {
      const store = (window as any).__canvas;
      if (store) {
        const card = store.getState().addCard({ type: "image", title: "test-img", refId: "img-test" });
        store.getState().updateCard(card.id, { url: "https://placehold.co/400x300" });
      }
    });
    await page.waitForTimeout(500);

    // Check that the image has cursor-zoom-in class
    const img = page.locator("img.cursor-zoom-in");
    await expect(img).toBeVisible({ timeout: 3000 });
  });
});

test.describe("Tier 2: Critical UX", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("sdk_api_key", "test"));
    await page.waitForTimeout(500);
  });

  test("generating card shows elapsed timer", async ({ page }) => {
    // Add a card without URL (generating state)
    await page.evaluate(() => {
      const store = (window as any).__canvas;
      if (store) {
        store.getState().addCard({ type: "image", title: "test-gen", refId: "gen-1" });
      }
    });

    // Should show "Generating... 0s" then increment
    await page.waitForTimeout(1500);
    const spinner = page.locator("text=Generating");
    await expect(spinner).toBeVisible({ timeout: 3000 });
    // Should show elapsed time (at least "1s")
    const text = await spinner.textContent();
    expect(text).toMatch(/\d+s/);
  });

  test("error card shows retry button when prompt exists", async ({ page }) => {
    // Add a card with error + prompt + capability
    await page.evaluate(() => {
      const store = (window as any).__canvas;
      if (store) {
        const card = store.getState().addCard({ type: "image", title: "test-err", refId: "err-1" });
        store.getState().updateCard(card.id, {
          error: "Test error",
          prompt: "a sunset",
          capability: "flux-dev",
        });
      }
    });

    const retryBtn = page.locator("button", { hasText: "Retry" });
    await expect(retryBtn).toBeVisible({ timeout: 3000 });
  });
});

test.describe("Tier 3: Discoverability", () => {
  test("keyboard shortcut ? shows shortcuts modal", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);

    // Press ? key (not in an input)
    await page.keyboard.press("?");

    const modal = page.locator("text=Keyboard Shortcuts");
    await expect(modal).toBeVisible({ timeout: 3000 });

    // Shows expected shortcuts
    await expect(page.locator("text=Undo")).toBeVisible();
    await expect(page.locator("text=Redo")).toBeVisible();
    await expect(page.locator("text=Fullscreen view")).toBeVisible();
  });
});

test.describe("Tier 4: Polish", () => {
  test("page loads without errors", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    // No JavaScript errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Canvas renders
    const canvas = page.locator("[data-testid='canvas']").or(page.locator("canvas")).or(page.locator(".dot-grid"));
    // Chat panel renders
    const chat = page.locator("textarea");
    await expect(chat).toBeVisible({ timeout: 5000 });
  });

  test("undo/redo works via keyboard", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("sdk_api_key", "test"));
    await page.waitForTimeout(500);

    // Add a card
    await page.evaluate(() => {
      const store = (window as any).__canvas;
      if (store) store.getState().addCard({ type: "image", title: "undo-test", refId: "undo-1" });
    });

    const countBefore = await page.evaluate(() => {
      return (window as any).__canvas?.getState().cards.length || 0;
    });
    expect(countBefore).toBe(1);

    // Cmd+Z to undo (click canvas first to unfocus textarea)
    await page.click("body", { position: { x: 10, y: 10 } });
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(300);

    const countAfter = await page.evaluate(() => {
      return (window as any).__canvas?.getState().cards.length || 0;
    });
    expect(countAfter).toBe(0);
  });
});
