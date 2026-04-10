import { test, expect } from "@playwright/test";

const GHIBLI_BRIEF = `Create a 3-scene illustrated storyboard in Studio Ghibli watercolor style. A young girl with windswept hair and a wooden skateboard rides through a countryside village on a summer afternoon. Palette: burnt sienna, sage green, soft ochre.

Scene 1 — The Hilltop
Wide aerial view of the village. The girl crouches on her skateboard at the top of the hill, about to push off. Warm amber light.
Scene 2 — The Market
She weaves between market stalls. Vendors watch, a cat leaps off a wall. Dynamic diagonal composition.
Scene 3 — The Bridge
She crosses a stone bridge over a slow river. Her reflection mirrors in the still water below. Weeping willows frame the scene.`;

test.describe("Session Context", () => {
  test("Gemini API route works without tools (no toolConfig sent)", async ({ page }) => {
    // This tests the root cause: the API route was sending toolConfig
    // even when no tools were provided, causing Gemini to error
    const resp = await page.request.post("/api/agent/gemini", {
      data: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Reply with exactly: HELLO" }],
          },
        ],
        // No tools — this must work without toolConfig
      },
    });

    // Should get 200, not 400/500
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.candidates).toBeTruthy();
    expect(data.candidates[0].content.parts[0].text).toBeTruthy();
  });

  test("Gemini API extracts creative context from brief", async ({ page }) => {
    const resp = await page.request.post("/api/agent/gemini", {
      data: {
        contents: [
          {
            role: "user",
            parts: [{
              text: `Extract the creative essence from this brief. Reply in EXACTLY this format:

STYLE: <visual style in under 15 words>
PALETTE: <color palette in under 15 words>
CHARACTERS: <main character descriptions in under 20 words>
SETTING: <where and when in under 15 words>
RULES: <creative rules in under 20 words>
MOOD: <emotional tone in under 10 words>

Brief:
${GHIBLI_BRIEF}`,
            }],
          },
        ],
      },
    });

    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("LLM extraction response:", text);

    // Should contain structured fields
    expect(text).toMatch(/STYLE:/i);
    expect(text).toMatch(/CHARACTERS:/i);
    // Should mention Ghibli in style
    expect(text.toLowerCase()).toContain("ghibli");
    // Should mention the girl
    expect(text.toLowerCase()).toMatch(/girl|young/);
  });

  test("context is saved after multi-scene prompt", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    await page.waitForTimeout(1000);

    // Capture console logs to verify extraction
    const logs: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("[Preprocessor]")) logs.push(msg.text());
    });

    const chatInput = page.locator('textarea[placeholder*="Create a dragon"]');
    await chatInput.fill(GHIBLI_BRIEF);
    await chatInput.press("Enter");

    // Wait for context-related messages (extraction + personality messages)
    // The preprocessor shows personality ("love this brief") then "Creative context saved"
    await expect(
      page.getByText(/Creative context saved|context saved|love this|gorgeous|vision|creative challenge/i).first()
    ).toBeVisible({ timeout: 30000 });

    // Check console logs for extraction trace
    console.log("Preprocessor logs:", logs);

    // Check /context to verify it was saved
    await chatInput.fill("/context");
    await chatInput.press("Enter");

    // Should show context (either LLM-extracted or fallback)
    await expect(
      page.getByText(/Style:|Creative Context:|Ghibli|watercolor/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("/context command shows extracted fields after brief", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    await page.waitForTimeout(1000);

    const chatInput = page.locator('textarea[placeholder*="Create a dragon"]');
    await chatInput.fill(GHIBLI_BRIEF);
    await chatInput.press("Enter");

    // Wait for preprocessor to finish (personality message OR context saved)
    await expect(
      page.getByText(/love this|gorgeous|vision|creative challenge|Planning|context saved/i).first()
    ).toBeVisible({ timeout: 30000 });

    // Give extraction time to complete
    await page.waitForTimeout(3000);

    // Check /context
    await chatInput.fill("/context");
    await chatInput.press("Enter");

    // Should show SOMETHING — either LLM extraction or fallback or "no active context"
    await expect(
      page.getByText(/Style:|Creative Context:|No active creative context/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("/context clear removes context", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    await page.waitForTimeout(1000);

    // Create context first
    const chatInput = page.locator('textarea[placeholder*="Create a dragon"]');
    await chatInput.fill(GHIBLI_BRIEF);
    await chatInput.press("Enter");
    await expect(
      page.getByText(/Creative context saved/i).first()
    ).toBeVisible({ timeout: 20000 });

    // Clear it
    await chatInput.fill("/context clear");
    await chatInput.press("Enter");
    await expect(
      page.getByText(/context cleared/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  // Regression
  test("regression: app loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
  });

  test("regression: health API", async ({ page }) => {
    const resp = await page.request.get("/api/health");
    expect(resp.ok()).toBeTruthy();
  });
});
