/**
 * /story command handler — wires the storyteller LLM call, the
 * zustand store, and the chat UI together.
 *
 * Subcommands:
 *   /story <prompt>           → generate a new story draft, set as pending
 *   /story list               → show recent drafts + applied stories
 *   /story show <id>          → re-display a saved story card
 *   /story apply <id>         → apply a specific saved story by id
 *   /story apply              → apply the current pending draft (also
 *                               triggered by natural-language "yes" / "apply them")
 *   /story clear              → wipe the archive
 *
 * Returns a special system-message format that MessageBubble renders
 * as a StoryCard: `@@story@@{...json...}@@/story@@`. Keeping it inline
 * in the chat stream means the card lives in the transcript naturally
 * alongside /organize, /context, and agent messages.
 */

import { useStoryStore } from "./store";
import { generateStory } from "./generator";
import type { Story, StoryListItem } from "./types";
import { createTracker } from "@/lib/utils/execution-tracker";

/** Envelope marker used by MessageBubble to detect and render a StoryCard. */
export const STORY_CARD_MARKER = "@@story@@";
export const STORY_CARD_END = "@@/story@@";

export function renderStoryEnvelope(story: Story): string {
  return `${STORY_CARD_MARKER}${JSON.stringify(story)}${STORY_CARD_END}`;
}

/** True if a chat message is a rendered story card. */
export function isStoryEnvelope(text: string): boolean {
  return text.startsWith(STORY_CARD_MARKER) && text.includes(STORY_CARD_END);
}

export function parseStoryEnvelope(text: string): Story | null {
  if (!isStoryEnvelope(text)) return null;
  const inner = text
    .slice(STORY_CARD_MARKER.length, text.indexOf(STORY_CARD_END))
    .trim();
  try {
    return JSON.parse(inner) as Story;
  } catch {
    return null;
  }
}

/**
 * Handle any /story subcommand. Returns a synchronous string for
 * simple subcommands (list, show, clear) or a Promise<string> for
 * subcommands that need to call the LLM (generate) or run tools
 * (apply). The chat layer awaits the returned value.
 */
export async function handleStoryCommand(args: string): Promise<string> {
  const trimmed = args.trim();
  const [sub, ...rest] = trimmed.split(/\s+/);
  const restArgs = rest.join(" ").trim();
  const lowerSub = sub?.toLowerCase() ?? "";

  // Empty command — help text
  if (!trimmed) return storyHelp();

  // /story list
  if (lowerSub === "list") return storyList();

  // /story clear
  if (lowerSub === "clear") {
    useStoryStore.getState().clear();
    return "Story archive cleared.";
  }

  // /story show <id>
  if (lowerSub === "show") {
    if (!restArgs) return "Usage: /story show <id>";
    return storyShow(restArgs);
  }

  // /story apply [id]
  if (lowerSub === "apply") {
    return storyApply(restArgs);
  }

  // /story archive <id>
  if (lowerSub === "archive") {
    if (!restArgs) return "Usage: /story archive <id>";
    const story = useStoryStore.getState().getById(restArgs);
    if (!story) return `No story with id "${restArgs}"`;
    useStoryStore.getState().archive(story.id);
    return `Archived "${story.title}".`;
  }

  // /story remove <id>
  if (lowerSub === "remove" || lowerSub === "delete") {
    if (!restArgs) return `Usage: /story ${lowerSub} <id>`;
    const story = useStoryStore.getState().getById(restArgs);
    if (!story) return `No story with id "${restArgs}"`;
    useStoryStore.getState().remove(story.id);
    return `Removed "${story.title}".`;
  }

  // Otherwise: treat the whole args as the story prompt.
  //   /story a cat and dog friendship for 10-year-olds
  return storyGenerate(trimmed);
}

// ----------------------------------------------------------------------
// Subcommand implementations
// ----------------------------------------------------------------------

function storyHelp(): string {
  return [
    "Usage:",
    "  /story <prompt>         — generate a new story from a short idea",
    "  /story list             — show your recent stories",
    "  /story show <id>        — re-display a saved story",
    "  /story apply [id]       — apply the current draft (or a specific one)",
    "  /story archive <id>     — move a story to archived",
    "  /story remove <id>      — delete a story",
    "  /story clear            — wipe the archive",
    "",
    "Tip: after /story generates a draft, type \"apply them\" or \"yes\" to run it.",
  ].join("\n");
}

function storyList(): string {
  const items = useStoryStore.getState().listRecent(20);
  if (items.length === 0) {
    return "No stories yet. Try `/story <your idea>` to create one.";
  }
  const lines = ["Your stories:"];
  for (const s of items) {
    lines.push(fmtListItem(s));
  }
  lines.push("");
  lines.push("  /story show <id>   → re-display");
  lines.push("  /story apply <id>  → run it");
  return lines.join("\n");
}

function fmtListItem(s: StoryListItem): string {
  const statusIcon =
    s.status === "applied" ? "✓" : s.status === "archived" ? "◌" : "→";
  const shortId = s.id.slice(0, 18);
  return `  ${statusIcon} ${s.ageLabel.padStart(4)} ${shortId}  ${s.title} (${s.sceneCount} scenes)`;
}

function storyShow(id: string): string {
  const store = useStoryStore.getState();
  const story = store.getById(id);
  if (!story) {
    return `No story with id "${id}". Use /story list to see available ids.`;
  }
  // Setting it as pending lets "apply them" target this story.
  store.setPending(story.id);
  return renderStoryEnvelope(story);
}

