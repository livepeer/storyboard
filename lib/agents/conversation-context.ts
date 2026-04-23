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
