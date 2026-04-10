# Agent Orchestration Design — Storyboard as a Design Studio Partner

## The Problem

Complex creative projects (9-scene storyboards, brand campaigns, music videos) require:
- Breaking a vision into 10-50 individual media assets
- Maintaining visual coherence across all assets
- Iterating on individual pieces while preserving the whole
- Combining text, image, video, audio, and live effects
- Managing dependencies (animate scene 3 only after scene 3 image is approved)

Current limitation: the LLM tries to do everything in ONE function call, which fails for complex work. The real pattern is a **multi-turn creative workflow** with shared context.

## The Vision

```
User: "Create a 9-scene cinematic ad for BYD Sealion 7"

Director Agent (orchestrator):
  → Breaks into creative brief + 9 scene specs
  → Creates a Project (shared context)
  → Dispatches scenes to workers (concurrent where possible)
  → Tracks completion, handles failures, retries
  → Presents results for review
  → Applies feedback ("scene 3 needs warmer lighting")
  → Iterates until approved

User: "Love scenes 1-5, but 6 needs more drama and 8 should be warmer"
  → Director updates only scenes 6 and 8
  → Preserves the approved scenes
  → Maintains style coherence with the brief
```

## Architecture: Project-Based Agent Orchestration

### Core Concepts

**Project** — A shared context container for a complex creative task.
```typescript
interface Project {
  id: string;
  brief: string;           // Original user intent
  style_guide: string;     // Extracted style rules for coherence
  scenes: Scene[];         // Ordered list of scenes
  status: "planning" | "generating" | "reviewing" | "iterating" | "complete";
  feedback: string[];      // User feedback history
  created_at: number;
}

interface Scene {
  index: number;
  description: string;     // What the scene should show
  prompt: string;          // Optimized generation prompt
  card_ref_id?: string;    // Canvas card (once generated)
  status: "pending" | "generating" | "done" | "rejected" | "regenerating";
  depends_on?: number[];   // Scene indices this depends on
  media_type: "image" | "video" | "audio";
  feedback?: string;       // Per-scene feedback
  iterations: number;
}
```

**Director Agent** — The orchestrator that manages the project lifecycle:
1. **Plan** — Parse user intent → create scene breakdown + style guide
2. **Dispatch** — Send batches of scenes to `create_media` (max 5 per call)
3. **Track** — Monitor which scenes completed, failed, need retry
4. **Present** — Show results on canvas with edges showing narrative flow
5. **Iterate** — Apply feedback to specific scenes without regenerating everything
6. **Compose** — Animate key scenes, add narration, create final video

### Workflow: 9-Scene Storyboard

```
Turn 1: User provides the creative brief

Turn 2: Director plans
  → Extracts style guide: "photorealistic CGI, Canadian landscapes, warm emotional tone"
  → Breaks into 9 scenes with descriptions + prompts
  → Creates Project in store
  → Shows plan to user: "I'll create 9 scenes in 2 batches..."

Turn 3: Director generates batch 1 (scenes 1-5)
  → create_media({steps: [scene1, scene2, scene3, scene4, scene5]})
  → Cards appear on canvas as they complete
  → Director yields progress: "3/5 scenes done..."

Turn 4: Director generates batch 2 (scenes 6-9)
  → create_media({steps: [scene6, scene7, scene8, scene9]})
  → All 9 cards on canvas

Turn 5: Director presents
  → "Here are your 9 scenes. Review and let me know what to change."
  → canvas_get to show summary

Turn 6: User provides feedback
  → "Scene 6 needs more drama, scene 8 should be warmer"

Turn 7: Director iterates
  → Only regenerates scenes 6 and 8
  → Uses same style guide + original brief
  → Preserves approved scenes 1-5, 7, 9

Turn 8: User approves
  → "Perfect. Now animate scene 1 and add narration."

Turn 9: Director composes
  → Animates scene 1 (depends_on scene 1 image)
  → Generates TTS narration
  → Links everything with edges on canvas
```

### Why This Works Better Than Current Approach

| Current | Proposed |
|---------|----------|
| LLM tries all 9 in one call → MALFORMED | Director batches 5+4 automatically |
| No memory of what was generated | Project tracks all scenes + status |
| Feedback regenerates everything | Selective iteration — only changed scenes |
| No style coherence | Style guide extracted once, applied to all |
| User must manage complexity | Director manages workflow, user gives feedback |

## Implementation Plan

### Phase 1: Project Store + Batch Execution (2 days)

**New files:**
- `lib/projects/store.ts` — Zustand store for projects
- `lib/projects/types.ts` — Project, Scene types
- `lib/tools/project-tools.ts` — project_create, project_plan, project_generate, project_iterate

**How it works:** The agent calls `project_create` with the brief, then `project_plan` to break it down, then `project_generate` in batches. Each batch is a standard `create_media` call. The project store tracks which scenes are done.

**Tool: `project_create`**
```
Input: { brief: "9-scene BYD ad...", style: "photorealistic CGI" }
Output: { project_id: "proj_123", scenes: 9, status: "planning" }
```

