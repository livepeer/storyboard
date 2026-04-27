# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gemini-workflow.spec.ts >> Gemini Workflow E2E >> Prompt: full-storyboard
- Location: tests/e2e/gemini-workflow.spec.ts:41:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForTimeout: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]: Storyboard
    - generic [ref=e5]:
      - button "−" [ref=e6]
      - generic [ref=e7]: 100%
      - button "+" [ref=e8]
      - button "Fit" [ref=e9]
      - button "Train" [ref=e11]
      - button "Export" [ref=e12]
      - link "API" [ref=e13] [cursor=pointer]:
        - /url: /docs
      - button "?" [ref=e14]
      - button "⚙" [ref=e15]
  - generic [ref=e17]:
    - img
  - generic [ref=e18]:
    - generic [ref=e19]:
      - generic [ref=e21]: Agent
      - button "—" [ref=e22]
    - generic [ref=e23]:
      - generic [ref=e24]: Connected — describe what you want to create
      - generic "Click to copy" [ref=e25] [cursor=pointer]: "Create a 5-shot cinematic storyboard: An astronaut discovers an ancient alien temple on Mars. The temple doors open revealing golden light. Inside, holographic star maps float in the air. The astronaut reaches out and touches one, and galaxies swirl around her. Animate the most dramatic shot, and narrate it with: \"She had traveled 225 million kilometers, only to find that someone had been waiting.\""
      - generic "Click to copy" [ref=e26] [cursor=pointer]: Absolutely! A cosmic discovery on Mars with ancient alien temples sounds incredible. I'm excited to bring this vision to life!
      - generic "Click to copy" [ref=e27] [cursor=pointer]: Absolutely captivating! A stellar concept to kick things off. What's next for this cosmic journey?
      - generic [ref=e28]: 10.6s — 5,370 tokens (4,947 in / 423 out, 1,762 cached)
      - generic [ref=e29]: Project "A cinematic storyboard exploring an astr…" — 5,370 tokens across 1 turn
    - generic [ref=e30]:
      - generic [ref=e32]:
        - button "+ Generate" [ref=e33]:
          - generic [ref=e34]: +
          - text: Generate
        - button "✨ Restyle" [ref=e35]:
          - generic [ref=e36]: ✨
          - text: Restyle
        - button "▶ Animate" [ref=e37]:
          - generic [ref=e38]: ▶
          - text: Animate
        - button "📡 LV2V" [ref=e39]:
          - generic [ref=e40]: 📡
          - text: LV2V
        - button "🧠 Train" [ref=e41]:
          - generic [ref=e42]: 🧠
          - text: Train
        - button "📋 Recent" [ref=e43]:
          - generic [ref=e44]: 📋
          - text: Recent
      - generic [ref=e45]:
        - textbox "Create a dragon as image, then animate it..." [active] [ref=e46]
        - button "Voice input" [ref=e47]:
          - img [ref=e48]
        - button "Expand editor for long prompts" [ref=e51]:
          - img [ref=e52]
  - generic [ref=e55]:
    - generic [ref=e56]: CAM
    - generic [ref=e57]: Camera
    - button "Start" [ref=e58]
  - generic [ref=e60]:
    - generic [ref=e65]: ⚙️
    - heading "1. Set your API key" [level=3] [ref=e66]
    - paragraph [ref=e67]: Click the gear icon (top-right) and enter your Daydream API key. This connects you to 40+ AI models.
    - paragraph [ref=e68]: This step will auto-advance when completed
    - generic [ref=e69]:
      - button "Skip" [ref=e70]
      - button "Next" [ref=e71]
  - button "Open Next.js Dev Tools" [ref=e77] [cursor=pointer]:
    - img [ref=e78]
  - alert [ref=e81]
