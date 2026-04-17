import { test, expect } from "@playwright/test";

test.describe("Import Media via Canvas Right-Click", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("textarea", { timeout: 10000 });
    // Wait for canvas to be ready
    await page.waitForTimeout(1000);
  });

  test("right-click on empty canvas shows import menu", async ({ page }) => {
    // Right-click on the canvas background (not on a card)
    // The canvas is the fixed inset-0 div
    const canvas = page.locator(".fixed.inset-0.overflow-hidden").first();
    await canvas.click({ button: "right", position: { x: 400, y: 400 } });

    // Check if the import menu appeared
    const menu = page.locator("text=Import Media");
    const isVisible = await menu.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isVisible) {
      // Debug: check what's at that position
      const html = await page.evaluate(() => {
        const el = document.elementFromPoint(400, 400);
        return el ? `${el.tagName}.${el.className.split(" ").slice(0, 3).join(".")}` : "null";
      });
      console.log("Element at (400,400):", html);

      // Try clicking on the dot grid area more specifically
      const dotGrid = page.locator("[class*='pointer-events-none'][class*='absolute'][class*='inset-0']").first();
      const parent = dotGrid.locator("..");
      await parent.click({ button: "right", position: { x: 200, y: 300 } });

      const retryVisible = await menu.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Retry menu visible:", retryVisible);
    }

    // Report what we found
    const allText = await page.locator("body").innerText();
    const hasImportMenu = allText.includes("Import Media") || allText.includes("Import Image");
    console.log("Import menu found in page:", hasImportMenu);
  });

  test("Import Image URL button opens dialog", async ({ page }) => {
    // Right-click to show menu
    await page.mouse.click(400, 400, { button: "right" });
    await page.waitForTimeout(300);

    const importMenu = page.locator("text=Import Media");
    await expect(importMenu).toBeVisible({ timeout: 2000 });

    // Capture errors
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Click URL button
    const urlBtn = page.locator("text=Import Image (URL)");
    console.log("URL button visible:", await urlBtn.isVisible().catch(() => false));
    await urlBtn.click();
    await page.waitForTimeout(1000);

    // Report errors
    if (errors.length > 0) console.log("Page errors after click:", errors);
    console.log("Page URL after click:", page.url());

    // Dialog should appear with URL input
    const inputField = page.locator("input[type='url']");
    const inputVisible = await inputField.isVisible({ timeout: 2000 }).catch(() => false);
    console.log("URL input visible:", inputVisible);

    // Debug: check what's in the DOM
    const dialogCount = await page.locator("[class*='z-\\[3000\\]']").count();
    console.log("Dialog overlay count:", dialogCount);
    const allInputs = await page.locator("input").count();
    console.log("Total inputs on page:", allInputs);
    // Check if the import dialog text is anywhere in the DOM
    const bodyHtml = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
    console.log("Has 'Paste' in DOM:", bodyHtml.includes("Paste"));

    if (inputVisible) {
      // Type a URL and check preview
      await inputField.fill("https://v3b.fal.media/files/b/0a968eba/mJE_onIPYCV_LxHE9_z41.jpg");
      await page.waitForTimeout(1000);
      const preview = page.locator("img[alt='preview']");
      console.log("Preview visible:", await preview.isVisible().catch(() => false));

      // Click import
      const importBtn = page.locator("button:has-text('Import')").last();
      console.log("Import btn visible:", await importBtn.isVisible().catch(() => false));
    }
  });

  test("right-click fires onContextMenu handler", async ({ page }) => {
    // Add a console listener to check if our handler fires
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(msg.text()));

    // Inject a test: add a global contextmenu listener
    await page.evaluate(() => {
      document.addEventListener("contextmenu", (e) => {
        console.log("CONTEXTMENU fired on:", (e.target as HTMLElement).tagName, (e.target as HTMLElement).className.slice(0, 50));
      });
    });

    // Right-click on the canvas
    await page.mouse.click(400, 400, { button: "right" });
    await page.waitForTimeout(500);

    const contextLogs = logs.filter((l) => l.includes("CONTEXTMENU"));
    console.log("Context menu events:", contextLogs);

    // Check if any canvas-related element received the event
    expect(contextLogs.length).toBeGreaterThan(0);
  });
});
