# Demo Script — Canadian Teen E-Bike Ad Campaign

A 12-minute presentation-ready demo script that showcases the storyboard app + @livepeer/agent SDK as a **commercial creative tool** targeting an advertising audience. Unlike the "Last Lantern Festival" narrative demo in `demo-script-prompt.md`, this one frames the agent as a brand-creative tool: locked art direction, consistent product hero shots, production-ready ambient audio, and live transformation of the presenter into the campaign aesthetic.

**Target audience:** ad agency creatives, brand managers, marketing directors, investor showcases where the pitch is "AI creative for commerce."

**Runtime:** ~12 minutes (8 narration + 4 inference).

**Expected total cost:** ~3,000-4,000 tokens for the entire campaign including the Veo 3.1 animated hero shot and live LV2V stream. Roughly $0.003 of LLM spend.

---

## Pre-flight checklist

1. Open `http://localhost:3000` (local) or `https://storyboard-feat-agent-sdk.vercel.app` (preview)
2. Paste Daydream API key into Settings → SDK API Key
3. Default agent: **Gemini**
4. Clear canvas + clear chat
5. Allow webcam access
6. Open DevTools Console (filter `[`) on a second screen if engineers are present
7. Zoom browser to 110% for readability

---

## ACT I — Lock the creative direction (30 seconds)

**What it demos:** `/context gen` — one paragraph of brand creative direction that carries into every future prompt automatically.

**Copy-paste into chat:**

```
/context gen A high-energy advertising campaign for an electric bike brand targeting Canadian teens aged 14 to 18. Visual style: crisp modern commercial photography with a slight filmic grain, shallow depth of field, vibrant color grade, GoPro-style dynamic angles, aspirational but authentic — never staged or stock. Primary characters: Maya, a 16-year-old Métis girl with braided dark hair, helmet always on, wearing a plaid flannel over a band tee and distressed jeans, confident grin. Jayden, her 15-year-old best friend, Chinese-Canadian, tall and lanky, denim jacket covered in enamel pins, always first to try something. A rotating cast of 2-3 friends of diverse backgrounds, no adults ever in frame. Setting: real Canadian places — a skate park in East Vancouver, Mont-Royal bike paths in Montreal, Toronto waterfront at golden hour, a Calgary suburb cul-de-sac, coffee shops in Halifax. Every shot shows the e-bike as the hero — sleek matte frame, glowing LED accents, integrated battery, a brand logo visible but not shouty. Palette: northern cool tones with warm pops — deep forest green, sunset orange, matte charcoal, glacier blue, cream white, one bright accent of Canadian red. Rules: no dialogue, one brand hero-shot per scene, weather varies across scenes to show range (sun, light rain, dusk, snow-dusted), bikes always clean, riders always wearing helmets and reflective strips without making it preachy. Mood: confident freedom, teenage possibility, the feeling of your first real taste of independence — north-of-the-border cool.
```

**Expected chat output:**
```
✓ Context created: commercial photography, Maya + Jayden, Canadian locations
```

**What to say:**
> *"One paragraph. Every character, every location, every brand rule, every palette constraint, every mood direction. The agent just parsed all of that into six structured fields and saved them as a persistent creative DNA. From now on, I don't have to type any of these details again. Watch what happens when I ask for the reel."*

**For engineers:** DevTools → Application → Local Storage → `storyboard_session_context` contains the structured object. That object gets marshaled into every future runStream call's WorkingMemoryStore critical constraints.

---

## ACT II — 6-scene ad reel (90 seconds)

**What it demos:** multi-scene preprocessor + consistent art direction across scenes. The token savings pitch.

**Copy-paste into chat:**

