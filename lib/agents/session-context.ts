/**
 * Creative Session Context — persistent memory of the creative brief's essence.
 *
 * Auto-extracted from the first large brief via LLM. Injected as a prompt
 * prefix into every subsequent media generation. Visible and editable by
 * the user. This is what makes "give me 8 more" produce scenes that match
 * the original Ghibli style instead of random output.
 */

import { create } from "zustand";

export interface CreativeContext {
  /** Visual style/technique ("Studio Ghibli, hand-painted watercolor") */
  style: string;
  /** Color palette ("burnt sienna, sage green, soft ochre") */
  palette: string;
  /** Character descriptions ("girl ~10, windswept hair, skateboard") */
  characters: string;
  /** Setting/environment ("countryside village, late summer afternoon") */
  setting: string;
  /** Creative rules ("always in motion, animals in every scene") */
  rules: string;
  /** Emotional mood/tone ("warm, magical, joyful") */
  mood: string;
}

interface SessionContextState {
  /** Active creative context (null = no context, agent is stateless) */
  context: CreativeContext | null;
  /** When the context was set */
  createdAt: number;
  /** Brief summary shown in UI */
  summary: string;

  /** Set the full context (from LLM extraction or manual edit) */
  setContext: (ctx: CreativeContext) => void;
  /** Update specific fields */
  updateContext: (patch: Partial<CreativeContext>) => void;
  /** Clear the context (start fresh) */
  clearContext: () => void;
  /** Build a prompt prefix from the active context (~30-50 words) */
  buildPrefix: () => string;
}

function buildSummary(ctx: CreativeContext): string {
  const parts: string[] = [];
  if (ctx.style) parts.push(ctx.style.split(",")[0].trim());
  if (ctx.characters) parts.push(ctx.characters.split(",")[0].trim());
  if (ctx.setting) parts.push(ctx.setting.split(",")[0].trim());
  return parts.join(", ") || "Active context";
}

export function buildPrefixFromContext(ctx: CreativeContext): string {
  // Build an assertive prefix that models will follow.
  // Style and characters are the most important for consistency.
  const parts: string[] = [];
  if (ctx.style) parts.push(ctx.style);
  if (ctx.characters) parts.push(ctx.characters);
  if (ctx.palette) parts.push(ctx.palette);
  if (ctx.setting) parts.push(ctx.setting);
  if (ctx.mood) parts.push(ctx.mood);
  // Keep under ~50 words
  const prefix = parts.join(", ");
  const words = prefix.split(/\s+/);
  return (words.length > 60 ? words.slice(0, 60).join(" ") : prefix) + ", ";
}

export const useSessionContext = create<SessionContextState>((set, get) => ({
  context: null,
  createdAt: 0,
  summary: "",

  setContext: (ctx) =>
    set({
      context: ctx,
      createdAt: Date.now(),
      summary: buildSummary(ctx),
    }),

  updateContext: (patch) =>
    set((s) => {
      if (!s.context) return s;
      const updated = { ...s.context, ...patch };
      return { context: updated, summary: buildSummary(updated) };
    }),

  clearContext: () =>
    set({ context: null, createdAt: 0, summary: "" }),

  buildPrefix: () => {
    const ctx = get().context;
    if (!ctx) return "";
    return buildPrefixFromContext(ctx);
  },
}));

/**
 * Extract Creative DNA from a brief using a lightweight LLM call.
 * ~200 tokens, no tools — just extraction.
 */
export async function extractCreativeContext(brief: string): Promise<CreativeContext | null> {
  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{
              text: `Extract the creative essence from this brief. Reply in EXACTLY this format (one line each, no labels, just the values):

STYLE: <visual style/technique in under 15 words>
PALETTE: <color palette in under 15 words>
CHARACTERS: <main character descriptions in under 20 words>
SETTING: <where and when in under 15 words>
RULES: <creative rules/constraints in under 20 words>
MOOD: <emotional tone in under 10 words>

Brief:
${brief.slice(0, 2000)}`,
            }],
          },
        ],
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse the structured response
    const get = (label: string): string => {
      const match = text.match(new RegExp(`${label}:\\s*(.+)`, "i"));
      return match?.[1]?.trim() || "";
    };

    const ctx: CreativeContext = {
      style: get("STYLE"),
      palette: get("PALETTE"),
      characters: get("CHARACTERS"),
      setting: get("SETTING"),
      rules: get("RULES"),
      mood: get("MOOD"),
    };

    // Validate — at least style and characters should be present
    if (!ctx.style && !ctx.characters) return null;
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Update the context based on user feedback (e.g., "wrong style, use ghibli").
 * Uses LLM to determine what to change.
 */
export async function updateContextFromFeedback(
  currentContext: CreativeContext,
  feedback: string
): Promise<Partial<CreativeContext> | null> {
  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{
              text: `Current creative context:
STYLE: ${currentContext.style}
PALETTE: ${currentContext.palette}
CHARACTERS: ${currentContext.characters}
SETTING: ${currentContext.setting}
RULES: ${currentContext.rules}
MOOD: ${currentContext.mood}

User feedback: "${feedback.slice(0, 300)}"

Which fields need updating? Reply with ONLY the changed fields in the same format. If a field doesn't change, don't include it. Example:
STYLE: new style here
MOOD: new mood here`,
            }],
          },
        ],
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const patch: Partial<CreativeContext> = {};
    const get = (label: string): string | undefined => {
      const match = text.match(new RegExp(`${label}:\\s*(.+)`, "i"));
      return match?.[1]?.trim();
    };

    const style = get("STYLE");
    if (style) patch.style = style;
    const palette = get("PALETTE");
    if (palette) patch.palette = palette;
    const characters = get("CHARACTERS");
    if (characters) patch.characters = characters;
    const setting = get("SETTING");
    if (setting) patch.setting = setting;
    const rules = get("RULES");
    if (rules) patch.rules = rules;
    const mood = get("MOOD");
    if (mood) patch.mood = mood;

    return Object.keys(patch).length > 0 ? patch : null;
  } catch {
    return null;
  }
}
