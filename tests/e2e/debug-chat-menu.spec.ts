import { test, expect } from "@playwright/test";

test.describe("Debug: Chat + Context Menu", () => {
  test("Context menu appears on right-click", async ({ page }) => {
    // Mock SDK
    await page.route("**/sdk.daydream.monster/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/inference")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ image_url: "https://picsum.photos/320/240" }),
        });
      } else if (url.includes("/enrich")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            steps: [{ id: "s0", type: "image", prompt: "test", capability: "flux-dev", title: "Test Card" }],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("storyboard_active_agent", "built-in"));
    await page.reload();
    await page.waitForTimeout(2000);

    // Create a card
    const input = page.locator("textarea");
    await input.fill("test");
    await input.press("Enter");
    await page.waitForTimeout(5000);

    // Screenshot before right-click
    await page.screenshot({ path: "/tmp/before-rightclick.png" });

    // Find card and right-click
    // Cards are inside the transform div of the canvas
    const allElements = await page.evaluate(() => {
      // Find elements with the card-like structure
      const cards = document.querySelectorAll('[style*="width: 320"]');
      return Array.from(cards).map(el => ({
        tag: el.tagName,
        rect: el.getBoundingClientRect(),
        classes: el.className?.toString().slice(0, 60),
      }));
    });
    console.log("Elements with width:320:", JSON.stringify(allElements));

    // Try right-clicking in the card area (cards start at x=24, y=72 based on grid)
    // The cards are inside a transformed div, so we need viewport coordinates
    await page.mouse.click(200, 200, { button: "right" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/tmp/after-rightclick.png" });

    // Check for context menu - look for any newly visible element with menu items
    const menuItems = await page.evaluate(() => {
      // Find all elements that look like a context menu
      const allDivs = document.querySelectorAll("div");
      for (const div of allDivs) {
        const style = getComputedStyle(div);
        if (style.position === "fixed" && style.zIndex === "2500") {
          const buttons = div.querySelectorAll("button");
          return {
            found: true,
            display: style.display,
            opacity: style.opacity,
            visibility: style.visibility,
            width: div.offsetWidth,
            height: div.offsetHeight,
            left: style.left,
            top: style.top,
            buttons: Array.from(buttons).map(b => b.textContent?.trim()),
          };
        }
      }
      return { found: false };
    });

    console.log("Context menu state:", JSON.stringify(menuItems, null, 2));

    // Also check: is the ContextMenu component even rendering?
    // It uses state `visible` which defaults to false and only sets to true
    // when it receives the card-context-menu event
    const eventTest = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const handler = (e: Event) => {
          const detail = (e as CustomEvent).detail;
          resolve(`Event received: card=${detail?.card?.title}, x=${detail?.x}, y=${detail?.y}`);
          window.removeEventListener("card-context-menu", handler);
        };
        window.addEventListener("card-context-menu", handler);

        // Simulate right-click on the first card
        const cards = document.querySelectorAll('[style*="width: 320"]');
        if (cards.length > 0) {
          const event = new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: 200,
            clientY: 200,
          });
          cards[0].dispatchEvent(event);
        } else {
          resolve("No cards found to dispatch event on");
        }

        // Timeout
        setTimeout(() => resolve("Event not received within 1s"), 1000);
      });
    });
    console.log("Event test:", eventTest);

    await page.waitForTimeout(500);
    await page.screenshot({ path: "/tmp/after-event.png" });

    // Final check
    const finalMenu = await page.evaluate(() => {
      const allDivs = document.querySelectorAll("div");
      for (const div of allDivs) {
        const style = getComputedStyle(div);
        if (style.position === "fixed" && parseInt(style.zIndex) >= 2500) {
          return {
            found: true,
            zIndex: style.zIndex,
            display: style.display,
            rect: div.getBoundingClientRect(),
            innerHTML: div.innerHTML.slice(0, 200),
          };
        }
      }
      return { found: false };
    });
    console.log("Final menu check:", JSON.stringify(finalMenu, null, 2));
  });
});