```
SCENE 1 — MORNING ROLLOUT
Maya kicking off the garage stand of her matte charcoal e-bike in a Calgary suburb driveway at 7am. Low-angle shot, morning frost on the grass, warm amber sunlight breaking over fence-tops. She's pulling her helmet on mid-motion, one leg already over the frame. The LED battery indicator glows in the shadow of the bike.

SCENE 2 — THE BRIDGE CROSSING
Jayden riding across a Toronto waterfront bike path at golden hour, Lake Ontario glittering behind him. Three-quarter profile shot with the sun low and behind, halo of backlight on his denim jacket. He's grinning, one hand off the bars waving at someone off-frame. Downtown Toronto skyline soft-focus in the background.

SCENE 3 — SKATE PARK MEETUP
Wide overhead drone-style shot of Maya, Jayden, and three friends arriving at the East Vancouver skate park. Five matte e-bikes lined up at the lip of the bowl, skaters in the background mid-trick. The friends exchanging fist bumps. Moody overcast Vancouver sky.

SCENE 4 — RAINY CITY DASH
Close-up action shot of Maya navigating a rain-slicked Mont-Royal bike path in Montreal. Water spray arcing off her tire, city streetlights beginning to flicker on behind her, her face lit by the LED display on the handlebar. Rain droplets frozen mid-air. Determined smile.

SCENE 5 — SUNSET COFFEE STOP
Maya and Jayden parking their e-bikes outside a Halifax harbor coffee shop at sunset. Pink-orange sky, waves in the background. Maya adjusting the lock, Jayden already halfway through the door with a to-go cup in hand. The bikes are clearly the most beautiful things in the frame.

SCENE 6 — NIGHT RIDE HOME
Wide cinematic shot of Maya riding home alone on a quiet Calgary suburb street at dusk, the e-bike's LEDs casting a soft glow ahead of her, reflective strips on her helmet catching the streetlamps, snow-dusted lawns on either side. Stars just becoming visible. Peaceful, confident, the last ride of a good day.
```

**What to say while it runs:**
> *"This brief is about 1,100 characters. Six scenes. Every scene has specific location, framing, product details. Watch two things: how fast this generates, and how consistent the characters, palette, and brand feel stay across all six shots — without me repeating any of the ACT I context."*

**Expected final line in chat:**
```
Done in ~45s — project: 6 scenes planned, scenes: 6/6 done — ~2,500 tokens (2,000 in / 500 out)
Project "A high-energy advertising campaign for an el…" — ~2,500 tokens across 1 turn
```

**The money moment — point at the token total:**
> *"Two thousand five hundred tokens. Six fully-branded storyboard frames with consistent characters, palette, and product hero. The naive way to do this with ChatGPT plus DALL-E would consume 12,000-18,000 tokens just parsing the brief and repeating it per scene. We're at 20% of that cost for the same creative output — because the preprocessor parsed the scene structure client-side without asking any LLM to do it. That's one layer of the token-savings architecture. There are four more layers."*

---

## ACT III — Human-in-the-loop iteration (30 seconds)

**Optional.** Pick a scene that didn't quite nail the brand feel and refine it in natural language.

Example feedback:

```
scene 4 feels a bit too posed — regenerate it with more spontaneity, Maya mid-laugh as water splashes up, her hair whipping behind her, less "fashion photo" and more "caught in the moment", keep the LED display clearly visible
```

**Expected behavior:** `project_iterate` regenerates only scene 4. The card on the canvas gets replaced (not duplicated). Token cost ~400 tokens.

**What to say:**
> *"Watch the running project total update from 2,500 to 2,900 — not a full regen, just the delta for one scene refinement. This is how actual ad directors iterate: 'the model looks too posed, give me one with more movement.' Natural language in, refined shot out, 400 tokens."*

---

## ACT IV — Organize the reel (15 seconds)

```
/organize narrative
```

All 6 cards snap into a horizontal row in scene order. Tier-0 mechanical operation — **zero LLM tokens**.

> *"The reel is laid out. Zero tokens burned on that. This is the routing policy — 'organize' is a mechanical action, not a creative one, so the SDK's router sends it straight to a pack function without ever calling an LLM."*

---

## ACT V — Veo 3.1 animates the rainy Montreal dash (90 seconds — the hero moment)

**Why SCENE 4:** strongest motion potential (bike in rain, water arcs, rider lit by LED display), best audio material (rain, tire spray, city hum, wind, motor whoosh), most obvious product hero moment. It's the reel moment any e-bike brand targeting Gen Z would share.

### Step 1 — Start the animation

Right-click **SCENE 4** on the canvas → **Animate with AI**. Or type:

```
animate scene 4 with Maya on the rainy Montreal bike path: 8 seconds, slow push-in toward her face as she glides through a puddle, tire spray arcing in slow motion, her rain-slick helmet catching passing streetlights, the LED display on the handlebar pulsing soft blue against her cheek, raindrops suspended mid-air then resolving as the camera settles on her determined smile, ambient audio: steady rain on pavement, tire hiss through wet asphalt, distant Montreal city hum, a single low electric whoosh from the e-bike motor, no music
```

