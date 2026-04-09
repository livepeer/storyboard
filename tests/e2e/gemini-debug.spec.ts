import { test, expect } from "@playwright/test";

test("Debug Gemini full flow", async ({ page }) => {
  // Capture all network and console
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`[PAGE ERROR] ${err.message}`));

  const geminiRequests: Array<{ body: string }> = [];
  const geminiResponses: Array<{ status: number; body: string }> = [];

  page.on("request", (req) => {
    if (req.url().includes("/api/agent/gemini")) {
      geminiRequests.push({ body: (req.postData() || "").slice(0, 3000) });
    }
  });

  page.on("response", async (resp) => {
    if (resp.url().includes("/api/agent/gemini")) {
      try {
        const body = await resp.text();
        geminiResponses.push({ status: resp.status(), body: body.slice(0, 3000) });
      } catch { /* stream */ }
    }
  });

  // Mock SDK to avoid real inference
  await page.route("**/sdk.daydream.monster/inference", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ image_url: "https://example.com/test.png" }),
    });
  });
  await page.route("**/sdk.daydream.monster/capabilities", (route) => route.continue());

  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("storyboard_active_agent", "gemini"));
  await page.reload();
  await page.waitForTimeout(3000);

  // Send a simple prompt
  const input = page.locator("textarea");
  await input.fill("Create an image of a red apple");
  await input.press("Enter");

  // Wait for Gemini to respond
  await page.waitForTimeout(30000);

  // Dump everything
  console.log("\n=== CONSOLE LOGS ===");
  for (const l of logs) console.log(l);

  console.log("\n=== GEMINI REQUESTS ===");
  for (const r of geminiRequests) console.log(r.body.slice(0, 500));

  console.log("\n=== GEMINI RESPONSES ===");
  for (const r of geminiResponses) {
    console.log(`HTTP ${r.status}`);
    console.log(r.body.slice(0, 1000));
  }

  // Check for errors
  const errors = logs.filter((l) => l.includes("ERROR") || l.includes("error"));
  console.log("\n=== ERRORS ===");
  console.log(errors.length > 0 ? errors.join("\n") : "NONE");

  expect(geminiRequests.length, "Gemini API should have been called").toBeGreaterThan(0);
});
