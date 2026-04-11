// lib/agents/context-builder.ts

import type { Intent } from "./intent";
import type { ProjectSnapshot, ActionRecord } from "./working-memory";

interface MemorySnapshot {
  project: ProjectSnapshot | null;
  digest: string;
  recentActions: ActionRecord[];
  preferences: Record<string, string>;
}

const BASE_PROMPT = `You are a passionate creative partner in Livepeer Storyboard. You get genuinely excited about ideas, offer bold suggestions, and celebrate great results. Brief and punchy — the canvas shows results, don't over-describe.

## Rules
- Keep prompts under 25 words. Summarize — don't copy descriptions verbatim.
- After generating, react briefly and ask what's next.
- For restyle/animate existing card: canvas_get first, pass source_url.
- Never say "I can't" — suggest an alternative approach.`;

export function buildAgentContext(intent: Intent, memory: MemorySnapshot): string {
  const parts: string[] = [BASE_PROMPT];

  // Models (try to get live capabilities, gracefully degrade)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCachedCapabilities } = require("@/lib/sdk/capabilities");
    const caps = getCachedCapabilities();
    if (caps.length > 0) {
      parts.push(`\nModels: ${caps.map((c: { name: string }) => c.name).join(", ")}. Selection is automatic.`);
    }
  } catch { /* not available in tests */ }

  // Long-term memory
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMemorySummary } = require("@/lib/memory/store");
    const longTermMemory = getMemorySummary();
    if (longTermMemory) parts.push(`\nMemory: ${longTermMemory}`);
  } catch { /* not available in tests */ }

  // Preferences
  const prefParts = Object.entries(memory.preferences).map(([k, v]) => `${k}: ${v}`).join(", ");
  if (prefParts) parts.push(`\nPreferences: ${prefParts}`);

  // Intent-specific context
  switch (intent.type) {
    case "new_project":
      parts.push(`\n## Action: New Project
User is submitting a multi-scene brief. Extract scenes and call project_create.
- Each scene prompt: UNDER 20 WORDS. Summarize, don't copy.
- Extract style_guide (visual_style, color_palette, mood, prompt_prefix).
- After project_create, call project_generate to start the first batch.`);
      break;

    case "continue":
      if (memory.project) {
        parts.push(`\n## Action: Continue Generation
Project "${memory.project.id}": ${memory.project.completedScenes}/${memory.project.totalScenes} scenes done.
Call project_generate with project_id="${memory.project.id}".`);
        if (memory.project.styleGuide) {
          parts.push(`Style: ${memory.project.styleGuide.style}`);
        }
      }
      break;

    case "add_scenes":
      parts.push(`\n## Action: Add ${intent.count || 4} More Scenes`);
      if (memory.project?.styleGuide) {
        parts.push(`Style: ${memory.project.styleGuide.style}
Characters: ${memory.project.styleGuide.characters}
Use create_media with ${Math.min(intent.count || 4, 5)} steps.
Each prompt MUST start with the style and mention the character. Under 25 words.
After creating, call canvas_organize.`);
      } else {
        parts.push(`Use create_media with ${Math.min(intent.count || 4, 5)} steps. Under 25 words each.`);
      }
      if (intent.direction) {
        parts.push(`User direction: "${intent.direction.slice(0, 200)}"`);
      }
      break;

    case "adjust_scene":
      if (memory.project) {
        parts.push(`\n## Action: Adjust Scene
Project "${memory.project.id}". User feedback: "${intent.feedback?.slice(0, 200)}"
${intent.sceneHint ? `Scene index: ${intent.sceneHint}` : "Identify the scene from their description."}
Use project_iterate with the scene index and feedback.`);
      }
      break;

    case "style_correction":
      parts.push(`\n## Action: Style Correction
User wants to change the creative direction: "${intent.feedback?.slice(0, 200)}"
Acknowledge the change. If they want to regenerate, use create_media or project_iterate.`);
      if (memory.project?.styleGuide) {
        parts.push(`Current style: ${memory.project.styleGuide.style}`);
      }
      break;

    case "status":
      if (memory.project) {
        parts.push(`\n## Action: Status Report
Project "${memory.project.id}": ${memory.project.completedScenes}/${memory.project.totalScenes} done.
If incomplete, call project_generate to continue.`);
      }
      break;

    default:
      parts.push(`\n## Routing
- 1-5 items: create_media with SHORT prompts
- 6+ scenes: project_create then project_generate
- Live stream: scope_start/control/stop
- Canvas: canvas_get/create/update/remove/organize`);
      break;
  }

  // Project state (compact) — skip for new_project intent
  if (memory.project && intent.type !== "new_project") {
    const done = memory.project.sceneList
      .filter((s) => s.status === "done")
      .map((s) => `${s.title}(${s.refId || "?"})`)
      .join(", ");
    const pending = memory.project.sceneList
      .filter((s) => s.status !== "done")
      .map((s) => s.title)
      .join(", ");
    if (done) parts.push(`\nDone scenes: ${done.slice(0, 300)}`);
    if (pending) parts.push(`Pending: ${pending.slice(0, 200)}`);
  }

  // Recent actions
  if (memory.recentActions.length > 0) {
    const recent = memory.recentActions.slice(-3).map((a) => `${a.tool}: ${a.outcome}`).join("; ");
    parts.push(`\nRecent: ${recent}`);
  }

  // Conversation digest
  if (memory.digest) {
    parts.push(`\nSession: ${memory.digest.slice(0, 300)}`);
  }

  return parts.join("\n");
}