### Narrate during the 30-90 second wait

> *"Watch — right-click any card in this storyboard, the agent knows it's an image from our active project, calls `project_iterate` under the hood, hands the image to Veo 3.1 with a motion prompt I just typed. Eight seconds of 720p video with native synchronized audio. NOT cut together from stock — every pixel AND every sound is generated in the same forward pass by Google's Veo 3.1 model. For an e-bike brand, your hero spot costs roughly what one take from a traditional shoot costs, and you get unlimited iterations."*

### The money moment

When the video card appears, **don't explain the audio in advance**. Click play. Let the room hear:

- **Steady rain** washing pavement
- **Tire hiss** as Maya passes through the puddle — spatial sound design tracking her motion
- **Distant Montreal city hum** — low traffic, streetlights buzzing
- **A single electric whoosh** from the e-bike motor — the product signature
- **No music** — because ad creatives license their own score

Then say:

> *"Every sound in that video — the rain, the tire through the puddle, the city hum, the electric whoosh — was generated by Veo 3.1 from my one-line audio description. The music is deliberately absent because a real ad agency would license their own score. But the ambient bed? Production-ready. For a demographic that watches reels with the sound ON, that ambient audio IS the product."*

### Token check

```
Done in 61.4s — media: 1 created (veo-i2v) — 280 tokens (220 in / 60 out)
Project "A high-energy advertising campaign for an el…" — ~2,780 tokens across 3 turns
```

> *"Two thousand seven hundred and eighty tokens. Six branded storyboard frames plus an 8-second cinematic hero shot with production audio. That's the entire creative portion of an ad brief. Every asset, every iteration, every cost — live on one screen, roughly six cents of LLM spend."*

**Screenshot this frame** — canvas with 6 branded cards + 1 playing Veo video + chat token total. Hero slide for the deck.

### Why the prompt works

| Phrase | Reason |
|---|---|
| `slow push-in toward her face` | Motion verb → hasMotion regex matches → routes to veo-i2v not kontext-edit |
| `8 seconds` | Explicit duration → belt-and-suspenders video intent signal |
| `tire spray arcing in slow motion` | Concrete motion action Veo handles well — particle physics + slow motion |
| `LED display pulsing soft blue against her cheek` | Product hero in motion — the brand LED lit onto the rider's face |
| `raindrops suspended mid-air then resolving` | Signature Veo capability — frame-to-frame particle physics like Red camera at 240fps |
| `ambient audio: rain... hiss... hum... whoosh... no music` | Explicit sonic palette. Comma-separated audio direction is the shape Veo's audio pipeline parses best. "No music" prevents auto-scored stock music |

---

## ACT VI — LV2V transforms the presenter into the ad (90 seconds)

**Why this closes strong:** you've shown a storyboard, then an animated clip. Now you put the presenter ON the brand — they become Maya or Jayden live, in real-time, transforming their webcam feed through the same aesthetic that's on the canvas. The room will react.

### Step 1 — Start the webcam widget

Click the **📹 Camera widget** button in the top-right. Allow webcam if prompted. Raw webcam feed appears in a stream card.

### Step 2 — First transformation

In the stream card's inline agent input (bottom of the card), type:

```
transform my webcam into a scene from this Canadian e-bike ad campaign: matte commercial photography grade, slight filmic grain, northern cool tones with warm pops, as if I'm the rider Maya riding through golden hour Toronto, soft halo backlight, shallow depth of field, keep my face clear and recognizable but shift the color grade
```

### What the audience sees (8 seconds)

1. ~2 sec: `Starting Scope stream...`
2. ~3 sec: `Stream live`
3. ~5-8 sec: raw webcam feed replaced by stylized version. You're in the ad campaign's aesthetic — matte color grade, filmic grain, cool northern tones. Face recognizable, surroundings shifted.
4. Stream runs at ~10 fps with FPS + pub/recv stats on the card.

### What to say

> *"This is Scope, Livepeer's live video-to-video pipeline, running on decentralized GPUs. My webcam feed streams up to an orchestrator, transforms frame-by-frame, streams back — about 10fps end-to-end. The style is locked to the same brand context we've been using this whole session. I AM the ad now."*

### Step 3 — Live direction (the wow)

