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

/**
 * Multi-turn `/context gen` clarification state.
 *
 * When the user runs `/context gen <description>` and the description is
 * too vague to confidently produce a CreativeContext, we store the
 * original description plus the questions the LLM asked, then on the
 * next `/context gen <answers>` we merge the answers with the original
 * description and retry. This is the lightweight interaction model:
 * one back-and-forth turn at most, no chat agent required.
 */
export interface PendingGen {
  originalDescription: string;
  askedQuestions: string[];
  /** Wall clock so we can expire stale pending gens after, say, 10 min */
  startedAt: number;
}

interface SessionContextState {
  /** Active creative context (null = no context, agent is stateless) */
  context: CreativeContext | null;
  /** When the context was set */
  createdAt: number;
  /** Brief summary shown in UI */
  summary: string;
  /** Pending /context gen clarification, if the last gen needed more detail */
  pendingGen: PendingGen | null;

  /** Set the full context (from LLM extraction or manual edit) */
  setContext: (ctx: CreativeContext) => void;
  /** Update specific fields */
  updateContext: (patch: Partial<CreativeContext>) => void;
  /** Clear the context (start fresh) */
  clearContext: () => void;
  /** Build a prompt prefix from the active context (~30-50 words) */
  buildPrefix: () => string;
  /** Multi-turn /context gen helpers */
  setPendingGen: (p: PendingGen) => void;
  clearPendingGen: () => void;
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
  pendingGen: null,

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
    set({ context: null, createdAt: 0, summary: "", pendingGen: null }),

  buildPrefix: () => {
    const ctx = get().context;
    if (!ctx) return "";
    return buildPrefixFromContext(ctx);
  },

  setPendingGen: (p) => set({ pendingGen: p }),
  clearPendingGen: () => set({ pendingGen: null }),
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

/**
 * Result of `generateContextFromDescription`. Either we got a usable
 * context back (kind="context") or we need a quick clarification turn
 * from the user (kind="clarify").
 */
export type GenContextResult =
  | { kind: "context"; context: CreativeContext }
  | { kind: "clarify"; questions: string[] }
  | { kind: "error"; message: string };

/**
 * Take a user-supplied description, ask the LLM to produce (and
 * enrich) a CreativeContext from it. If the description is too vague
 * to confidently produce one, the LLM returns 1-3 specific questions
 * the user should answer instead — those are returned as a `clarify`
 * result so the slash-command handler can store a pending gen and
 * prompt for the answers on the next turn.
 *
 * "Enrichment" means the LLM is allowed to fill in plausible defaults
 * for unstated fields (e.g., if the user says "Studio Ghibli short
 * film about a cat", the LLM may infer a warm magical mood and a
 * pastoral setting). Inferred fields are still returned as-if stated;
 * the user can override them via `/context edit` after.
 */
export async function generateContextFromDescription(
  description: string,
): Promise<GenContextResult> {
  const trimmed = description.trim();
  if (!trimmed) {
    return { kind: "error", message: "Empty description" };
  }

  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are a creative director helping build a Creative Context for a storyboard project. The user has given you a description. Your job is to either:

(A) Produce a complete CreativeContext with 6 fields, enriching the user's description with reasonable defaults where they did not specify. Use the user's stated style, setting, and characters as a hard constraint and infer the rest.

(B) If the description is genuinely too vague (under ~5 specific words, no concrete subject, no genre, no setting), ask 1-3 specific clarifying questions. Only ask if you truly cannot enrich — most descriptions over 10 words have enough.

User's description:
"""
${trimmed.slice(0, 1500)}
"""

Reply in EXACTLY one of these two formats. No preamble, no markdown, no other text.

Format A (you can produce a context):
STYLE: <visual style/technique in under 15 words>
PALETTE: <color palette in under 15 words>
CHARACTERS: <main character descriptions in under 25 words>
SETTING: <where and when in under 15 words>
RULES: <creative rules/constraints in under 20 words>
MOOD: <emotional tone in under 10 words>

Format B (you need clarification):
NEEDS_CLARIFICATION
QUESTION: <specific question, under 15 words>
QUESTION: <specific question, under 15 words>
QUESTION: <specific question, under 15 words>`,
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      return { kind: "error", message: `Gemini API ${resp.status}` };
    }
    const data = await resp.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Format B — needs clarification
    if (/\bNEEDS_CLARIFICATION\b/i.test(text)) {
      const questions: string[] = [];
      const questionRe = /^QUESTION:\s*(.+)$/gim;
      let m: RegExpExecArray | null;
      while ((m = questionRe.exec(text)) !== null) {
        const q = m[1].trim();
        if (q) questions.push(q);
      }
      if (questions.length === 0) {
        // LLM said NEEDS_CLARIFICATION but produced no questions —
        // give the user a generic one rather than failing.
        questions.push(
          "What's the visual style?",
          "Who are the main characters?",
          "Where and when does it take place?",
        );
      }
      return { kind: "clarify", questions: questions.slice(0, 5) };
    }

    // Format A — parse the structured fields. Use line-bounded matching:
    // `[^\n]+` instead of `.+` so an empty `STYLE:` line doesn't greedily
    // capture the next label (`PALETTE:`) on the line after it. The `m`
    // flag makes `^` and `$` match per-line so we can require the label
    // start at the beginning of a line and the value end at the line end.
    const get = (label: string): string => {
      const match = text.match(new RegExp(`^\\s*${label}:[ \\t]*([^\\n]+?)[ \\t]*$`, "im"));
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
    // Validate — at least style and characters should be present, otherwise
    // treat as a soft failure and ask for clarification.
    if (!ctx.style && !ctx.characters && !ctx.setting) {
      return {
        kind: "clarify",
        questions: [
          "What's the visual style?",
          "Who are the main characters?",
          "Where and when does it take place?",
        ],
      };
    }
    return { kind: "context", context: ctx };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}
