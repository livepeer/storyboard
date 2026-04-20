# Creative Session Context — Design Document

## Problem

Every agent interaction is stateless. When a user creates an 8-scene Ghibli storyboard, then asks "give me 8 more," the agent has zero memory of:
- Visual style (Studio Ghibli, hand-painted watercolor)
- Character (10-year-old girl, windswept hair, skateboard)
- Setting (countryside village, late summer afternoon)
- Palette (burnt sienna, sage green, ochre, cream)
- Rules (always in motion, animals in every scene)
- Narrative arc (skateboard journey through village)

Result: the "8 more" scenes come out in a completely different style with different characters.

## Architecture

```
User Brief (800 words)
  │
  ▼
Preprocessor
  ├── Extract scenes → project_create
  └── Extract Creative DNA → session context store
        │
        ▼
┌─────────────────────────────────────┐
│     Creative Session Context        │
│                                     │
│  style: "Studio Ghibli, hand-      │
│    painted watercolor, soft light"  │
│  palette: "burnt sienna, sage      │
│    green, ochre, cream, sky blue"   │
│  characters: "girl ~10, windswept  │
│    hair, canvas backpack, wooden    │
│    skateboard, yellow t-shirt"      │
│  setting: "countryside village,     │
│    late summer afternoon"           │
│  rules: "always in motion, never   │
│    posed, animals in every scene"   │
│  mood: "warm, magical, joyful"     │
│                                     │
│  [Auto-extracted by LLM]           │
│  [Injected into every prompt]      │
│  [Visible in chat UI]              │
│  [Editable via /context]           │
└─────────────────────────────────────┘
        │
        ▼ (injected before every generation)
create_media({ prompt: "[context prefix] + user prompt" })
```

## Key Principles

1. **Auto-extract**: User never manually sets up context. Paste a brief → context appears.
2. **Always inject**: Every create_media/inference call gets the context as prompt prefix.
3. **Visible**: User sees what the agent "remembers" at all times (chat panel badge).
4. **Editable**: /context view, /context edit, /context clear.
5. **Progressive**: "wrong style, use ghibli" → LLM updates the context.
6. **Lightweight**: ~50 words of context prefix, not the full 800-word brief.

## Flow

### First Brief
```
User: [pastes 8-scene Ghibli storyboard brief]
System: Extracts Creative DNA via LLM (one-time, ~200 tokens)
System: Shows "Context saved: Ghibli watercolor, village girl" in chat
System: Generates 8 scenes with context prefix on every prompt
```

### Follow-up "8 more"
```
User: "give me 8 more to make the story more interesting"
System: Detects add_scenes intent (existing classifier)
System: Agent generates 8 more → EVERY prompt gets context prefix:
  "Studio Ghibli watercolor, girl with skateboard, countryside village,
   burnt sienna and sage green palette, warm magical mood, "
Result: New scenes match the original style perfectly
```

### Style Correction
```
User: "wrong style, should be more ghibli"
System: LLM detects this as a context update
System: Updates context.style to emphasize Ghibli more
System: Shows "Context updated: style → Studio Ghibli emphasis"
```
