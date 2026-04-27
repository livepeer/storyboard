/**
 * Conversation context singleton for storyboard.
 * Tracks active work item so continuation messages resolve correctly.
 */

import { createConversationContext, type ConversationContextState } from "@livepeer/creative-kit";
import type { StoreApi } from "zustand/vanilla";

let _store: StoreApi<ConversationContextState> | null = null;

export function getConversationContext(): StoreApi<ConversationContextState> {
  if (!_store) {
    _store = createConversationContext();
  }
  return _store;
}

/** Set the active work item. Call this when a story/film/project is created. */
export function setActiveWork(type: "story" | "film" | "project" | "stream", id: string, title: string, summary: string) {
  getConversationContext().getState().setActiveWork({
    type, id, title, summary,
    activatedAt: Date.now(),
  });
}

/**
 * Reset all context for a fresh creative start.
 * Called when the user runs /story, /film, or any new creation command.
 * Clears: SessionContext (style DNA), ConversationContext (active work),
 * ActiveRequest (subject tracker), and the auto-seed flag.
 *
 * The NEW work item's context replaces these after generation succeeds.
 * This prevents old styles/characters from bleeding into new creations.
 */
export function resetForNewWork() {
  // Clear active work item
  getConversationContext().getState().clearActiveWork();

  // Clear creative context (style, characters, mood from previous work)
  try {
    const { useSessionContext } = require("@/lib/agents/session-context");
    useSessionContext.getState().clearContext();
  } catch { /* not available */ }

  // Deactivate current project so new work doesn't inherit or add to it
  try {
    const { useProjectStore } = require("@/lib/projects/store");
    useProjectStore.getState().setActiveProject(null);
  } catch { /* not available */ }

  // Clear active request (subject tracker)
  try {
    const { useActiveRequest } = require("@/lib/agents/active-request");
    useActiveRequest.getState().reset();
  } catch { /* not available */ }

  // Clear auto-seed flag so the new work's context takes over
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem("storyboard:creative-context-autoseeded");
  }
}

/** Get context prompt to inject into agent system message. */
export function getConversationPrompt(): string {
  return getConversationContext().getState().getContextPrompt();
}

/** Check if a user message is a continuation of active work. */
export function detectContinuation(text: string): string | null {
  const ctx = getConversationContext().getState();
  if (!ctx.isContinuation(text)) return null;
  return ctx.buildContinuationPrompt(text);
}
