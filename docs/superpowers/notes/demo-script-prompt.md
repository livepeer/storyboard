# Storyboard Demo Script — "The Last Lantern Festival of Furukawa"

A 12-minute end-to-end demo that showcases every major capability of the storyboard app + `@livepeer/agent` SDK in a single creative arc. Designed for live presentation to a non-technical audience, with enough technical annotations that an engineer in the room can see what's happening under the hood.

**Total runtime:** ~12 minutes (8 of narration + 4 of model inference time — use it to talk).

**What you're demoing (one sentence each):**

1. Persistent creative direction that every future prompt respects
2. Zero-LLM client-side scene extraction — the preprocessor's 10× token win
3. Multi-scene storyboard generation with consistent characters, palette, and mood
4. Human-in-the-loop iteration — regenerate a scene with specific feedback
5. Spatial canvas layout driven by a pack tool
6. Google Veo 3.1 text-to-video via `veo-i2v` with **native synchronized audio** (the LTX-impossible demo)
7. Live video-to-video streaming (Scope pipeline) with real-time creative direction
8. Cross-agent continuity — Gemini, Claude, and OpenAI sharing one canvas, one tool registry, one project
9. Per-project token economics — the running total that proves the 10× savings claim
10. The clarifier — the agent converses when it's ambiguous instead of erroring out

---

## Pre-flight checklist (60 seconds before the demo starts)

Do these **before** anyone is watching:

1. ✅ Open **http://localhost:3000** (or `https://storyboard-feat-agent-sdk.vercel.app` if you prefer the preview)
2. ✅ Open **Settings panel** → verify **Daydream API key** is pasted into the "SDK API Key" field (browser localStorage, not a Vercel env var)
3. ✅ Verify **Gemini** is the default agent in Settings
4. ✅ Click **🧹 Clear canvas** + **🧹 Clear chat** so you start from zero
5. ✅ Zoom the browser to **110%** so the canvas cards are readable from the back of the room
6. ✅ Allow **webcam** access (you'll need it for Act VI)
7. ✅ Open **DevTools → Console** on a second monitor or small window — useful for real-time `[Gemini]` / `[Claude]` / `[OpenAI]` plugin logs if an engineer in the audience asks "what's it doing right now?"
8. ✅ Have this document open in a second tab for copy-paste

**If anything fails:** the clarifier demo (Act IX) is a guaranteed 30-second save. Skip to it.

---

## The Story You're Telling

Before typing anything, tell the audience the setup in one breath:

> *"I'm going to make a 6-scene Studio Ghibli-style storyboard about a girl named Haru at her grandfather's dying mountain village's final lantern festival — locked visual style, consistent characters across every scene, with one cinematic animated moment and a live webcam transformation — in about 10 minutes, using roughly the same number of tokens as one paragraph of GPT-4 output. Watch the chat's per-project token total at the bottom when we're done."*

Now start typing.

---

## ACT I — Creative Direction (30 seconds)

**What it demos:** `/context gen` — persistent CreativeContext in zustand, marshaled into every future runStream call's system prompt as a critical constraint. Whatever the agent generates from now on will respect this vision automatically.

**Copy-paste into chat (multi-line is fine, multi-line slash commands now parse correctly):**

```
/context gen A cinematic short film set in a tiny mountain village in Japan called Furukawa, during the last summer lantern festival before the village is abandoned. Visual style: Studio Ghibli hand-painted watercolor meeting Wes Anderson symmetry and quiet composition. Characters: Haru, a 10-year-old girl in a faded indigo yukata with cherry-blossom pattern, pigtails tied with red ribbons, quietly melancholy, carries a small red paper lantern. Grandfather Jirō, 80s, white beard, wooden cane, festival organizer, the weight of history in his eyes. Riku, a mischievous 11-year-old boy holding a plastic bag with a single goldfish. Mr. Tanaka, elderly shamisen musician on a small wooden stage. Palette: warm amber lantern glow, deep indigo night, red paper, pale cherry, aged gold, forest green, mountain mist blue. Rules: no dialogue, gentle camera movement, always dusk or night, lanterns everywhere, mist on distant peaks. Mood: nostalgic, bittersweet, the feeling of witnessing something beautiful for the last time. A film that wants to be remembered.
```

**What the audience will see** (within 2 seconds):

```
✦ Context created: watercolor, Haru + grandfather, Furukawa village
```

That's the entire response. No tool calls, no image generation yet. Just a system message confirming the context is locked in zustand.

**What to say while it's running:**

> *"The agent just parsed that paragraph into six structured fields — style, characters, palette, setting, rules, mood. Every future prompt in this session automatically inherits those fields as a critical constraint in the system prompt. I'm not going to type any of those details again."*

**Optional side-show for engineers in the room:** open DevTools → Application tab → Local Storage → look for `storyboard_session_context`. You'll see the structured CreativeContext object. That's what's getting marshaled into every runStream call's WorkingMemoryStore criticalConstraints array.

---

## ACT II — The Storyboard (60 seconds of narration, 45 seconds of inference)

**What it demos:** The **Layer 1 preprocessor** — zero-LLM client-side scene extraction. Watch the token total at the end.

**Copy-paste into chat:**

```
SCENE 1 — MIST OVER FURUKAWA
Wide establishing shot at dusk. Mountain village half-hidden in purple evening mist. Lantern-lit paths snake up the forested slopes. Distant taiko drum echoes. The silhouettes of steep cedar trees frame the valley.

SCENE 2 — HARU AND GRANDFATHER ON THE STONE PATH
Low three-quarter shot: Haru walks hand-in-hand with grandfather Jirō up a narrow cobblestone path flanked by hundreds of paper lanterns. She carries her own small red lantern. Fireflies drift between them. His wooden cane taps softly.

SCENE 3 — THE FESTIVAL SQUARE
Symmetrical wide shot of the festival square. Five hundred red and gold paper lanterns hang in a grid pattern overhead. Wooden stalls line the perimeter. Haru walks into frame from the right, her lantern catching the warm amber glow from above. A few villagers in yukata move gently through the square.

SCENE 4 — GOLDFISH AT THE WOODEN STALL
Close-up on Haru's hands cupped around a small paper cup containing a single shimmering goldfish. Riku, the neighbor boy, stands just off-frame holding his plastic bag with his own goldfish, grinning. Aged wooden planks. Lantern light reflects on the water. This moment is holy.

SCENE 5 — MR. TANAKA PLAYS THE SHAMISEN
Medium shot of Mr. Tanaka, the elderly shamisen musician, seated on a small weathered wooden stage strung with lanterns. His fingers move across the strings with the precision of sixty years. The audience — maybe twenty villagers of all ages — sit cross-legged on straw mats, some holding small children on their laps.

SCENE 6 — THE SKY LANTERN RELEASE
Climactic wide shot from behind the villagers looking up at the night sky as hundreds of glowing sky lanterns rise from the village square into a star-filled sky. Haru stands in the foreground, small red lantern clutched to her chest, watching. Grandfather Jirō is just behind her, one hand gently on her shoulder. The mountain peaks form a dark silhouette ring around the rising lights. This is what they'll remember.
```

**What to say BEFORE pressing Enter:**

> *"This brief is about 1,100 characters. Six scenes. Each scene has characters, framing, palette hints, and emotional beats. The naive way to send this to an LLM would be to paste the whole thing into a chat and ask it to generate 6 images — burning ~1,500 input tokens just parsing the prompt, then another ~500 per scene × 6. That'd be about 4,500 tokens before a single image is generated. Watch what actually happens."*

Press Enter.

**What the audience will see** (in this order):

1. Within 500ms, a system message:
   ```
   Project created. Generating 6 scenes...
   ```
2. Within 1 second, `Generating scenes...` notification
3. Over the next ~30-60 seconds, **6 image cards appear progressively**, each with:
   - **The same watercolor aesthetic** (because CreativeContext's `style: "Studio Ghibli..."` is injected)
   - **Haru recognizable in every shot** (indigo yukata, pigtails, red ribbons)
   - **Grandfather Jirō consistent** when he appears
   - **The amber/indigo/cherry palette** holding across all 6 cards
4. Progressive chat updates: `Generating scenes — 2/6 done`, `4/6 done`, `All 6 scenes ready.`
5. Final completion line at the bottom of the chat:
   ```
   Done in 47.2s — project: 6 scenes planned, scenes: 6/6 done — 1,920 tokens (1,580 in / 340 out)
   Project "A cinematic short film set in a tiny mount…" — 1,920 tokens across 1 turn
   ```

**The money moment:** point at that final token line.

> *"One thousand nine hundred tokens. For a complete 6-scene storyboard with consistent characters and art direction. The naive implementation would have used somewhere between twelve and eighteen thousand. That's a 6–9× token savings for the same creative output — and it's mostly because the preprocessor parsed the scene structure client-side without asking an LLM to do it."*

**For the engineers in the room:** the preprocessor at `lib/agents/preprocessor.ts` runs a regex over the brief, extracts 6 `{title, description, prompt}` tuples, calls `project_create` directly with structured data, and then sends a **40-token instruction** to the LLM saying "project created, call project_generate". The LLM never sees the 1,100-character brief. That's the [Q3a-AllLayers] Layer 1 token savings win in action.

---

## ACT III — Human-in-the-Loop Iteration (45 seconds)

**What it demos:** Iterative refinement with specific user feedback. The agent doesn't regenerate everything — just the scene you asked about, respecting the project context and the original scene intent.

**Audience context:** pick a scene that didn't quite match what you imagined. Let's say SCENE 4 (the goldfish close-up) came out too bright or missed the "holy moment" feeling. Type:

```
scene 4 feels too bright and generic — regenerate it with deeper shadows around Haru's face, a single tear glistening on her cheek, and the goldfish in perfect stillness like it senses the weight of this moment
```

**What the audience will see:**

1. Agent calls `project_iterate(scene_index=4, feedback="...")`
2. The existing SCENE 4 card gets **replaced** on the canvas (not duplicated)
3. The new image has the feedback visible — darker around the face, a small tear, a still goldfish
4. Chat shows:
   ```
   Done in 8.3s — scenes: 1 regenerated — 380 tokens (310 in / 70 out)
   Project "A cinematic short film set in a tiny mount…" — 2,300 tokens across 2 turns
   ```

**What to say:**

> *"Notice the project running total just ticked up from 1,920 to 2,300 — adding 380 tokens for the iteration, not 380 × 6 for regenerating everything. The iteration respects every other scene, respects the CreativeContext, and only modifies the one thing I asked about. This is how directors actually work — you're not rewriting the whole film, you're refining one shot."*

**Human-in-the-loop point:** *"I gave that feedback in natural language — no field forms, no JSON, no 'click here to regenerate with new seed'. I just described what I wanted and the agent translated my intent into the right tool call."*

---

## ACT IV — Spatial Canvas Organization (15 seconds)

**What it demos:** Pack tool execution. Pure mechanical layout — zero LLM tokens. Demonstrates that not every action in the agent has to go through a model.

Type:

```
/organize narrative
```

**What the audience will see:**

1. Within ~200ms, all 6 cards snap into a **single horizontal row** in scene order
2. Chat shows something like:
   ```
   Canvas organized: narrative (1 row, 6 cards)
   ```

**What to say:**

> *"That was a tier-zero action — the agent SDK's routing policy recognized that 'organize' is mechanical, not creative, so it didn't burn a single token on an LLM call. It just called the canvas pack's `narrativeLayout()` function directly. Layout: instant. Tokens: zero. This is Layer 4 routing in action — cheapest-thing-that-works."*

**For the engineers:** `lib/agents/runner-adapter.ts::buildStoryboardRunner` registered `canvas_organize` via `registerCanvasPack({ tools, store: canvasStore })` from `@livepeer/agent-pack-canvas`. That's a tool with `mcp_exposed: false` (it's storyboard-internal, not one of the 8 MCP-exposed curated tools), and its `execute` just calls `autoLayout()` or `narrativeLayout()` from `packages/agent-pack-canvas/src/layout.ts`. No LLM in the path at all.

---

## ACT V — Veo 3.1 Animation with Native Audio (90 seconds)

**This is the money shot of the demo.** Take your time.

**What it demos:**
- The `animate` action routing fix (Phase 13 + the post-Phase 13 veo-i2v patch)
- Google's Veo 3.1 via fal.ai via the BYOC orch
- **Native synchronized audio** (the LTX-impossible differentiator)
- Cross-capability consistency (Veo respects the source image's style)

**Step 1:** Right-click SCENE 6 (the sky lantern release) on the canvas → click "Animate with AI"

Alternatively, type:

```
animate scene 6 (the sky lantern release): slow upward tilt following the lanterns into the night sky, subtle wind drift left to right, 8 seconds, ambient audio — distant temple bell, soft crowd murmur, wind through the cedar trees, one quiet shamisen note held in the distance
```

**What to say while the tool call is dispatched:**

> *"This scene is the emotional climax of our short film. I want Haru and her grandfather watching sky lanterns rise into the night, with ambient audio of the festival dying out around them — wind, crowd, the distant temple bell, a held shamisen note. The kind of thing a Hollywood sound designer would spend an hour on."*

**What the audience will see:**

1. Chat: `tool_call: create_media { action: "animate", capability: "veo-i2v", source_url: "..." }`
2. `Generating scenes...` (or equivalent progress message)
3. **30–90 seconds of wait time.** Use it to talk. This is routing through: storyboard → `/api/agent/gemini` proxy → core `AgentRunner` → `StoryboardGeminiProvider` → create_media tool → SDK `/inference` → BYOC orch → fal.ai → Google Gemini API → Veo 3.1 long-running operation → poll `operations/{id}` every few seconds → returns video URL.
4. A **video card** appears on the canvas
5. **Click play.** The audience hears:
   - The wind
   - The distant crowd
   - The temple bell
   - The shamisen
   - All synchronized to the motion

**The moment that wins the room:** do NOT explain the audio in advance. Let people hear it first. Then say:

> *"Did you hear that? Every single thing you just heard — the wind, the bell, the crowd, the shamisen note — was generated by Veo 3.1 as part of the same forward pass as the visuals. This is NOT a video overlaid with a separate audio track. It's a single 8-second output from one model call. This is why Google Veo 3.1 matters. And this entire pipeline runs through our BYOC orchestrator via fal.ai — the Daydream SDK abstracts all of that complexity into a single `veo-i2v` capability. Our agent didn't even know it was calling Google."*

**Read the token update:**

```
Done in 61.4s — media: 1 created (veo-i2v) — 280 tokens (220 in / 60 out)
Project "A cinematic short film set in a tiny mount…" — 2,580 tokens across 3 turns
```

**The line for the deck:**

> *"Two thousand five hundred eighty tokens for a complete 6-scene cinematic storyboard INCLUDING an 8-second animated climax with native audio. For comparison: one GPT-4 response to the question 'explain quantum computing' is about 800 tokens. This full short film was about 3× that."*

---

## ACT VI — Live Video-to-Video Creative Direction (90 seconds)

**What it demos:** The Scope LV2V streaming pipeline. Your webcam → fal.ai Scope runner → transformed video back in real-time. Natural-language creative direction updates mid-stream with zero restart.

**Setup:** Click the **📹 Camera widget** in the top-right. Allow webcam access if you haven't already. A new stream card appears on the canvas showing your raw webcam feed.

**Step 1:** In the stream card's inline agent input (bottom of the card), type:

```
transform my webcam into a scene from our lantern festival film — watercolor, warm amber lantern glow, soft painterly textures, keep my face visible
```

**What the audience will see:**

1. Chat + stream card status: `Starting Scope stream...`
2. Within ~8 seconds, the raw webcam feed is **replaced by a stylized version**. You're now appearing in the Ghibli aesthetic, with amber lantern glow, soft watercolor strokes — the same aesthetic as the storyboard cards above.
3. The stream keeps running — 10 frames/sec, FPS + pub/recv stats visible on the card.

**Step 2 — change direction mid-stream (this is the wow moment):**

While the stream is still running, in the same inline agent input type:

```
/preset dreamy
```

**Within 1-2 seconds the output style shifts** — same you, same position, but the aesthetic morphs to softer, more ethereal. No restart. Live parameter update.

**Then:**

```
/noise 0.9
```

**Immediate noise scale change** — the image starts ignoring your face more and becoming more abstract. You're now a ghost of yourself in the scene.

**Then:**

```
/reset cache
```

**Instant dramatic style shift** — the pipeline flushes its KV cache and re-anchors on the current frame. Visible transformation.

**Then back to film aesthetic:**

```
/preset cinematic
```

**What to say during this:**

> *"Every one of those commands — `/preset dreamy`, `/noise 0.9`, `/reset cache` — is routed through our Scope domain agent, which translates natural language and slash shortcuts into precise Scope pipeline parameters. The stream itself runs on GPUs in the Livepeer orchestrator network — this is decentralized inference, not a single-node call. And the agent's routing policy tagged all those commands as tier-zero mechanical, so they're burning zero LLM tokens. I can direct this stream like a cinematographer — 'more dreamy', 'less noise', 'fresh cache' — and the pipeline responds in real time."*

**Step 3 — Stop the stream** by clicking the stop button on the stream card. The card remains on the canvas as a historical artifact.

**For the engineers:** the Scope pipeline speaks through `scope_start`, `scope_control`, `scope_stop`, `scope_preset`, `scope_graph`, `scope_status` tools — 6 tools exposed to the agent, all `mcp_exposed: false`. The slash commands (`/preset`, `/noise`, `/reset`) route through `lib/skills/commands.ts` which then calls `scope_control` directly on the active stream. The storyboard's routing policy never burns a tier-1+ LLM call on these — they're mechanical pipeline updates.

---

## ACT VII — Cross-Agent Continuity (60 seconds)

**What it demos:** All three LLM plugins (Gemini, Claude, OpenAI) share **one** `ToolRegistry`, **one** canvas, **one** project store. Switching agents mid-session is stateless.

**Step 1:** Click **⚙ Settings** → change agent from **Gemini** to **Claude** → close settings.

Type in chat:

```
the lanterns rise as haru watches but something beautiful happens — a single sky lantern drifts back down and lands gently in her small outstretched hands. add this as scene 7 of the same project, keep the same visual style and mood
```

**What the audience will see:**

1. Chat shows `[Claude]` prefix in the plugin logs (if DevTools is open)
2. Claude calls `project_iterate` or `create_media` to add a 7th card to the SAME project
3. New card appears on the canvas **in the same Ghibli aesthetic** as the original 6 because the CreativeContext is shared across plugins via zustand
4. Chat:
   ```
   Done in 6.1s — scenes: 1 added — 420 tokens (340 in / 80 out)
   Project "A cinematic short film set in a tiny mount…" — 3,000 tokens across 4 turns
   ```

**Step 2:** Click **⚙ Settings** → change to **OpenAI** → close.

Type:

```
iterate scene 1 (mist over the village): add a tiny flickering lantern in a distant window as a sign of life. same style.
```

1. OpenAI calls `project_iterate(scene_index=1, feedback="...")`
2. SCENE 1 card gets replaced with the update
3. Token total ticks up again

**What to say:**

> *"Three different LLMs — Google's Gemini, Anthropic's Claude, and OpenAI's GPT — just worked on the same short film. They shared the same canvas, the same project state, the same creative context, the same tool registry. Because they all implement the SDK's single LLMProvider interface, they're interchangeable at runtime. No re-initialization, no lost state, no reloading. Try this on any other AI creative tool — good luck."*

**Switch back to Gemini** for the rest of the demo (it's the default and has the best storyboard integration testing).

---

## ACT VIII — The Economics (15 seconds)

Point at the chat's bottom line:

```
Project "A cinematic short film set in a tiny mount…" — 3,400 tokens across 5 turns
```

**The pitch:**

> *"Three thousand four hundred tokens. Across five turns. That includes:*
>
> - *A 6-scene storyboard with consistent art direction*
> - *A regenerated scene based on my natural-language feedback*
> - *An 8-second cinematic animation with native audio*
> - *An extra scene added by a different LLM*
> - *Another iteration by yet another LLM*
>
> *For comparison: this entire short film cost about the same as 4-5 paragraphs of ChatGPT output. That's not an approximation — that's the number right there at the bottom of the chat, live.*
>
> *The storyboard app is proof that the right architecture — client-side preprocessing, streaming tool-use loops, shared tool registries, and smart model routing — can produce Hollywood-quality creative output for a fraction of the token cost of naive AI tools. That's the Livepeer thesis: high quality doesn't have to mean high cost."*

**Screenshot this moment.** The 3,400-token total next to a canvas full of cinematic Ghibli frames + a video card with audio is the single most powerful slide you can put in any deck.

---

## ACT IX — The Safety Net: The Clarifier (optional, 30 seconds)

**When to use this:** if any earlier step breaks, or if you have 30 seconds of spare time, or if someone in the audience asks "what happens when the prompt is too vague?"

Type in chat:

```
make me something cool
```

**What the audience will see:**

1. No image. No video. No error.
2. Instead, an agent response like:
   > *"Happy to help — what medium are you thinking (a single image, a multi-scene story, a live transformation), and should it connect to the lantern festival film or be something entirely new?"*

**What to say:**

> *"When the agent doesn't have enough context, it doesn't hallucinate a stock image or give up with 'please rephrase.' It converses. Every other creative AI tool in the market assumes you know what you want. This one meets you where you are. That's the most human thing about it."*

**For the engineers:** this is the Phase 13.5b clarifier fallback. When `runStream` finishes with no text events AND no tool_call events (Gemini returns empty STOP on vague prompts + many tools), the plugin fires a **second** `runStream` call with a **tool-less** ToolRegistry and a meta-prompt asking Gemini to generate 2-3 clarifying questions. Result streams back as normal text events. No hardcoded templates. The clarifier itself is ~200 input / 60 output tokens — dirt cheap for the UX win.

---

## Post-Demo — What to Emphasize in Q&A

**"How much did this cost us?"**
Roughly 3,400 tokens across the entire flow — including the Veo 3.1 video. At Gemini Flash pricing that's **~$0.003**. The fal.ai Veo call is the real cost (~$0.50 for 8 seconds of 720p video with audio), but that's inference cost, not LLM cost — and our agent used ~60 LLM tokens to orchestrate the whole Veo call.

**"How long did that take?"**
~10 minutes of wall-clock time, of which ~4 minutes was actual inference waiting. Most of it was me narrating.

**"Can I make it longer / shorter / different style / a cyberpunk version?"**
Yes. Change `/context gen` once at the top and everything downstream inherits it. The whole demo script works with any creative concept — the Furukawa festival is just illustrative. I've also run it as a Tuscan courier story, a Tokyo cyberpunk detective, and a Lake Como e-bike adventure.

**"Does the agent work without the LLM for simple tasks?"**
Yes. `/organize`, `/preset`, `/noise`, `/reset`, navigation commands, and capability listing all run at tier-0 with zero LLM tokens. That's Layer 4 routing.

**"What if I want a different visual aesthetic mid-demo?"**
`/context edit style cyberpunk neon noir` — instant style swap, no re-generation needed. The next prompt will apply the new style.

**"Is Veo 3.1 really shipped? I thought it was preview?"**
Veo 3.1 is in **paid preview** on Google's Gemini API (models `veo-3.1-generate-preview`, `veo-3.1-lite-generate-preview`, `veo-3.1-fast-generate-preview`). We route through fal.ai which is production-grade. So yes, it's really shipped — just not GA from Google.

**"What's the difference between Veo and LTX that I just saw?"**
- **Veo 3.1**: 720p/1080p/4k, up to 8 seconds, **native synchronized audio**, better motion consistency, Google-trained
- **LTX 2.3**: 512p, up to 5 seconds, **silent**, faster + cheaper, fal-trained
- We default animate calls to Veo now (as of Phase 13 post-fix). LTX is the fallback if Veo isn't registered.

**"Can I run this without the Daydream API key?"**
The storyboard itself, yes (the Gemini/Claude/OpenAI plugins would still work for text-based chat, and the agent SDK works end-to-end with any LLM). But you need the Daydream API key to call the BYOC orchestrator for image/video/audio inference. No key = no images, no Veo videos, no live streams. Get one at daydream.live.

**"Is this the agent SDK I could use in my own app?"**
Yes. It's `@livepeer/agent` on npm. There's a practical usage guide at `docs/superpowers/notes/agent-sdk-guide.md` in this repo. 10-line hello world, full provider abstraction, the domain packs, the CLI, and the integration pattern for Next.js browser apps.

---

## Timing breakdown (for rehearsal)

| Act | What | Duration |
|---|---|---|
| Pre-flight | Setup checklist | 60s (before audience) |
| I | `/context gen` | 30s type + 2s inference |
| II | 6-scene storyboard | 60s talk + 45s inference |
| III | Iterate SCENE 4 | 30s talk + 10s inference |
| IV | `/organize narrative` | 10s (instant) |
| V | Veo 3.1 animation | 30s talk + 60s inference (narrate during wait) |
| VI | LV2V streaming | 90s (multi-step) |
| VII | Cross-agent continuity | 60s (two prompts) |
| VIII | Token total pitch | 15s |
| IX | Clarifier (optional) | 30s |
| — | **Total** | **~12 min** |

If you're running short: skip ACT III (iteration) and ACT VII (cross-agent). Keeps the narrative tight while still hitting the creativity + Veo + streaming + token win.

If you're running long: add a second multi-scene brief with a completely different style (e.g., cyberpunk) after ACT V to demo the multi-project preprocessor splitting them into separate projects.

---

## If something goes wrong

**Symptom: `Couldn't process that. Try rephrasing?`**
This was a bug, fixed in commit `b468616`. If you're on an older build, just retry once — Gemini sometimes returns empty STOP on the first call.

**Symptom: Generated scenes all look like generic AI art, not Ghibli**
CreativeContext didn't get saved properly from ACT I. Re-run the `/context gen` and verify you see the `Context created: ...` confirmation before proceeding.

**Symptom: `No output from veo-i2v — try a different prompt`**
The image card you right-clicked may not have a valid `url` field (cards in error state can't be animated). Pick a different card — any card that's rendered cleanly will work.

**Symptom: Scope stream won't start / stays black**
Check that `sdk.daydream.monster/streams` shows no zombie streams. If it does, hit `https://sdk.daydream.monster/streams/cleanup` as POST. See `CLAUDE.md` → "LV2V Failure Pattern" for the full recovery runbook.

**Symptom: Stream works but audio is silent on the Veo video**
You're accidentally looking at an LTX video card (from an older animate call that didn't use the Veo routing). Check the tool_call in chat — if it says `capability: "ltx-i2v"`, the Veo routing didn't kick in. Most likely the live capability registry didn't load in time. Refresh the page and retry.

**Symptom: `Gemini error: GEMINI_API_KEY not configured`**
You're running against an old Vercel deployment built before env vars existed. Redeploy: `vercel deploy --yes` from the repo root, or just use http://localhost:3000.

---

## Key SDK concepts the demo surfaces (for the engineering Q&A)

| Capability | Where it's implemented | What demos it |
|---|---|---|
| CreativeContext persistent memory | `lib/agents/session-context.ts` + `WorkingMemoryStore.setCriticalConstraints` | Act I, visible in Act II's consistency |
| Client-side scene preprocessor | `lib/agents/preprocessor.ts` + `@livepeer/agent/preprocessor/multi-project` | Act II token total |
| `runStream` event loop | `packages/agent/src/agent/runner.ts::runStream` | Every progressive `Generating scenes — N/6 done` message |
| Domain pack tools | `packages/agent-pack-projects` + `packages/agent-pack-canvas` | Acts II, III, IV |
| Routing policy Layer 4 | `packages/agent/src/routing/policy.ts` | Act IV (`/organize`) + Act VI (`/preset`, `/noise`) — tier 0 mechanical |
| Veo 3.1 routing fix | `lib/tools/compound-tools.ts::selectCapability` commits `dc0e0f0` + `a6394bc` | Act V, the audio is the proof |
| LV2V streaming | Scope pipeline via `scope_*` tools, `/opt/byoc/.env` capabilities | Act VI |
| Cross-provider tool sharing | `lib/agents/runner-adapter.ts::buildStoryboardRunner` + three Storyboard*Provider shims in `storyboard-providers.ts` | Act VII (switch agents, same canvas) |
| Per-project token accounting | `lib/projects/store.ts::addProjectTokens` + plugin usage event handlers | Act VIII running total |
| Clarifier fallback | `lib/agents/gemini/index.ts::sendMessage` empty-STOP recovery | Act IX |
| Multi-line slash parsing | `lib/skills/commands.ts::parseCommand` `[\s\S]*` fix | Enables Act I's multi-line `/context gen` |

If anyone asks *"show me where in the code this happens"*, these are the file paths to point at.

---

## One-sentence description for the deck

> **"A creative storytelling agent that converses with you, generates 6-scene cinematic storyboards with consistent art direction, animates them with Google Veo 3.1 native-audio video, transforms your webcam live into the film's aesthetic, and keeps track of every token along the way — across three interchangeable LLM providers — for less than a nickel per story."**

Screenshot the final state of the canvas + chat at the end of ACT VIII. That's your hero image.