While the stream is still running, type these commands in sequence with 2-3 second pauses between each:

**Command 1 — match SCENE 2 (Toronto golden hour):**
```
/preset cinematic
```
Watch: transformation shifts toward warmer golden tones, higher contrast, more filmic look. You're at golden hour on a waterfront.

**Command 2 — match SCENE 4 (rainy Montreal):**
```
swap to a rainy Montreal evening vibe — cooler blues, streetlight reflections, drizzle in the air around me, keep the face clear
```
Watch: aesthetic shifts to cool blue-grey, water texture appears in ambient pixels, streetlight bokeh forms behind you.

**Command 3 — push creative boundaries:**
```
/noise 0.85
```
Watch: output becomes more abstract — you turn into a ghost rider on a cyberpunk bike path. Intentionally over-stylized to show range.

**Command 4 — snap back to brand:**
```
/reset cache
/preset cinematic
```
Watch: immediate return to locked brand aesthetic. Two commands, two seconds, back on brand.

### What to say during those commands

> *"Four commands. Four aesthetic modes. Zero restarts. Every command you just saw — `preset cinematic`, the natural language direction, `noise 0.85`, `reset cache` — was recognized by the Scope domain agent as a tier-zero mechanical instruction. No LLM involvement. Pipeline parameters updated in-place. Zero tokens burned. If you were directing this ad shoot for real, you could adjust the mood faster than a colorist could drag a slider — and cheaper than one DoP invoice."*

### Step 4 — Stop and close

Click **stop** on the stream card. The stream ends; card stays on canvas.

> *"The stream card stays as a reference frame. If I want, I can right-click it and animate it with Veo 3.1 too — turning a live transformation into a polished 8-second clip. The entire pipeline composes. One-line creative direction all the way down. This is what the whole system together looks like."*

### Alternative aesthetic swaps for ACT VI command 2

Pick whichever matches the scene you want to reference:

| Swap to SCENE | Command |
|---|---|
| SCENE 3 (skate park wide overhead) | `wide overhead drone angle, overcast Vancouver sky, urban concrete and graffiti, keep my face sharp` |
| SCENE 5 (Halifax sunset harbor) | `Halifax harbor at sunset, pink-orange sky, warm water reflections, I'm parking at a coffee shop, shift the warm tones up` |
| SCENE 6 (Calgary night ride home) | `quiet Calgary suburb at dusk, stars just appearing, streetlamps casting warm pools, soft ambient peace` |

---

## ACT VII — Cross-agent continuity (60 seconds, optional)

**What it demos:** three LLM plugins share one canvas, one project, one tool registry.

Click Settings → switch agent to **Claude** → close settings.

```
Maya rides further than she ever has before — to a hilltop lookout above the Halifax harbor where she sees the city lights below and the first stars above. Add this as scene 7 of the same project, keep the same style and mood, feature the e-bike prominently with its LEDs on.
```

Claude calls `project_iterate` (or `create_media` targeted via the scene 7 append) to add the 7th card in the same Ghibli aesthetic as the first 6. CreativeContext is shared across plugins via zustand.

Click Settings → switch to **OpenAI** → close.

```
iterate scene 1 to have a subtle bird just taking flight in the upper corner, same style
```

OpenAI regenerates scene 1 with the addition. Running total ticks up.

**What to say:**
> *"Three different LLMs — Google's Gemini, Anthropic's Claude, and OpenAI's GPT — just worked on the same ad campaign. Shared canvas, shared project state, shared creative context, shared tool registry. Because they all implement the SDK's single LLMProvider interface, they're interchangeable at runtime. No re-initialization, no lost state, no reloading. Try this on any other AI creative tool."*

Switch back to Gemini for the rest of the demo.

---

## ACT VIII — The economics (15 seconds)

Point at the chat's bottom line:

```
Project "A high-energy advertising campaign for an el…" — ~3,500 tokens across ~5 turns
```

**The pitch:**

> *"Three thousand five hundred tokens. Across five turns. That includes: a 6-scene branded storyboard with consistent art direction, a human-in-the-loop refinement of one scene, an 8-second Veo 3.1 hero shot with production audio, an extra scene added by Claude, an iteration of scene 1 by GPT. Across THREE different LLM providers. For roughly one penny of LLM spend.*
>
> *A traditional agency takes two weeks and two hundred thousand dollars to produce a brand's first ad reel. We just did the creative portion in twelve minutes for one cent. The Livepeer thesis is that high quality doesn't have to mean high cost — this is what that looks like in practice, for commerce."*

