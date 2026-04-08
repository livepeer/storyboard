import { test, expect } from "@playwright/test";

/**
 * Diagnostic test — checks what code is ACTUALLY running in the browser.
 * Intercepts real SDK requests to see what capability names the app sends.
 */
test.describe("Live Diagnosis", () => {
  test("check what the browser actually sends to the SDK", async ({ page }) => {
    // Collect ALL network requests to the SDK
    const sdkRequests: Array<{ url: string; body: string; capability?: string }> = [];

    page.on("request", (req) => {
      if (req.url().includes("daydream.monster") || req.url().includes("sdk")) {
        const body = req.postData() || "";
        let capability: string | undefined;
        try {
          const parsed = JSON.parse(body);
          capability = parsed.capability;
        } catch { /* not json */ }
        sdkRequests.push({ url: req.url(), body: body.slice(0, 500), capability });
      }
    });

    // Also collect all requests to the Claude API proxy
    const claudeRequests: Array<{ body: string }> = [];
    const claudeResponses: Array<{ body: string }> = [];

    page.on("request", (req) => {
      if (req.url().includes("/api/agent/chat")) {
        claudeRequests.push({ body: (req.postData() || "").slice(0, 2000) });
      }
    });

    page.on("response", async (resp) => {
      if (resp.url().includes("/api/agent/chat")) {
        try {
          const body = await resp.text();
          claudeResponses.push({ body: body.slice(0, 3000) });
        } catch { /* stream */ }
      }
    });

    await page.goto("/");
    await page.waitForTimeout(3000); // Wait for capabilities to load

    // Check: does the page have the updated create_media tool?
    // We can check by looking at the tool registry
    const toolCheck = await page.evaluate(() => {
      // The tool registry is a module-level Map. Access it via the global scope
      // by calling listTools which is exposed through initializeTools
      try {
        // Try to find create_media's description in the page's JS
        const scripts = document.querySelectorAll("script");
        let found = "";
        for (const s of scripts) {
          if (s.textContent?.includes("create_media")) {
            found = s.textContent.slice(0, 200);
            break;
          }
        }
        return { found: found || "not found in scripts" };
      } catch (e) {
        return { error: String(e) };
      }
    });

    console.log("Tool check:", JSON.stringify(toolCheck));

    // Set Claude as active agent
    await page.evaluate(() => {
      localStorage.setItem("storyboard_active_agent", "claude");
    });
    await page.reload();
    await page.waitForTimeout(3000);

    // Send a SIMPLE test message — just one image
    const input = page.locator("textarea");
    await input.fill("Create one image of a red apple on a white table");
    await input.press("Enter");

    // Wait for the request cycle
    await page.waitForTimeout(15000);

    // Report what happened
    console.log("\n=== SDK REQUESTS ===");
    for (const req of sdkRequests) {
      console.log(`  URL: ${req.url}`);
      if (req.capability) console.log(`  CAPABILITY: ${req.capability}`);
      console.log(`  Body: ${req.body.slice(0, 300)}`);
      console.log("  ---");
    }

    console.log("\n=== CLAUDE API RESPONSES ===");
    for (const resp of claudeResponses) {
      console.log(`  Response: ${resp.body.slice(0, 1000)}`);
      console.log("  ---");
    }

    // Check for invalid capabilities
    const invalidCaps = sdkRequests
      .filter((r) => r.capability && !isValid(r.capability))
      .map((r) => r.capability);

    console.log("\n=== INVALID CAPABILITIES SENT TO SDK ===");
    console.log(invalidCaps.length > 0 ? invalidCaps : "NONE (all valid!)");

    // Also check what capabilities endpoint returned
    const capsReq = sdkRequests.find((r) => r.url.includes("/capabilities"));
    if (capsReq) {
      console.log("\n=== CAPABILITIES RESPONSE ===");
      console.log(capsReq.body);
    }

    // The test itself — did any invalid capability reach the SDK?
    expect(
      invalidCaps,
      `Invalid capabilities reached SDK: ${invalidCaps.join(", ")}`
    ).toHaveLength(0);
  });
});

function isValid(cap: string): boolean {
  const VALID = new Set([
    "flux-dev", "flux-schnell", "recraft-v4", "gemini-image", "gemini-text",
    "ltx-i2v", "ltx-t2v", "kontext-edit",
    "topaz-upscale", "bg-remove", "chatterbox-tts", "nano-banana",
  ]);
  return VALID.has(cap);
}