```

# Test source

```ts
  4   |   "flux-dev", "flux-schnell", "recraft-v4", "gemini-image", "gemini-text",
  5   |   "ltx-i2v", "ltx-t2v", "kontext-edit",
  6   |   "topaz-upscale", "bg-remove", "chatterbox-tts", "nano-banana",
  7   | ]);
  8   | 
  9   | const PROMPTS = [
  10  |   {
  11  |     id: "storyboard",
  12  |     text: "A samurai stands on a cliff overlooking a neon-lit cyberpunk city at night. Cherry blossoms fall around him. He draws his sword as a dragon made of light rises from the city below.",
  13  |   },
  14  |   {
  15  |     id: "style-dna",
  16  |     text: "Remember my style: I like Moebius illustration style — clean ink lines, muted pastel colors, retro sci-fi aesthetic. Save it and activate it.",
  17  |   },
  18  |   {
  19  |     id: "simple-generate",
  20  |     text: "Create an image of a red apple on a white table",
  21  |   },
  22  |   {
  23  |     id: "refinement",
  24  |     text: "Create a professional product photo of futuristic headphones — iterate until it looks premium, then upscale the best version",
  25  |   },
  26  |   {
  27  |     id: "full-storyboard",
  28  |     text: 'Create a 5-shot cinematic storyboard: An astronaut discovers an ancient alien temple on Mars. The temple doors open revealing golden light. Inside, holographic star maps float in the air. The astronaut reaches out and touches one, and galaxies swirl around her. Animate the most dramatic shot, and narrate it with: "She had traveled 225 million kilometers, only to find that someone had been waiting."',
  29  |   },
  30  | ];
  31  | 
  32  | /**
  33  |  * E2E: Test each prompt through Gemini agent.
  34  |  * Verifies:
  35  |  * 1. Gemini API is called (not Claude/OpenAI)
  36  |  * 2. Tool calls are made (create_media, memory_style, etc.)
  37  |  * 3. No invalid capability names reach the SDK
  38  |  */
  39  | test.describe("Gemini Workflow E2E", () => {
  40  |   for (const prompt of PROMPTS) {
  41  |     test(`Prompt: ${prompt.id}`, async ({ page }) => {
  42  |       const sdkCapabilities: string[] = [];
  43  |       const geminiCalled = { value: false };
  44  |       const toolsCalled: string[] = [];
  45  | 
  46  |       // Intercept SDK requests — mock success
  47  |       await page.route("**/sdk.daydream.monster/inference", async (route) => {
  48  |         const body = route.request().postData() || "";
  49  |         try {
  50  |           const parsed = JSON.parse(body);
  51  |           if (parsed.capability) sdkCapabilities.push(parsed.capability);
  52  |         } catch { /* */ }
  53  |         await route.fulfill({
  54  |           status: 200,
  55  |           contentType: "application/json",
  56  |           body: JSON.stringify({
  57  |             image_url: "https://example.com/test.png",
  58  |             audio_url: "https://example.com/test.mp3",
  59  |             video_url: "https://example.com/test.mp4",
  60  |           }),
  61  |         });
  62  |       });
  63  | 
  64  |       // Let capabilities through
  65  |       await page.route("**/sdk.daydream.monster/capabilities", async (route) => {
  66  |         await route.continue();
  67  |       });
  68  | 
  69  |       // Intercept Gemini API to confirm it's called
  70  |       await page.route("**/api/agent/gemini", async (route) => {
  71  |         geminiCalled.value = true;
  72  |         // Forward to real Gemini API
  73  |         await route.continue();
  74  |       });
  75  | 
  76  |       // Block Claude/OpenAI to ensure Gemini is used
  77  |       await page.route("**/api/agent/chat", async (route) => {
  78  |         await route.fulfill({
  79  |           status: 500,
  80  |           body: JSON.stringify({ error: "Claude should not be called in Gemini test" }),
  81  |         });
  82  |       });
  83  |       await page.route("**/api/agent/openai", async (route) => {
  84  |         await route.fulfill({
  85  |           status: 500,
  86  |           body: JSON.stringify({ error: "OpenAI should not be called in Gemini test" }),
  87  |         });
  88  |       });
  89  | 
  90  |       // Set Gemini as active agent
  91  |       await page.goto("/");
  92  |       await page.evaluate(() => {
  93  |         localStorage.setItem("storyboard_active_agent", "gemini");
  94  |       });
  95  |       await page.reload();
  96  |       await page.waitForTimeout(3000);
  97  | 
  98  |       // Send prompt
  99  |       const input = page.locator("textarea");
  100 |       await input.fill(prompt.text);
  101 |       await input.press("Enter");
  102 | 
  103 |       // Wait for processing (Gemini Pro can be slower)
> 104 |       await page.waitForTimeout(30000);
      |                  ^ Error: page.waitForTimeout: Test timeout of 30000ms exceeded.
  105 | 
  106 |       // Verify Gemini was called
  107 |       expect(geminiCalled.value, "Gemini API should have been called").toBe(true);
  108 | 
  109 |       // Verify no invalid capabilities reached SDK
  110 |       const invalid = sdkCapabilities.filter((c) => !VALID_CAPABILITIES.has(c));
  111 |       expect(
  112 |         invalid,
  113 |         `Invalid capabilities sent to SDK: ${invalid.join(", ")}`
  114 |       ).toHaveLength(0);
  115 | 
  116 |       // Log results
  117 |       console.log(`[${prompt.id}] Gemini called: ${geminiCalled.value}`);
  118 |       console.log(`[${prompt.id}] SDK capabilities: ${sdkCapabilities.join(", ") || "(none)"}`);
  119 |       console.log(`[${prompt.id}] Invalid: ${invalid.length === 0 ? "NONE" : invalid.join(", ")}`);
  120 |     });
  121 |   }
  122 | });
  123 | 
```