/**
 * Active Request — structured memory of "what the user is currently
 * trying to create", rebuilt deterministically from each turn's text.
 *
 * Why this exists: the agent runner is instantiated fresh per turn
 * (see lib/agents/gemini/index.ts:317), so neither prior user messages
 * nor prior assistant replies are carried across. That makes the LLM
 * forget the subject between clarification rounds ("5 pictures of cat
 * playing with bulldog" → "outdoor" → images have no bulldog).
 *
 * ActiveRequest sidesteps the token cost of sending full history by
 * keeping a ~20-token compact record of subject / modifiers / count /
 * mediaType that the system prompt re-injects every turn. The
 * classifyUserTurn() extractor updates it deterministically — no LLM,
 * no round-trip — so it's cheap, predictable, and testable.
 */

import { create } from "zustand";

export interface ActiveRequest {
  /** The core subject the user is iterating on, e.g. "cat playing with bulldog". */
  subject: string;
  /** How many items the user asked for, 0 if unspecified. */
  count: number;
  /**
   * Clarification answers and corrections accumulated across turns,
   * e.g. ["outdoor", "city"]. Most-recent last.
   */
  modifiers: string[];
  /** "image" | "video" | "audio" | null (null when not inferable). */
  mediaType: MediaType | null;
  /** ms since epoch; used by isStale(). */
  lastUpdatedAt: number;
}

export type MediaType = "image" | "video" | "audio";

/** How the extractor classified a turn — drives how we patch state. */
export type TurnKind =
  | "new"        // user is starting a fresh creative request
  | "clarify"    // short answer to an agent question (append modifier)
  | "correct"    // explicit correction, merge into subject
  | "unrelated"; // not a creative turn (e.g. "thanks", "what's next")

export interface TurnClassification {
  kind: TurnKind;
  /** Partial state to apply. Fields left undefined are untouched. */
  patch: {
    subject?: string;
    count?: number;
    modifierToAppend?: string;
    subjectAddendum?: string;
    mediaType?: MediaType | null;
  };
}

const EMPTY: ActiveRequest = {
  subject: "",
  count: 0,
  modifiers: [],
  mediaType: null,
  lastUpdatedAt: 0,
};

// --------------------------------------------------------------------
// Zustand store
// --------------------------------------------------------------------

interface ActiveRequestState extends ActiveRequest {
  applyTurn: (text: string) => void;
  reset: () => void;
  /** Snapshot without the zustand internals — for serialization/display. */
  snapshot: () => ActiveRequest;
  /** True when the request is empty or older than 30 min. */
  isStale: () => boolean;
}

const STALE_MS = 30 * 60 * 1000; // 30 minutes

export const useActiveRequest = create<ActiveRequestState>((set, get) => ({
  ...EMPTY,

  applyTurn: (text) => {
    const cls = classifyUserTurn(text, get());
    const now = Date.now();
    if (cls.kind === "unrelated") return;

    if (cls.kind === "new") {
      set({
        subject: cls.patch.subject ?? "",
        count: cls.patch.count ?? 0,
        modifiers: [],
        mediaType: cls.patch.mediaType ?? null,
        lastUpdatedAt: now,
      });
      return;
    }

    if (cls.kind === "clarify") {
      const mod = cls.patch.modifierToAppend?.trim();
      if (!mod) return;
      // De-dupe: if the user repeats the same answer, don't append twice.
      const existing = get().modifiers;
      if (existing[existing.length - 1]?.toLowerCase() === mod.toLowerCase()) {
        set({ lastUpdatedAt: now });
        return;
      }
      set({ modifiers: [...existing, mod], lastUpdatedAt: now });
      return;
    }

    if (cls.kind === "correct") {
      const current = get();
      const merged = mergeSubjects(current.subject, cls.patch.subjectAddendum ?? "");
      set({ subject: merged, lastUpdatedAt: now });
      // Apply any media type the correction revealed (e.g. "make it a video").
      if (cls.patch.mediaType !== undefined && cls.patch.mediaType !== null) {
        set({ mediaType: cls.patch.mediaType });
      }
      return;
    }
  },

  reset: () => set({ ...EMPTY }),

  snapshot: () => {
    const s = get();
    return {
      subject: s.subject,
      count: s.count,
      modifiers: [...s.modifiers],
      mediaType: s.mediaType,
      lastUpdatedAt: s.lastUpdatedAt,
    };
  },

  isStale: () => {
    const s = get();
    if (!s.subject) return true;
    return Date.now() - s.lastUpdatedAt > STALE_MS;
  },
}));

