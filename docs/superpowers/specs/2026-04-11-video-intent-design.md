# Video Intent Understanding — Design Spec

**Goal:** Make the storyboard preprocessor recognize "create video / animated short / film" intent in multi-scene briefs, route those scenes to video generation (ltx-i2v with keyframe), respect the 5-10s clip limit by asking the user upfront how to handle long-duration scenes, and preserve rich production notes (color arc, character design, per-scene visual language) into prompt context.

**Architecture:** Extend the preprocessor's intent detection to recognize video keywords. When detected, parse scene durations and offer the user a strategy choice (overview vs full coverage). For each video scene, schedule a two-step plan: (1) generate keyframe with flux-dev, (2) animate with ltx-i2v using beat-based prompting for multi-clip scenes. Production notes are extracted into the existing CreativeContext (storyboard-level) and per-scene metadata (scene-level visual language).

---

## 1. Video Intent Detection

The preprocessor's `extractScenes()` and project handler currently always set `action: "generate"`. We add a `detectVideoIntent()` step that runs on the full brief BEFORE scene extraction.

### Signals (any one matches → video intent)

```typescript
const VIDEO_KEYWORDS = [
  // Direct video terms
  /\b(animated|animation|short film|short video|video clip|movie|cinema|cinematic short)\b/i,
  // Time-based terms
  /\bduration:\s*\d+\s*(s|sec|second|minute)/i,
  /\b\d+[-\s]second\b/i,
  // Production language
  /\b(scene\s*\d+.*camera|tracking shot|close-?up|wide shot|cut to|fade to|zoom)\b/i,
  // Genre tells
  /\bstoryboard.*video|video.*storyboard|film.*scene|scene.*film\b/i,
];

function detectVideoIntent(brief: string): boolean {
  return VIDEO_KEYWORDS.some((re) => re.test(brief));
}
```

A separate helper extracts per-scene durations:

```typescript
interface SceneDuration {
  sceneIndex: number;
  seconds: number;
}

function extractDurations(brief: string): SceneDuration[] {
  // Match patterns like "Duration: 45 seconds" or "Duration: 70s"
  // Tied to scene markers (Scene 1, Scene 2, etc)
}
```

If `detectVideoIntent` returns true, the preprocessor switches into **video mode**.

---

## 2. Strategy Choice (Hybrid C)

When video intent is detected AND total declared duration > 60s, the preprocessor pauses generation and posts a question to the chat:

```
🎬 Video brief detected: 6 scenes totaling 365 seconds.

Each clip is 5-10s (ltx-i2v limit). How should I handle this?

  [1] Overview — 6 clips × 10s = 60s total (one signature moment per scene)
  [2] Full coverage — ~37 clips × 10s = ~365s total (multiple beats per scene)
  [3] Custom — pick a different clip count per scene

Reply with 1, 2, or 3, or just say "overview" / "full".
```

The user's reply is intercepted by a new "video strategy" intent in `classifyIntent()`. Once a strategy is picked, the preprocessor proceeds.

If total duration ≤ 60s OR no explicit durations are given, default to **overview** silently.

### Strategy data model

```typescript
interface VideoStrategy {
  mode: "overview" | "full" | "custom";
  /** Total clips to generate */
  totalClips: number;
  /** Per-scene clip count */
  perScene: number[];
}
```

---

## 3. Two-Step Generation: Keyframe → Animate

For each video scene, the preprocessor schedules a 2-step plan in `project_create`:

### Scene action types

Update `Scene.action` enum to include the new video flow:

```typescript
type SceneAction =
  | "generate"      // Static image (existing)
  | "video_keyframe" // NEW: generate keyframe image, then animate
  | "animate"       // Existing: animate an existing card
  | "tts";          // Existing
```

When `action: "video_keyframe"`, project_generate runs TWO sub-steps:

1. **Keyframe step:** Call `create_media` with action `generate`, capability `flux-dev`, prompt = scene's visual prompt + style prefix. Creates an image card.
2. **Animate step:** Call `create_media` with action `animate`, capability `ltx-i2v`, source_url = keyframe URL, prompt = scene's motion prompt. Creates a video card. An edge connects keyframe → video.

For multi-clip scenes (full coverage), the animate step runs N times in parallel — each with a different beat prompt (see section 4) — producing N video cards all sourced from the same keyframe.

### Why two cards per scene?

User-visible benefits:
- The keyframe is editable (regenerate, restyle)
- The video can be regenerated from the same keyframe with different motion prompts
- The edge connection makes the lineage clear

---

## 4. Beat-Based Prompting (Multi-Clip Scenes)

