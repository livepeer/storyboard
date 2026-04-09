import { test, expect } from "@playwright/test";

test("click card shows model info bar", async ({ page }) => {
  await page.route("**/sdk.daydream.monster/**", (r) => r.continue());
  await page.goto("/");
  await page.waitForTimeout(5000);

  // Add cards + edge via exposed store
  await page.evaluate(() => {
    const store = (window as any).__canvas;
    if (!store) throw new Error("Store not exposed");
    const s = store.getState();
    const c1 = s.addCard({ type: "image", title: "Dragon", url: "https://picsum.photos/320/240" });
    const c2 = s.addCard({ type: "image", title: "Restyled Dragon", url: "https://picsum.photos/320/240" });
    s.addEdge(c1.refId, c2.refId, {
      capability: "flux-dev",
      prompt: "a fire-breathing dragon in cyberpunk style",
      elapsed: 8200,
      action: "restyle",
    });
  });
  await page.waitForTimeout(500);

  // Click the second card (has incoming edge)
  const card2 = page.locator("[data-card]").nth(1);
  await card2.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/card-info.png" });

  // Check info bar appears with model details
  const infoBar = await page.evaluate(() => {
    const els = document.querySelectorAll("[data-card]");
    const card2 = els[1];
    if (!card2) return { found: false };
    // Find the info bar - it has the capability text
    const divs = card2.querySelectorAll("div");
    for (const d of divs) {
      if (d.textContent?.includes("flux-dev") && d.style.borderTop) {
        return { found: true, text: d.textContent.slice(0, 100) };
      }
    }
    return { found: false };
  });
  console.log("Info bar:", JSON.stringify(infoBar));
  expect(infoBar.found, "Info bar should show model details on click").toBe(true);
  expect(infoBar.text).toContain("flux-dev");
  expect(infoBar.text).toContain("dragon");
});