/** One-line compact form for injection into a system prompt. */
export function formatActiveRequest(r: ActiveRequest): string {
  if (!r.subject) return "";
  const parts: string[] = [];
  if (r.count > 0) parts.push(`${r.count}`);
  if (r.mediaType) parts.push(r.mediaType === "image" ? "images" : r.mediaType === "video" ? "videos" : "audio clips");
  else if (r.count > 0) parts.push("items");
  const lead = parts.join(" ").trim();
  const mods = r.modifiers.length > 0 ? ` [${r.modifiers.join(", ")}]` : "";
  return `${lead ? lead + " of " : ""}"${r.subject}"${mods}`;
}

// --------------------------------------------------------------------
// Classifier (deterministic, no LLM)
// --------------------------------------------------------------------

/**
 * Classify a single user turn into one of {new, clarify, correct, unrelated}
 * given the current ActiveRequest snapshot. Pure function — no side
 * effects, safe to unit-test in isolation.
 */
export function classifyUserTurn(
  rawText: string,
  current: ActiveRequest
): TurnClassification {
  const text = rawText.trim();
  if (!text) return { kind: "unrelated", patch: {} };

  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  // 1. Unrelated chit-chat. Checked first so we don't misclassify "thanks"
  //    as a clarification.
  if (isChitChat(lower)) return { kind: "unrelated", patch: {} };

  // 2. Reset / stop commands -> unrelated (caller decides what to do).
  if (/^(stop|cancel|never\s*mind|start\s*over|reset)\b/i.test(lower)) {
    return { kind: "unrelated", patch: {} };
  }

  // 3. New request detection. Looks for either:
  //    - an explicit create verb ("make", "create", "generate", "draw", "give me", "show me")
  //    - a count noun pattern ("5 pictures of X", "3 videos of X")
  //    - a long, subject-bearing message (> 8 words with a noun phrase)
  const createMatch =
    text.match(/\b(?:make|create|generate|draw|design|produce|give\s+me|show\s+me|i\s+want|i'd\s+like)\s+(?:(\d+)\s+)?(?:(?:a|an|some|the)\s+)?(.{3,})/i);
  const countOfMatch = text.match(/^\s*(\d+)\s+(\w+)\s+of\s+(.{3,})/i);
  const isLikelyNewSubject =
    wordCount >= 5 && hasSubjectNoun(lower) && !isClarificationAnswer(lower, current);

  if (countOfMatch) {
    const n = parseInt(countOfMatch[1], 10);
    const mediaType = detectMediaType(countOfMatch[2]) ?? detectMediaType(lower);
    const subject = cleanSubject(countOfMatch[3]);
    if (subject) {
      return {
        kind: "new",
        patch: { subject, count: n, mediaType },
      };
    }
  }

  if (createMatch) {
    const n = createMatch[1] ? parseInt(createMatch[1], 10) : 0;
    const rest = cleanSubject(createMatch[2]);
    const mediaType = detectMediaType(lower);
    if (rest) {
      return {
        kind: "new",
        patch: { subject: rest, count: n, mediaType },
      };
    }
  }

  if (isLikelyNewSubject) {
    const mediaType = detectMediaType(lower);
    return {
      kind: "new",
      patch: { subject: cleanSubject(text), count: 0, mediaType },
    };
  }

  // 4. If we have an active subject, try clarification and correction.
  if (current.subject) {
    // 4a. Explicit correction — "with X", "also with X", "add X", "now add X",
    //     "also include X", "include X", "keep X", "recreate with X",
    //     "redo with X", "regenerate with X", "correct to X", "actually X".
    const correctionMatch = text.match(
      /\b(?:with|also\s+with|also\s+include|include|keep|add|now\s+add|correct(?:ion)?(?:\s+to)?|actually|it\s+should\s+(?:be|have)|should\s+(?:be|have)|recreate\s+with|redo\s+with|regenerate\s+with)\s+(.+)/i
    );
    if (correctionMatch) {
      const addendum = cleanSubject(correctionMatch[1]);
      if (addendum) {
        const mediaType = detectMediaType(lower);
        return {
          kind: "correct",
          patch: { subjectAddendum: addendum, mediaType: mediaType ?? null },
        };
      }
    }

    // 4b. Short answer clarification. ≤4 words, no verb, likely a modifier.
    if (wordCount <= 5 && !hasActionVerb(lower)) {
      return {
        kind: "clarify",
        patch: { modifierToAppend: text },
      };
    }

    // 4c. Medium-length non-create message that's still plausibly a
    //     direction/feedback — treat as clarification (append as modifier).
    if (wordCount <= 12 && !hasActionVerb(lower) && !isLikelyNewSubject) {
      return {
        kind: "clarify",
        patch: { modifierToAppend: text },
      };
    }
  }

  // 5. Fallback: if there's no active subject and the message wasn't clearly
  //    a new request, treat as unrelated rather than inventing state.
  return { kind: "unrelated", patch: {} };
}

// --------------------------------------------------------------------
// Helpers (exported for tests)
// --------------------------------------------------------------------

const CHIT_CHAT_PATTERNS: RegExp[] = [
  /^(thanks?|thank\s*you|ty|ok(?:ay)?|cool|nice|great|awesome|perfect|good|yes|no|yep|nope|sure|hi|hello|hey)[!.\s]*$/i,
  /^(what(?:'s)?\s*next|what\s+else|got\s+it)[?!.\s]*$/i,
];

function isChitChat(lower: string): boolean {
  return CHIT_CHAT_PATTERNS.some((re) => re.test(lower));
}

const ACTION_VERBS = [
  "make", "create", "generate", "draw", "design", "produce", "build",
  "show", "give", "paint", "sketch", "render", "animate", "remove",
  "change", "replace", "turn", "convert",
];

function hasActionVerb(lower: string): boolean {
  return ACTION_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(lower));
}

const SUBJECT_INDICATORS = [
  // Common creative nouns — not exhaustive, just enough to tell
  // "outdoor" (no noun) from "dragon flying over a castle" (nouns).
  "cat", "dog", "bird", "fish", "dragon", "monster", "robot", "hero",
  "man", "woman", "boy", "girl", "child", "people", "person",
  "bike", "car", "ship", "plane", "train", "castle", "city", "forest",
  "mountain", "beach", "river", "lake", "sky", "star", "moon", "sun",
  "house", "tree", "flower", "sword", "book", "scene", "picture",
  "image", "photo", "video", "clip", "animation",
];

function hasSubjectNoun(lower: string): boolean {
  return SUBJECT_INDICATORS.some((n) => new RegExp(`\\b${n}s?\\b`).test(lower));
}

/** True when the short reply resembles a direct answer to a clarifying Q. */
function isClarificationAnswer(lower: string, current: ActiveRequest): boolean {
  if (!current.subject) return false;
  // Short + no verb = almost certainly an answer
  const words = lower.split(/\s+/);
  if (words.length <= 3 && !hasActionVerb(lower)) return true;
  return false;
}

function detectMediaType(lower: string): MediaType | null {
  if (/\b(video|clip|animation|animated|movie|film)s?\b/.test(lower)) return "video";
  if (/\b(audio|sound|song|music|voice|tts)s?\b/.test(lower)) return "audio";
  if (/\b(image|picture|photo|pic|illustration|drawing|render)s?\b/.test(lower)) return "image";
  return null;
}

function cleanSubject(raw: string): string {
  return raw
    .trim()
    .replace(/[.!?,;:]+$/, "")
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

function mergeSubjects(current: string, addendum: string): string {
  if (!current) return addendum;
  if (!addendum) return current;
  const lowerCurrent = current.toLowerCase();
  const lowerAdd = addendum.toLowerCase();
  // If addendum already in subject (dedupe), keep as-is.
  if (lowerCurrent.includes(lowerAdd)) return current;
  // If current already in addendum, use addendum (user rewrote more fully).
  if (lowerAdd.includes(lowerCurrent)) return addendum;
  // Otherwise concatenate with " with " for readability.
  return `${current} with ${addendum}`.slice(0, 300);
}