When a scene has N clips (N > 1), the agent breaks the scene description into N "beats." This happens client-side via a small LLM call (the existing Gemini API route, no tools, just text).

### Beat extraction prompt

```
Break this scene description into N beats — short prompts (under 20 words each)
that describe consecutive moments of motion. Each beat should evolve naturally
from the previous one.

Scene description: {{description}}

Reply with exactly N lines, one beat per line, no numbering.
```

### Output

Returns an array of motion prompts. Each beat is paired with the same keyframe to produce a clip. For example, a 70s storm scene with 7 beats:

1. "Rain begins, sky darkening, wind picks up"
2. "Lanterns swing wildly, shutters slam shut"
3. "Tank presses against the wall, ears flat, terrified"
4. "Wall collapses across the lane, water rises"
5. "Tank wades into the floodwater, paws slipping on stones"
6. "Tank reaches the ledge, Kuro steps onto his back"
7. "Both reach the temple steps, collapse together in the rain"

All 7 use the same keyframe (the storm wide shot) but each clip captures a different moment.

### Fallback

If the beat extraction LLM call fails, fall back to repeating the scene's main prompt for all N clips with a sequential suffix ("opening moment", "mid action", "climax", etc).

---

## 5. Production Notes Extraction (Hybrid C)

Production notes have two scopes:

### Storyboard-level → CreativeContext

The existing `extractCreativeContext()` LLM call already extracts style/palette/characters/setting/mood. For video briefs, we extend the prompt to ALSO capture:

- **color_arc**: A brief description of how color shifts across the film
- **character_designs**: Detailed character descriptions (more than just "characters")
- **sound_mood**: Score/sound style (stored but not used yet)

These go into CreativeContext as new optional fields. The `buildPrefix()` method uses them as before — color_arc and character_designs get folded into the prompt prefix; sound_mood is stored for future audio gen.

### Per-scene → Scene metadata

For each scene, the preprocessor scans for production note patterns:

```
Visual language: <text>
Score: <text>
Camera: <text>
```

These become per-scene fields:

```typescript
interface Scene {
  // ... existing fields
  visualLanguage?: string;  // Appended to video prompt
  score?: string;           // Stored for future audio gen
  cameraNotes?: string;     // Appended to video motion prompt
}
```

When generating, the visual language is appended to both the keyframe prompt and the video prompts. Camera notes are appended to motion prompts only.

---

## 6. User-Facing Messages

The preprocessor posts these messages during a video brief flow:

```
🎬 Detected video brief: "TANK AND KURO" — 6 scenes
   Style: Studio Ghibli watercolor · Characters: bulldog + tuxedo cat
   Setting: Japanese fishing village

⚠ Each clip is 5-10 seconds (ltx-i2v limit). Total declared: 365s.
   How to handle? [1] Overview (6×10s = 60s) [2] Full (37×10s = 365s) [3] Custom

[user picks 1]

✓ Strategy: Overview — 1 keyframe + 1 clip per scene
✓ Project created: 6 scenes
✓ Generating keyframes for scene 1...
✓ Keyframe ready, animating scene 1...
[etc]

Done — 6 keyframes + 6 video clips ready on the canvas.
```

---

## 7. File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/agents/video-intent.ts` | detectVideoIntent, extractDurations, planVideoStrategy |
| `lib/agents/beat-extractor.ts` | breakSceneIntoBeats — small LLM call |
| `tests/unit/video-intent.test.ts` | Detection + duration parsing + strategy planning |
| `tests/unit/beat-extractor.test.ts` | Beat extraction + fallback |

### Modified files

| File | Changes |
|------|---------|
| `lib/agents/preprocessor.ts` | After scene extraction, run detectVideoIntent. If true, post strategy question, await reply, then build scenes with action `video_keyframe` and beat data |
| `lib/agents/intent.ts` | Add `video_strategy` intent (matches "1", "2", "3", "overview", "full") |
| `lib/projects/types.ts` | Add `video_keyframe` to Scene action enum, add `visualLanguage`/`score`/`cameraNotes` fields |
| `lib/tools/project-tools.ts` | project_generate: when scene.action = "video_keyframe", run two-step (keyframe + animate). Pass beat prompts for multi-clip scenes |
| `lib/agents/session-context.ts` | Extend CreativeContext with optional `colorArc`, `characterDesigns`, `soundMood` fields |
| `skills/base.md` | Add note: video briefs route to video_keyframe automatically |

---

## 8. Data Flow