async function storyGenerate(prompt: string): Promise<string> {
  const tracker = createTracker("/story");
  const result = await generateStory(prompt);
  if (!result.ok) {
    return `Storyteller: ${result.error}`;
  }
  if (result.tokens) tracker.trackLLM(result.tokens.input, result.tokens.output);
  tracker.announce();
  const story = useStoryStore.getState().addStory(result.story);
  return renderStoryEnvelope(story);
}

/**
 * Apply the current pending story (or a specific one by id) — push
 * its CreativeContext into session-context, set the ActiveRequest
 * subject, and fire the image-storyboard fast path via a synthetic
 * user message that the chat panel routes to the agent plugin.
 *
 * The agent plugin's existing image fast path handles the rest.
 */
async function storyApply(idOrEmpty: string): Promise<string> {
  const tracker = createTracker("/story apply");
  const store = useStoryStore.getState();
  const story = idOrEmpty
    ? store.getById(idOrEmpty)
    : store.getPending();
  if (!story) {
    return idOrEmpty
      ? `No story with id "${idOrEmpty}".`
      : "No pending story to apply. Try /story <your idea> first, or /story apply <id>.";
  }

  // 1. Push the story's CreativeContext into the session so every
  //    downstream generation inherits the style/characters. Also mark
  //    the auto-seed flag so L3 doesn't overwrite it on first gen.
  try {
    const { useSessionContext } = await import("@/lib/agents/session-context");
    useSessionContext.getState().setContext(story.context);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("storyboard:creative-context-autoseeded", "1");
    }
  } catch { /* non-fatal */ }

  // 2. Set the ActiveRequest subject so future clarifications route
  //    back to this story.
  try {
    const { useActiveRequest } = await import("@/lib/agents/active-request");
    useActiveRequest.getState().applyTurn(`${story.title}: ${story.audience}`);
  } catch { /* non-fatal */ }

  // 3. Call the image fast-path tools directly. This bypasses the LLM
  //    entirely — same deterministic path the gemini plugin uses when
  //    it detects isNewBrief + extractedScenes + no stream/video.
  const scenesPayload = story.scenes.map((s) => ({
    index: s.index - 1, // tool expects 0-based
    title: s.title.slice(0, 50),
    prompt: `${s.description}, ${story.context.style}`.slice(0, 400),
    action: "generate" as const,
  }));
  const brief = `Story: ${story.title} — ${story.arc}`;

  let createResult: { success?: boolean; data?: unknown; error?: string } | undefined;
  try {
    const { listTools } = await import("@/lib/tools/registry");
    const tools = listTools();
    const projectCreateTool = tools.find((t) => t.name === "project_create");
    const projectGenerateTool = tools.find((t) => t.name === "project_generate");
    if (!projectCreateTool || !projectGenerateTool) {
      return "Apply failed: project_create tool is not registered.";
    }
    tracker.trackTool("project_create", true);
    createResult = await projectCreateTool.execute({
      brief,
      scenes: scenesPayload,
      style_guide: {
        visual_style: story.context.style,
        color_palette: story.context.palette,
        mood: story.context.mood,
        prompt_prefix: story.context.style,
      },
    });
    if (createResult?.success && createResult.data) {
      const projectId = (createResult.data as Record<string, unknown>).project_id as string | undefined;
      if (projectId) {
        tracker.trackTool("project_generate", true);
        await projectGenerateTool.execute({ project_id: projectId });
      }
    }
  } catch (e) {
    return `Apply failed: ${e instanceof Error ? e.message : "unknown error"}`;
  }

  // 4. Mark applied and clear the pending slot.
  useStoryStore.getState().markApplied(story.id);
  useStoryStore.getState().setPending(null);

  tracker.announce();
  if (!createResult?.success) {
    return `Apply partially failed: ${createResult?.error ?? "unknown error"}`;
  }
  return `✓ Applied "${story.title}" — ${story.scenes.length} scenes generating now. Check the canvas.`;
}

// ----------------------------------------------------------------------
// Natural-language apply detection
// ----------------------------------------------------------------------

const APPLY_PHRASES = [
  /^\s*apply\s+(them|it|this|the\s+story|all)?\s*[.!]*\s*$/i,
  /^\s*yes\s*,?\s*(apply|do it|go|run|please)?\s*[.!]*\s*$/i,
  /^\s*i\s+like\s+(it|them|this)\s*[.!]*\s*$/i,
  /^\s*(perfect|great|looks good)\s*,?\s*(apply|go|do it|proceed)\s*[.!]*\s*$/i,
  /^\s*(go|proceed|do it|run it|let's go|lets go|ship it)\s*[.!]*\s*$/i,
  /^\s*(looks good|sounds good|love it)\s*[.!]*\s*$/i,
];

/**
 * True when `text` is a short affirmative that should trigger apply
 * of the pending story. Scoped tight to avoid false positives for
 * creative prompts that happen to start with "yes" or "apply".
 */
export function isApplyPendingIntent(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 60) return false;
  if (!useStoryStore.getState().getPending()) return false;
  return APPLY_PHRASES.some((re) => re.test(t));
}

/**
 * Execute apply-pending. Must only be called after isApplyPendingIntent
 * returned true. Returns the same string storyApply() returns so the
 * caller can display it as a system message.
 */
export async function applyPendingStory(): Promise<string> {
  return storyApply("");
}