**Tool: `project_generate`**
```
Input: { project_id: "proj_123", scene_indices: [0,1,2,3,4] }
→ Internally calls create_media with the scene prompts
→ Updates project store with card_ref_ids
Output: { completed: 5, failed: 0, remaining: 4 }
```

**Tool: `project_iterate`**
```
Input: { project_id: "proj_123", feedback: "scene 6 more dramatic", scene_indices: [5] }
→ Regenerates only specified scenes
→ Preserves style guide
Output: { regenerated: [5], total_iterations: 2 }
```

### Phase 2: Style Coherence Engine (1 day)

Extract a style guide from the brief and enforce it across all generations:

```typescript
interface StyleGuide {
  visual_style: string;     // "photorealistic CGI"
  color_palette: string;    // "arctic white, midnight navy, golden light"
  mood: string;             // "aspirational → intimate → joyful"
  camera_style: string;     // "wide establishing, medium close-up, aerial drone"
  prompt_prefix: string;    // Auto-generated from above
  prompt_suffix: string;
}
```

The style guide is injected into every scene's prompt, ensuring visual coherence without the user specifying style per scene.

### Phase 3: Multi-Agent Collaboration (3 days)

For truly complex projects, spawn specialized sub-agents:

```
Director Agent (Gemini/Claude)
  ├── Scene Planner: breaks brief into scenes
  ├── Prompt Engineer: optimizes each scene's generation prompt
  ├── Quality Reviewer: checks generated images against brief
  ├── Style Enforcer: ensures visual coherence
  └── Composer: assembles final deliverable (video + audio)
```

Each sub-agent is a focused system prompt + tool subset. The Director coordinates them via the project store. Sub-agents can run concurrently (one per batch).

**Implementation:** Not separate LLM calls (expensive). Instead, these are **skill-based roles** — the Director loads different skills at different stages:
- Planning stage: load `storyboard` skill
- Generation: load `text-to-image` + `style-presets`  
- Video: load `video` skill
- Review: load `refinement` skill

### Phase 4: Canvas as Storyboard Timeline (2 days)

Arrange scenes in narrative order on the canvas:
- Auto-layout: scenes left-to-right, 5 per row
- Timeline markers: scene numbers, duration estimates
- Dependency arrows: image → animation → narration
- Drag to reorder scenes
- Double-click scene to iterate

## Key Design Principles

### 1. Brief is Sacred
The original brief is the project's north star. Every regeneration references it. The style guide is derived from it. Feedback modifies scenes, not the brief.

### 2. Selective Iteration
Never regenerate what's already approved. Track scene status explicitly. Only touch what the user asks to change.

### 3. Style Coherence by Default
Extract style rules once, apply everywhere. The user shouldn't need to specify "photorealistic" on every scene.

### 4. Batch, Don't Blast
5 steps max per create_media call. The Director manages batching transparently. The user sees smooth progress, not error messages.

### 5. Canvas is the Shared Context
All agents read from and write to the same canvas. Cards are the visible state. Edges show relationships. The project store is the invisible bookkeeping.

### 6. Progressive Refinement
Start rough, refine iteratively. Generate all scenes at draft quality, let the user pick favorites, then upscale/animate/refine the approved ones.

## Example: Full 9-Scene Workflow

```
User: "Create a 9-scene cinematic ad for BYD Sealion 7..."

Agent: I'll create this as a project with 9 scenes in a photorealistic CGI style.

[Calls project_create → project stored]
[Calls project_generate scenes 1-5]

Agent: Scenes 1-5 are on your canvas. Generating 6-9...

[Calls project_generate scenes 6-9]

Agent: All 9 scenes ready. Here's the summary:
  1. Hero Reveal — mountain highway at sunrise ✓
  2. Morning Charge — suburban Vancouver ✓
  ...
  9. Night Arrival — family home ✓

  What would you like to change?

User: "Scene 6 needs more drama. Scene 8 should feel warmer."

Agent: Regenerating scenes 6 and 8 with your feedback...

[Calls project_iterate with feedback + scene indices]

Agent: Updated. Scenes 6 and 8 refreshed on canvas.

User: "Perfect. Animate scene 1 and add narration for the whole thing."

Agent: Animating scene 1 and creating narration...

[Calls create_media: animate scene 1, TTS for narration]

Agent: Done! Scene 1 is animated, narration is on the canvas.
  Your 9-scene storyboard is complete. Export with /export.
```

## Open Questions

1. **Where does the project live?** Zustand + localStorage (like skills). Projects survive page reload but not browser clear.

2. **How does the Director know when to batch?** Rule: if scene count > 5, auto-batch in groups of 5. If a batch fails (MALFORMED), auto-retry with groups of 3.

3. **Multi-model support?** The Director could use Claude for planning (better reasoning) and Gemini for generation (faster). The project store is model-agnostic.

4. **Video composition?** Phase 3 — stitch scene images into a video with transitions + narration. Requires ffmpeg-compose capability on the network.

5. **Collaborative editing?** Multiple users editing the same project via MCP or shared state. Future consideration.
