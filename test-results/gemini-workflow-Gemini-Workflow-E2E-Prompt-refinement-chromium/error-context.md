# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gemini-workflow.spec.ts >> Gemini Workflow E2E >> Prompt: refinement
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
        - generic [ref=e20]: image
        - generic "Click to copy · Double-click to rename" [ref=e21] [cursor=pointer]: Professional product photo futuristic headphones
        - generic "Click to copy \"img-1\" to chat" [ref=e22] [cursor=pointer]: img-1
        - generic [ref=e23]:
          - button "📌" [ref=e24]
          - button "↓" [ref=e25]
          - button "—" [ref=e26]
          - button "×" [ref=e27]
      - img "Professional product photo futuristic headphones" [ref=e29]
    - generic [ref=e32]:
      - generic [ref=e33]:
        - generic [ref=e34]: image
        - generic "Click to copy · Double-click to rename" [ref=e35] [cursor=pointer]: Professional product photo futuristic headphones
        - generic "Click to copy \"img-2\" to chat" [ref=e36] [cursor=pointer]: img-2
        - generic [ref=e37]:
          - button "📌" [ref=e38]
          - button "↓" [ref=e39]
          - button "—" [ref=e40]
          - button "×" [ref=e41]
      - img "Professional product photo futuristic headphones" [ref=e43]
    - generic [ref=e46]:
      - generic [ref=e47]:
        - generic [ref=e48]: image
        - generic "Click to copy · Double-click to rename" [ref=e49] [cursor=pointer]: Alternative composition, professional product photo
        - generic "Click to copy \"img-3\" to chat" [ref=e50] [cursor=pointer]: img-3
        - generic [ref=e51]:
          - button "📌" [ref=e52]
          - button "↓" [ref=e53]
          - button "—" [ref=e54]
          - button "×" [ref=e55]
      - img "Alternative composition, professional product photo" [ref=e57]
    - generic [ref=e60]:
      - generic [ref=e61]:
        - generic [ref=e62]: image
        - generic "Click to copy · Double-click to rename" [ref=e63] [cursor=pointer]: Different angle, professional product photo
        - generic "Click to copy \"img-4\" to chat" [ref=e64] [cursor=pointer]: img-4
        - generic [ref=e65]:
          - button "📌" [ref=e66]
          - button "↓" [ref=e67]
          - button "—" [ref=e68]
          - button "×" [ref=e69]
      - img "Different angle, professional product photo" [ref=e71]
  - generic [ref=e74]:
    - generic [ref=e75]:
      - generic [ref=e77]: Agent
      - button "—" [ref=e78]
    - generic [ref=e79]:
      - generic [ref=e80]: Connected — describe what you want to create
      - generic "Click to copy" [ref=e81] [cursor=pointer]: Create a professional product photo of futuristic headphones — iterate until it looks premium, then upscale the best version
      - generic "Click to copy" [ref=e82] [cursor=pointer]: Generating 4 variations
      - generic [ref=e83]: "img-1: flux-dev — done (0.0s)"
      - generic [ref=e84]: "img-2: flux-dev — done (0.0s)"
      - generic [ref=e85]: "img-3: flux-dev — done (0.0s)"
      - generic [ref=e86]: "img-4: flux-dev — done (0.0s)"
      - generic [ref=e87]: "Try next: /render | /export social all | Right-click any card for options"
      - generic "Click to copy" [ref=e88] [cursor=pointer]: 4 variations created
      - generic [ref=e89]: Happy with the results? Pick favorites and right-click → keep, or type to iterate.
    - generic [ref=e90]:
      - generic [ref=e92]:
        - button "+ Generate" [ref=e93]:
          - generic [ref=e94]: +
          - text: Generate
        - button "✨ Restyle" [ref=e95]:
          - generic [ref=e96]: ✨
          - text: Restyle
        - button "▶ Animate" [ref=e97]:
          - generic [ref=e98]: ▶
          - text: Animate
        - button "📡 LV2V" [ref=e99]:
          - generic [ref=e100]: 📡
          - text: LV2V
        - button "🧠 Train" [ref=e101]:
          - generic [ref=e102]: 🧠
          - text: Train
        - button "📋 Recent" [ref=e103]:
          - generic [ref=e104]: 📋
          - text: Recent
      - generic [ref=e105]:
        - textbox "Create a dragon as image, then animate it..." [active] [ref=e106]
        - button "Voice input" [ref=e107]:
          - img [ref=e108]
        - button "Expand editor for long prompts" [ref=e111]:
          - img [ref=e112]
  - generic [ref=e115]:
    - generic [ref=e116]: CAM
    - generic [ref=e117]: Camera
    - button "Start" [ref=e118]
  - generic [ref=e120]:
    - generic [ref=e125]: ⚙️
    - heading "1. Set your API key" [level=3] [ref=e126]
    - paragraph [ref=e127]: Click the gear icon (top-right) and enter your Daydream API key. This connects you to 40+ AI models.
    - paragraph [ref=e128]: This step will auto-advance when completed
    - generic [ref=e129]:
      - button "Skip" [ref=e130]
      - button "Next" [ref=e131]
  - button "Open Next.js Dev Tools" [ref=e137] [cursor=pointer]:
    - img [ref=e138]
  - alert [ref=e141]
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