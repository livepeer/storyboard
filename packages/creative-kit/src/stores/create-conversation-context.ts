/**
 * ConversationContext — tracks what the user is currently working on
 * so continuation messages ("add more scenes", "make it darker") can
 * resolve to the right work item without the user re-specifying.
 *
 * This is the missing link between:
 * - /story → creates a story → user says "add more" → story_continue
 * - /film → creates a film → user says "change shot 2" → film_edit
 * - create_media → user says "darker" → regenerate with context
 */

export type WorkItemType = "story" | "film" | "project" | "stream" | "image" | null;

export interface WorkItem {
  type: WorkItemType;
  id: string;
  title: string;
  /** Brief context for the agent: "6-scene story about dragon adventure" */
  summary: string;
  /** When this work item was set as active */
  activatedAt: number;
}

export interface ConversationContextState {
  /** The current active work item */
  activeWork: WorkItem | null;
  /** Recent work items (for "go back to the story" type references) */
  recentWork: WorkItem[];
  /** Set the active work item */
  setActiveWork: (item: WorkItem) => void;
  /** Clear active work */
  clearActiveWork: () => void;
  /** Get a context string to inject into the agent system prompt */
  getContextPrompt: () => string;
  /** Detect if a message is a continuation of the active work */
  isContinuation: (text: string) => boolean;
  /** Build a continuation instruction for the agent */
  buildContinuationPrompt: (text: string) => string | null;
}

/** Patterns that indicate the user wants to continue/extend current work */
const CONTINUATION_PATTERNS = [
  /\b(add|append|extend|include|insert)\b.*\b(more|additional|extra|new)\b.*\b(scene|shot|frame|step)/i,
  /\b(add|append)\b.*\b(scene|shot|frame)/i,
  /\bmore scenes?\b/i,
  /\bcontinue\b/i,
  /\bkeep going\b/i,
  /\bproceed\b/i,
  /\byes\b.*\b(add|go|do|proceed|create|make)\b/i,
  /\bgo ahead\b/i,
  /\bdo it\b/i,
  /\bsounds good\b.*\b(add|go|proceed|make)\b/i,
];

/** Patterns that indicate editing existing work */
const EDIT_PATTERNS = [
  /\b(change|edit|update|modify|fix|replace|rewrite)\b.*\b(scene|shot|frame|title|style)\b/i,
  /\bscene\s+\d+\b.*\b(should|needs?|make|change)\b/i,
  /\bmake\b.*\b(it|scene|shot)\b.*\b(more|less|darker|brighter|different)\b/i,
];

const MAX_RECENT = 5;
const STALE_MS = 30 * 60 * 1000; // 30 minutes

import { createStore } from "zustand/vanilla";

export function createConversationContext() {
  return createStore<ConversationContextState>((set, get) => ({
    activeWork: null,
    recentWork: [],

    setActiveWork: (item) => {
      set((s) => {
        const recent = [
          item,
          ...s.recentWork.filter((r) => r.id !== item.id),
        ].slice(0, MAX_RECENT);
        return { activeWork: item, recentWork: recent };
      });
    },

    clearActiveWork: () => set({ activeWork: null }),

    getContextPrompt: () => {
      const { activeWork } = get();
      if (!activeWork) return "";
      if (Date.now() - activeWork.activatedAt > STALE_MS) return "";
      return `Active work: [${activeWork.type}] "${activeWork.title}" (id: ${activeWork.id}). ${activeWork.summary}. The user may want to continue, edit, or build on this.`;
    },

    isContinuation: (text: string) => {
      const { activeWork } = get();
      if (!activeWork) return false;
      if (Date.now() - activeWork.activatedAt > STALE_MS) return false;
      const lower = text.toLowerCase();
      return CONTINUATION_PATTERNS.some((p) => p.test(lower))
        || EDIT_PATTERNS.some((p) => p.test(lower));
    },

    buildContinuationPrompt: (text: string) => {
      const { activeWork } = get();
      if (!activeWork) return null;
      if (Date.now() - activeWork.activatedAt > STALE_MS) return null;

      const lower = text.toLowerCase();
      const isEdit = EDIT_PATTERNS.some((p) => p.test(lower));
      const isContinue = CONTINUATION_PATTERNS.some((p) => p.test(lower));

      if (!isEdit && !isContinue) return null;

      if (activeWork.type === "story") {
        if (isContinue) {
          return `The user wants to add more scenes to their active story "${activeWork.title}" (id: ${activeWork.id}). Use /story show ${activeWork.id} to see it, then generate additional scenes that match the existing style, characters, and setting. The user said: "${text}"`;
        }
        if (isEdit) {
          return `The user wants to edit their active story "${activeWork.title}" (id: ${activeWork.id}). The story is already displayed in the chat — the user can click any text field to edit in place. Remind them: "Click any text in the story card above to edit it directly — title, scenes, style, characters. Then click Apply when ready." The user said: "${text}"`;
        }
      }

      if (activeWork.type === "film") {
        if (isContinue) {
          return `The user wants to extend their active film "${activeWork.title}" (id: ${activeWork.id}). Generate additional shots that match the existing style and character lock. The user said: "${text}"`;
        }
        if (isEdit) {
          return `The user wants to edit their active film "${activeWork.title}" (id: ${activeWork.id}). Remind them they can click any field in the film card to edit in place. The user said: "${text}"`;
        }
      }

      if (activeWork.type === "project") {
        if (isContinue) {
          return `The user wants to add more scenes to project "${activeWork.title}" (id: ${activeWork.id}). Use create_media with additional steps that match the project's style. The user said: "${text}"`;
        }
      }

      return null;
    },
  }));
}
