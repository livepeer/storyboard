// lib/agents/context-builder.ts

import type { Intent } from "./intent";
import type { ProjectSnapshot, ActionRecord } from "./working-memory";
import { useActiveRequest, formatActiveRequest } from "./active-request";

interface CardInfo {
  refId: string;
  type: string;
  title: string;
  url?: string;
}

interface MemorySnapshot {
  project: ProjectSnapshot | null;
  digest: string;
  recentActions: ActionRecord[];
  preferences: Record<string, string>;
  /** Current canvas cards — so agent knows what refIds exist */
  canvasCards?: CardInfo[];
  /** Currently selected card refId */
  selectedCard?: string;
  activeEpisodeId?: string | null;
}

const BASE_PROMPT = `You are a passionate creative partner in Livepeer Storyboard. You get genuinely excited about ideas, offer bold suggestions, and celebrate great results. Brief and punchy — the canvas shows results, don't over-describe.

## Rules
- Keep prompts under 25 words. Summarize — don't copy descriptions verbatim.
- After generating, react briefly and ask what's next.
- Never say "I can't" — suggest an alternative approach.

## Card References
When the user mentions a card by name (e.g., "img-9", "vid-3"):
- The card list below shows all cards on canvas with their refId, type, and title
- To use a card as input: call scope_start with source.ref_id, or create_media with source_url from canvas_get
- For restyle/animate/stream from existing card: canvas_get(ref_id) first to get the URL, then pass it
- The selected card (if any) is what the user is likely referring to`;

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

  // Conversation context — tracks active work item for continuation
  try {
    const { getConversationPrompt } = require("@/lib/agents/conversation-context");
    const convCtx = getConversationPrompt();
    if (convCtx) parts.push(`\n${convCtx}`);
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

    case "episode_switch":
      parts.push(`\n## Action: Switch Episode
User wants to switch to a different episode. Use episode_activate or episode_list to find the right one.`);
      break;

    case "episode_create":
      parts.push(`\n## Action: Create Episode
User wants to group cards into an episode. Use episode_create with card refIds and a name.`);
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

  // Canvas cards — so agent can resolve refIds like "img-9"
  if (memory.canvasCards && memory.canvasCards.length > 0) {
    const shown = memory.canvasCards.slice(-15);
    const list = shown.map((c) => `${c.refId}:${c.type}:"${c.title}"`).join(", ");
    const extra = memory.canvasCards.length > 15 ? ` (+${memory.canvasCards.length - 15} more)` : "";
    parts.push(`\nCanvas: ${list}${extra}`);
    if (memory.selectedCard) {
      parts.push(`Selected: ${memory.selectedCard}`);
    }
  }

  // Active episode context
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEpisodeStore } = require("@/lib/episodes/store");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSessionContext } = require("@/lib/agents/session-context");
    const epStore = useEpisodeStore.getState();

    if (epStore.episodes.length > 0) {
      const epList = epStore.episodes.map((ep: { id: string; name: string; cardIds: string[]; }) =>
        `${ep.name}(${ep.cardIds.length} cards${ep.id === memory.activeEpisodeId ? ", ACTIVE" : ""})`
      ).join(", ");
      parts.push(`\nEpisodes: ${epList}`);
    }

    const activeEp = epStore.getActiveEpisode();
    if (activeEp) {
      const storyboardCtx = useSessionContext.getState().context;
      if (storyboardCtx) {
        const overrides = Object.entries(activeEp.context)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        parts.push(`Active episode: "${activeEp.name}" — overrides: ${overrides || "none (inherits all)"}`);
      }
    }
  } catch { /* not available in tests */ }

  // Recent actions
  if (memory.recentActions.length > 0) {
    const recent = memory.recentActions.slice(-3).map((a) => `${a.tool}: ${a.outcome}`).join("; ");
    parts.push(`\nRecent: ${recent}`);
  }

  // Active request — compact memory of what the user is currently
  // iterating on. Rebuilt deterministically from each turn's text by
  // useActiveRequest.applyTurn(). This is the primary fix for cross-turn
  // subject loss (see lib/agents/active-request.ts header).
  {
    const snapshot = useActiveRequest.getState().snapshot();
    const line = formatActiveRequest(snapshot);
    if (line && !useActiveRequest.getState().isStale()) {
      parts.push(`\nActive request: ${line}. Preserve subject across turns — clarification answers are modifiers, not replacements.`);
    }
  }

  // Conversation digest
  if (memory.digest) {
    parts.push(`\nSession: ${memory.digest.slice(0, 300)}`);
  }

  return parts.join("\n");
}
