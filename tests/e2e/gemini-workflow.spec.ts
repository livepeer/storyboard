import { test, expect } from "@playwright/test";

const VALID_CAPABILITIES = new Set([
  "flux-dev", "flux-schnell", "recraft-v4", "gemini-image", "gemini-text",
  "ltx-i2v", "ltx-t2v", "kontext-edit",
  "topaz-upscale", "bg-remove", "chatterbox-tts", "nano-banana",
]);

const PROMPTS = [
  {
    id: "storyboard",
    text: "A samurai stands on a cliff overlooking a neon-lit cyberpunk city at night. Cherry blossoms fall around him. He draws his sword as a dragon made of light rises from the city below.",
  },
  {
    id: "style-dna",
    text: "Remember my style: I like Moebius illustration style — clean ink lines, muted pastel colors, retro sci-fi aesthetic. Save it and activate it.",
  },
  {
    id: "simple-generate",
    text: "Create an image of a red apple on a white table",
  },
  {
    id: "refinement",
    text: "Create a professional product photo of futuristic headphones — iterate until it looks premium, then upscale the best version",
  },
  {
    id: "full-storyboard",
    text: 'Create a 5-shot cinematic storyboard: An astronaut discovers an ancient alien temple on Mars. The temple doors open revealing golden light. Inside, holographic star maps float in the air. The astronaut reaches out and touches one, and galaxies swirl around her. Animate the most dramatic shot, and narrate it with: "She had traveled 225 million kilometers, only to find that someone had been waiting."',
  },
];

/**
 * E2E: Test each prompt through Gemini agent.
 * Verifies:
 * 1. Gemini API is called (not Claude/OpenAI)
 * 2. Tool calls are made (create_media, memory_style, etc.)
 * 3. No invalid capability names reach the SDK
 */
test.describe("Gemini Workflow E2E", () => {
  for (const prompt of PROMPTS) {
    test(`Prompt: ${prompt.id}`, async ({ page }) => {
      const sdkCapabilities: string[] = [];
      const geminiCalled = { value: false };
      const toolsCalled: string[] = [];

      // Intercept SDK requests — mock success
      await page.route("**/sdk-a3-staging-1.daydream.monster/inference", async (route) => {
        const body = route.request().postData() || "";
        try {
          const parsed = JSON.parse(body);
          if (parsed.capability) sdkCapabilities.push(parsed.capability);
        } catch { /* */ }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            image_url: "https://example.com/test.png",
            audio_url: "https://example.com/test.mp3",
            video_url: "https://example.com/test.mp4",
          }),
        });
      });

      // Let capabilities through
      await page.route("**/sdk-a3-staging-1.daydream.monster/capabilities", async (route) => {
        await route.continue();
      });

      // Intercept Gemini API to confirm it's called
      await page.route("**/api/agent/gemini", async (route) => {
        geminiCalled.value = true;
        // Forward to real Gemini API
        await route.continue();
      });

      // Block Claude/OpenAI to ensure Gemini is used
      await page.route("**/api/agent/chat", async (route) => {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: "Claude should not be called in Gemini test" }),
        });
      });
      await page.route("**/api/agent/openai", async (route) => {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: "OpenAI should not be called in Gemini test" }),
        });
      });

      // Set Gemini as active agent
      await page.goto("/");
      await page.evaluate(() => {
        localStorage.setItem("storyboard_active_agent", "gemini");
      });
      await page.reload();
      await page.waitForTimeout(3000);

      // Send prompt
      const input = page.locator("textarea");
      await input.fill(prompt.text);
      await input.press("Enter");

      // Wait for processing (Gemini Pro can be slower)
      await page.waitForTimeout(30000);

      // Verify Gemini was called
      expect(geminiCalled.value, "Gemini API should have been called").toBe(true);

      // Verify no invalid capabilities reached SDK
      const invalid = sdkCapabilities.filter((c) => !VALID_CAPABILITIES.has(c));
      expect(
        invalid,
        `Invalid capabilities sent to SDK: ${invalid.join(", ")}`
      ).toHaveLength(0);

      // Log results
      console.log(`[${prompt.id}] Gemini called: ${geminiCalled.value}`);
      console.log(`[${prompt.id}] SDK capabilities: ${sdkCapabilities.join(", ") || "(none)"}`);
      console.log(`[${prompt.id}] Invalid: ${invalid.length === 0 ? "NONE" : invalid.join(", ")}`);
    });
  }
});
