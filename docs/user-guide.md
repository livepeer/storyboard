# Storyboard — User Guide

Welcome to Storyboard! This guide walks you through everything you can do.

---

## Getting Started

1. Open https://storyboard-rust.vercel.app (or `http://localhost:3000` for local dev)
2. Click the **gear icon** (top right) and enter your **Daydream API Key**
3. Type a prompt in the chat box and press Enter

That's it — the AI creates images, videos, and more on the infinite canvas.

---

## Your First Creation

Type in the chat:
```
a cute cat sitting on a mushroom in watercolor style
```

An image card appears on the canvas. You can:
- **Drag** it to move it
- **Right-click** it for more actions
- **Scroll** to zoom, **Alt+drag** to pan the canvas

---

## Chat Commands

Type these in the chat box. Type `/help` to see all commands.

### /story — Create Illustrated Stories

```
/story a brave knight and a tiny dragon who become friends
```

The AI generates a **6-scene story** with style, characters, and creative direction. Review it in the chat card, then type **"apply"** or click **Apply** to generate all scene images.

### /film — Direct a Short Film

```
/film a detective discovers a glowing book in a dark library
```

Creates a **4-shot film script** with camera directions (wide shot, close-up, tracking, reveal). Click **Apply** to generate key frames and animate each to video.

Load genre skills for different styles:
```
/film load noir
/film load animation
/film load scifi
```

### /stream — Live Stream with Prompt Traveling

```
/stream a dreamy underwater world with bioluminescent creatures
```

Plans a multi-scene live stream. Apply to start streaming — the visual prompt **evolves over time**, transitioning from scene to scene like "prompt traveling."

Drive an active stream from chat:
```
/stream ptravel sunset morphing into aurora borealis #4,#15
```
(4 scenes, 15 seconds each)

### /talk — Talking Video

Create a character image, then:
```
/talk Hello, welcome to our demo --face img-1
```
Generates speech audio + lip-synced talking video.

With voice cloning:
```
/talk Amazing product --face img-2 --voice aud-1
```

### /project — Manage Projects

```
/project list          Show all projects
/project show          Details of active project
/project switch bikes  Switch to a different project
/project replay        Regenerate from stored prompts
```

### /analyze — Image Analysis

```
/analyze img-1
```
Gemini Vision extracts style, palette, characters, setting, and mood. Auto-applies as creative context for future generations.

### Quick Style Commands

```
/lego a cute robot         LEGO minifigure style
/logo my brand name        Professional logo design
/iso a cozy coffee shop    Isometric illustration
```

---

## Right-Click Menu

Right-click any card on the canvas for these actions:

### One-Click Actions
| Action | What it does |
|--------|-------------|
| **Save to File** | Download the image/video/audio |
| **Upscale** | Enhance resolution |
| **Remove Background** | Transparent background |

### Creative Transformations
| Action | What it does |
|--------|-------------|
| **Animate** | Image → video (auto-selects best model) |
| **Cinematic Video (Seedance)** | High-quality 10s video with audio |
| **Restyle** | Change the style (describe the new look) |
| **LEGO Style** | Convert to LEGO minifigure style |
| **Isometric SVG** | Convert to isometric illustration |
| **Make Logo** | Convert to logo design |
| **Replace Object** | Replace something in the image |
| **Virtual Try-On** | Put a garment on a person (needs garment card) |
| **Video Try-On** | Try-on + animate to runway video |
| **Talking Video** | Make the character talk (enter speech text) |
| **Weather Effect** | Add rain, snow, storm, etc. |
| **Convert to 3D** | Generate a 3D model |
| **Analyze Media** | Extract style/characters/mood via AI vision |

### Live Streaming
| Action | What it does |
|--------|-------------|
| **Start LV2V Stream** | Real-time AI video transformation |

### Right-Click Empty Canvas
| Action | What it does |
|--------|-------------|
| **From Computer** | Import image, video, or audio file |
| **From Internet** | Import from URL |

---

## Canvas Organization

```
/organize              Auto-layout (picks best mode)
/organize narrative    One row per project, scene order
/organize grid         Simple grid layout
/organize episode      Group by episode
```

Cards from the same project automatically stay together.

---

## Tips & Tricks

- **Duration control** — When animating, add `5s` / `10s` / `15s` to your prompt: "epic reveal 15s"
- **Model selection** — Say "using seedance" or "with pixverse" to pick a specific model
- **Voice cloning** — Import a .wav file (right-click canvas → From Computer), then use it with `/talk --voice aud-1`
- **Episode groups** — Drag a card into an episode area to add it. Great for organizing scenes.
- **Creative context** — Run `/context gen dramatic noir photography` to set a persistent style for all future generations
- **Project replay** — `/project replay bikes` regenerates all scenes with the same prompts (different results each time)

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Enter** | Send message |
| **Shift+Enter** | New line in chat |
| **Scroll** | Zoom canvas |
| **Alt+Drag** | Pan canvas |
| **Right-click** | Context menu (card or empty canvas) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "No media returned" | Check API key in settings (gear icon) |
| "All models rejected" | The image may have content the model won't process. Try a different image or prompt. |
| Video animation fails | The source image may be too large. The app auto-resizes, but try generating a new image first. |
| "/stream failed to start" | The Scope runner needs a cold start (~1-2 min). Try `/stream apply` again. |
| Chat input not clearing | Hard refresh the page (Cmd+Shift+R) |