```
User pastes brief
       │
       ▼
preprocessor.ts: detectVideoIntent(brief)
       │
       ▼ (true)
extract scenes + extract durations
       │
       ▼
total declared duration > 60s?
       │
       ├─ no → default to overview (no question)
       └─ yes → post strategy question to chat
                │
                ▼
        wait for user reply (intent: video_strategy)
                │
                ▼
        VideoStrategy { mode, totalClips, perScene[] }
       │
       ▼
For each scene:
  action = "video_keyframe"
  cliperCount = perScene[i]
  if (cliperCount > 1) → call breakSceneIntoBeats(description, cliperCount)
       │
       ▼
project_create with video scenes
       │
       ▼
project_generate runs each scene:
  1. create_media({ action: "generate", capability: "flux-dev", prompt: keyframe })
  2. for each beat: create_media({ action: "animate", capability: "ltx-i2v",
     source_url: keyframe.url, prompt: beat })
       │
       ▼
Canvas: keyframe + N video clips per scene, all linked by edges
```

---

## 9. Cross-Video Consistency

The biggest failure mode of multi-clip video generation is **stylistic drift** — Ghibli watercolor in scene 1, photoreal in scene 3, anime in scene 5. We solve this with a layered consistency model.

### Layer 1: Locked storyboard prefix

When the preprocessor extracts CreativeContext from the brief, it builds a **locked prompt prefix** that is prepended to every keyframe AND every video clip across the entire film. The prefix has a fixed structure:

```
{visual_style}, {character_designs}, {color_temp}, {setting},
```

For the Ghibli brief, this would be:

```
Studio Ghibli hand-painted cel animation watercolor aesthetic, English bulldog
TANK with brindle and white coat and underbite, tuxedo cat KURO with white gloves
and green eyes, weathered Japanese fishing village with wooden houses on stilts,
```

This prefix is **stored on the project** (not the session) so it persists for the project's lifetime and survives page reloads. Every scene's keyframe and every video beat starts with this exact text.

### Layer 2: Style anchor image

After generating the FIRST scene's keyframe, the system marks it as the **style anchor**. For all subsequent scenes:

- The keyframe step uses the style anchor as a reference image (via `flux-dev` with `image_url` param if supported, or `kontext-edit` for guided generation)
- This gives the model a visual template to match — same line weight, same color palette, same character proportions
- If the user regenerates the anchor, ALL downstream keyframes are flagged for re-render

### Layer 3: Per-scene color temperature

The user's brief explicitly defines a color arc:
```
Scene 1 → warm gold
Scene 2 → bright noon white
Scene 3 → cold blue-black
...
```

The preprocessor extracts this into a `colorArc: string[]` array on the project. Each scene's keyframe prompt gets its own color phrase appended:

```
[locked prefix], [scene description], warm saffron morning light with long soft shadows
```

This gives controlled variation while maintaining the overall consistency.

### Layer 4: Character lock token

Character designs are extracted into a special `characterLock` field on CreativeContext. It's a 1-line string that's force-prepended to EVERY motion prompt (not just keyframes), because video models drift on character identity faster than image models:

```
TANK is a brindle English bulldog with prominent underbite. KURO is a tuxedo cat
with white gloves and green eyes.
```

Every animate call gets this token, so even if the keyframe accidentally varies, the motion prompts re-anchor the characters every frame.

### Layer 5: Seed continuity (best effort)

If `flux-dev` and `ltx-i2v` support a seed parameter, the preprocessor passes the SAME base seed for all keyframes and increments by scene index. This makes the random noise pattern consistent across scenes — small but real impact on visual cohesion. If the model doesn't support seeds, this layer is silently skipped.

### Implementation summary

```typescript
interface VideoProject {
  // ... existing scene fields
  lockedPrefix: string;       // Layer 1
  styleAnchorRefId?: string;   // Layer 2 (set after scene 1's keyframe is done)
  colorArc: string[];          // Layer 3 (one per scene)
  characterLock: string;       // Layer 4
  baseSeed?: number;           // Layer 5
}
```

When `project_generate` runs a scene:
1. Build keyframe prompt = `lockedPrefix + sceneDescription + colorArc[i]`
2. If styleAnchorRefId exists and i > 0, pass it as image_url for guided generation
3. Build motion prompt = `characterLock + beat description + cameraNotes`
4. Generate with seed = baseSeed + i (if supported)

These five layers stack — together they make a 6-scene Ghibli short feel like one film, not six unrelated clips.

---

## 10. What This Does NOT Include (YAGNI)

- No audio generation (sound_mood stored but unused)
- No video duration > 10s per clip (we never bypass the limit, we split)
- No automatic scene re-stitching into one video (each clip is a separate card)
- No model selection — always flux-dev for keyframe, ltx-i2v for animate
- No music score generation
- No subtitles / title cards (the brief mentions title cards but we ignore them)
- No camera motion generation beyond what's in the user's per-scene camera notes
