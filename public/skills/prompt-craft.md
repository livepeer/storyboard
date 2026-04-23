# Skill: Prompt Craft — Writing Cinematic Scene Prompts for Scope

## The 7-Layer Prompt Formula

Every scene prompt MUST include all 7 layers. This is what separates a weak one-liner from a prompt that produces stunning 35-second streams.

```
[1. Camera] [2. Subject + Action] [3. Surface/Ground] [4. Background + Motion]
[5. Lighting] [6. Color Palette] [7. Atmosphere + Particles]
```

### Layer Breakdown

| Layer | Purpose | Example | Why It Matters |
|-------|---------|---------|----------------|
| 1. Camera | Locks composition | "low-angle front-quarter tracking shot" | Scope morphs pixel positions — camera must be identical across scenes |
| 2. Subject + Action | What we see | "red Ferrari screaming toward camera" | The hero element — must evolve clearly between scenes |
| 3. Surface/Ground | Anchors the bottom | "on rain-soaked asphalt highway" | Grounds the scene — changes here signal environment shifts |
| 4. Background + Motion | Fills the frame | "dark pine forest streaking past both sides" | Motion blur creates cinematic feel — shared structure enables morphing |
| 5. Lighting | Sets mood | "cinematic golden hour sidelight" | Dramatically affects generation — be specific (not just "dramatic") |
| 6. Color Palette | Visual signature | "crimson, deep teal, burnished gold" | Shared colors between scenes = smooth morph. Different = jarring |
| 7. Atmosphere | Depth + magic | "rain spray, lens flare, volumetric fog" | Particles and effects make Scope's output cinematic, not flat |

### Word Count: 40-60 words per scene prompt

Not 20. Not 80. Each layer gets 5-10 words. The style_prefix handles camera + lighting + art style (shared across all scenes). The scene prompt handles subject + action + unique details.

## Style Prefix Rules

The style_prefix is prepended to EVERY scene. It should contain:
- Camera angle and movement (THE MOST IMPORTANT — must be identical)
- Art style / render quality
- Lighting setup
- Aspect ratio / framing hints

**Good style_prefix:**
```
cinematic low-angle tracking shot, hero subject centered in frame,
anamorphic lens flare, film grain, shallow depth of field,
golden hour warm sidelight, 4K photorealistic render
```

**Bad style_prefix:**
```
beautiful, high quality, cinematic
```
(Too vague — Scope needs specific spatial and lighting information)

## Bridge Scene Prompt Pattern

Bridge scenes (morph transitions) describe the IN-BETWEEN state. They must:
1. Name materials/textures from BOTH the old and new scene
2. Use transformation verbs (flowing, melting, crystallizing, emerging)
3. Describe partial states ("half-wood half-metal", "chrome flowing into carbon fiber")
4. Keep the same background structure but evolve it

**Formula for bridge prompts:**
```
[same camera], [old subject] [transformation verb] into [new subject elements],
[old material] [morphing action] with [new material],
[old background] [transitioning] to [new background],
[energy/particle effects], [mixed color palette from both scenes]
```

**Example:**
```
low-angle tracking shot, the wooden carriage frame cracking apart as brass
gears and iron panels push through the wood, spoked wheels thickening from
timber to riveted steel, cobblestone crumbling into packed gravel road,
steam and golden sparks erupting at the joints, sepia warmth fading into
industrial gunmetal grey
```

## Scene Duration × Prompt Detail

| Duration | Prompt Strategy |
|----------|----------------|
| 10-15s (bridge/morph) | Focus on transformation verbs + mixed materials. Less background detail. |
| 20-30s (establishing) | Full 7-layer prompt. Rich background. Subtle motion (wind, particles). |
| 30-40s (beauty shot) | Maximum detail. Add secondary motion (reflections, shadows, atmosphere changes). |

Longer scenes need MORE detail because Scope generates frame-by-frame. A sparse prompt produces repetitive output over 35 seconds. Add secondary elements that evolve subtly: "clouds drifting", "light shifting from warm to cool", "leaves slowly falling".

## Color Continuity Rules

Each consecutive scene pair must share at least 2 colors. Map colors explicitly:

```
Scene 1: crimson, gold, forest green (Ferrari in autumn)
Bridge:  gold fading to silver, crimson cooling to slate, green darkening (morph)
Scene 2: silver, slate blue, midnight (futuristic vehicle in night)
```

## Words Scope Responds Best To

### High-impact (Scope renders these well)
- **Materials:** chrome, glass, marble, obsidian, silk, velvet, carbon fiber, brushed steel
- **Lighting:** volumetric, rim light, backlit, lens flare, caustics, neon glow
- **Motion:** streaking, spinning, rippling, flowing, drifting, cascading
- **Weather:** rain, fog, mist, snow, dust, smoke, steam, embers
- **Texture:** glossy, matte, rough-hewn, crystalline, iridescent, translucent

### Low-impact (Scope ignores or misinterprets)
- Abstract emotions: "feeling of wonder", "sense of mystery"
- Temporal references: "after the storm", "ancient times"  
- Negations: "no people", "without shadows"
- Meta-instructions: "high quality", "beautiful", "amazing"

## Example: Complete 6-Scene Journey

**User request:** "stream showing the evolution of human flight"

**style_prefix:** "cinematic wide tracking shot, subject centered against vast sky, anamorphic bokeh, golden hour to blue hour light progression, film grain, photorealistic render"

| # | Title | Preset | Dur | Prompt (scene-specific, prepended with style_prefix) |
|---|-------|--------|-----|------|
| 1 | Da Vinci's Dream | cinematic | 30s | wooden ornithopter suspended in amber workshop light, canvas wings stretched taut with hemp cord, dust motes floating in sunbeams through arched stone windows, warm sepia and umber palette, parchment sketches pinned to walls |
| 2 | Wings → Biplane | abstract | 12s | canvas wings hardening into lacquered wood and wire struts, hemp cord tightening into steel cable, workshop stone walls dissolving into open countryside clouds, propeller blade emerging from spinning wheel mechanism, sepia warming into sky blue |
| 3 | Wright Flyer | cinematic | 28s | fabric-and-wood Wright Flyer banking over sand dunes at Kitty Hawk, twin propellers spinning with motion blur, ocean waves crashing in background, early morning fog burning off, ivory canvas and natural wood grain, wind rippling loose fabric |
| 4 | Biplane → Jet | psychedelic | 10s | biplane wings sweeping backward and flattening into delta form, fabric skin hardening into polished aluminum, propellers melting into turbine intake, wooden struts fusing into swept fuselage, sand dunes transforming into runway tarmac, blue sky intensifying to deep cobalt |
| 5 | Fighter Jet | cinematic | 30s | polished silver F-86 Sabre streaking across deep blue sky, afterburner cone of orange flame, vapor trails spiraling from wingtips, sun reflecting off canopy glass, mountains far below with snow caps, chrome and steel surfaces catching light |
| 6 | Jet → Spacecraft | dreamy | 15s | fighter jet nose stretching and rounding into capsule shape, wings folding into heat shield panels, afterburner flame blooming into rocket exhaust, blue sky darkening through violet to star-filled black, aluminum skin layering with ablative tiles, Earth's curvature appearing at horizon |
