import { test } from "@playwright/test";

test("Debug first prompt silent failure", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`[PAGE_ERROR] ${err.message}`));

  const apiCalls: Array<{ url: string; status?: number; body?: string }> = [];

  page.on("request", (req) => {
    if (req.url().includes("/api/agent/") || req.url().includes("generativelanguage")) {
      apiCalls.push({ url: req.url(), body: (req.postData() || "").slice(0, 500) });
    }
  });

  page.on("response", async (resp) => {
    if (resp.url().includes("/api/agent/")) {
      const entry = apiCalls.find((c) => c.url === resp.url() && !c.status);
      if (entry) entry.status = resp.status();
    }
  });

  // Mock SDK
  await page.route("**/sdk.daydream.monster/inference", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ image_url: "https://picsum.photos/320/240" }),
    });
  });
  await page.route("**/sdk.daydream.monster/capabilities", (r) => r.continue());

  await page.goto("/");
  await page.waitForTimeout(5000); // Wait for mounted + init

  // Check what agent is active
  const agent = await page.evaluate(() => localStorage.getItem("storyboard_active_agent"));
  console.log(`Active agent: ${agent}`);

  // Check if tools are initialized
  const toolCount = await page.evaluate(() => {
    return (window as any).__toolCount || "unknown";
  });
  console.log(`Tool count: ${toolCount}`);

  // Send first prompt
  const input = page.locator("textarea").first();
  await input.fill("Create an image of a sunset");
  await input.press("Enter");
  console.log("Sent first prompt");

  await page.waitForTimeout(15000);

  // Check results
  const messages = await page.locator("[class*='break-words']").allTextContents();
  console.log("\n=== Chat messages ===");
  for (const m of messages) console.log(`  "${m.slice(0, 80)}"`);

  console.log("\n=== API calls ===");
  for (const c of apiCalls) console.log(`  ${c.url.split("/").pop()} → ${c.status || "pending"}`);

  console.log("\n=== Console errors ===");
  const errors = logs.filter((l) => l.includes("error") || l.includes("Error") || l.includes("FAIL") || l.includes("warn"));
  for (const e of errors) console.log(`  ${e}`);

  console.log("\n=== All console ===");
  for (const l of logs.slice(-20)) console.log(`  ${l}`);

  // Check cards
  const cards = await page.locator("[data-card]").count();
  console.log(`\nCards on canvas: ${cards}`);
});