Screenshot the canvas + chat at this moment. Your hero image.

---

## ACT IX — Clarifier safety net (optional, 30 seconds)

If you have spare time or if any earlier act fails:

```
make me another one
```

**Watch:** no tool call, no generation, no error. Instead a natural-language response like:
> *"Happy to keep going — do you want to add another scene to the Canadian e-bike campaign, or pivot to a different brand? And if you're adding to the campaign, should it feature Maya, Jayden, or someone new?"*

**What to say:**
> *"When the agent doesn't have enough context, it doesn't hallucinate stock imagery. It converses. Every other creative AI tool assumes you know what you want — this one meets you where you are. That's the most human thing about it."*

---

## Q&A prep

**"How much did this cost?"**
About 3,500 LLM tokens across the whole session. Call it $0.003 at Gemini Flash pricing. The fal.ai Veo call for the 8-second animation is the real cost — roughly $0.50 — but that's inference, not LLM. Our agent used ~60 LLM tokens to orchestrate the Veo call.

**"How long did it take?"**
About 12 minutes of wall-clock time, of which ~4 minutes was actual inference. Most of it was narration.

**"Can you do a cyberpunk version / sneaker ad / luxury watch campaign?"**
Yes — change `/context gen` once at the top and everything downstream inherits. The whole flow works with any creative concept. I've also run this demo as a Tuscan courier narrative, a Japanese lantern festival short, and a cyberpunk detective story.

**"Does the agent work without the LLM for simple tasks?"**
Yes. `/organize`, `/preset`, `/noise`, `/reset`, navigation, and capability listing all run at tier-0 with zero LLM tokens.

**"How do you prevent the LLM from hallucinating product details that don't exist?"**
The CreativeContext rules field is injected into every prompt as a critical constraint. For this demo it says: "sleek matte frame, glowing LED accents, integrated battery, brand logo visible but not shouty, always helmet + reflective strips." Every generated scene inherits those rules. If the LLM invents a wrong product detail, you see it immediately and iterate — which is the whole point of the project_iterate path we just demoed.

**"Is Veo 3.1 actually shipped?"**
Veo 3.1 is in **paid preview** on Google's Gemini API — models `veo-3.1-generate-preview`, `veo-3.1-lite-generate-preview`, `veo-3.1-fast-generate-preview`. We route through fal.ai which is production-grade, so yes, it's really shipped for us — just not GA from Google.

**"Can this brand tool be used in production?"**
Yes. The `@livepeer/agent` SDK ships as an npm package. The storyboard app is open source. The Daydream SDK (`sdk.daydream.monster`) is production. Any agency could fork this today. The usage guide is at `docs/superpowers/notes/agent-sdk-guide.md`.

---

## Timing breakdown

| Act | What | Duration |
|---|---|---|
| Pre-flight | Setup before audience | 60s |
| I | `/context gen` | 30s + 2s inference |
| II | 6-scene reel | 60s talk + 45s inference |
| III | Iterate scene 4 | 30s talk + 10s inference |
| IV | `/organize narrative` | 10s |
| V | Veo 3.1 animation | 30s talk + 60s inference |
| VI | LV2V live transformation | 90s |
| VII | Cross-agent continuity | 60s |
| VIII | Token economics | 15s |
| IX | Clarifier (optional) | 30s |
| **Total** | | **~12 min** |

---

## Shorten / extend

**Short version (6 minutes):** skip ACT III and ACT VII. Keep: Act I, II, IV, V, VI, VIII. Still hits brand direction + token savings + Veo hero shot + live stream + economics.

**Extended (18 minutes):** add ACT VII + a second campaign mid-demo (same session, cyberpunk version) to show multi-project handling and preprocessor smart-split.

---

## One-line pitch for the deck

> *"A brand creative agent that converses with you, generates 6-scene branded ad reels with consistent art direction, produces hero shots with Google Veo 3.1 native-audio video, transforms your webcam live into the campaign aesthetic, and keeps track of every token along the way — across three interchangeable LLM providers — for roughly one penny per campaign."*

Screenshot the final canvas + chat at the end of ACT VIII. That's your hero slide.
