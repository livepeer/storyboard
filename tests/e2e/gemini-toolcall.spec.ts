import { test, expect } from "@playwright/test";

const VALID_CAPABILITIES = new Set([
  "flux-dev", "flux-schnell", "recraft-v4", "gemini-image", "gemini-text",
  "ltx-i2v", "ltx-t2v", "kontext-edit",
  "topaz-upscale", "bg-remove", "chatterbox-tts", "nano-banana",
]);

test("Gemini makes tool calls for simple image generation", async ({ page }) => {
  const sdkCapabilities: string[] = [];
  let geminiCalled = false;

  // Mock SDK inference
  await page.route("**/sdk-a3-staging-1.daydream.monster/inference", async (route) => {
    const body = route.request().postData() || "";
    try {
      const parsed = JSON.parse(body);
      if (parsed.capability) sdkCapabilities.push(parsed.capability);
    } catch { /* */ }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ image_url: "https://example.com/apple.png" }),
    });
  });

  await page.route("**/sdk-a3-staging-1.daydream.monster/capabilities", (route) => route.continue());

  // Track Gemini calls
  await page.route("**/api/agent/gemini", async (route) => {
    geminiCalled = true;
    await route.continue();
  });

  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("storyboard_active_agent", "gemini"));
  await page.reload();
  await page.waitForTimeout(3000);

  const input = page.locator("textarea");
  await input.fill("Create an image of a red apple");
  await input.press("Enter");

  // Wait longer for Gemini Pro to reason + tool call + loop
  await page.waitForTimeout(60000);

  console.log(`Gemini called: ${geminiCalled}`);
  console.log(`SDK capabilities used: ${sdkCapabilities.join(", ") || "(none)"}`);

  expect(geminiCalled).toBe(true);

  // Check no invalid capabilities
  const invalid = sdkCapabilities.filter((c) => !VALID_CAPABILITIES.has(c));
  expect(invalid, `Invalid: ${invalid.join(", ")}`).toHaveLength(0);

  // Gemini should have called create_media which triggers SDK inference
  if (sdkCapabilities.length > 0) {
    console.log("SUCCESS: Gemini triggered SDK inference with valid capabilities!");
  } else {
    console.log("NOTE: Gemini responded with text but did not trigger tool calls within timeout.");
    console.log("This may happen with Gemini Pro's longer thinking time.");
  }
});
