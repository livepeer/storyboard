/**
 * Tier 1: working memory. Always-injected, token-budgeted, mutable
 * via small set methods. The marshal() function produces the prompt
 * prefix that gets prepended to every LLM call by the runner.
 *
 * Token budget: 800 tokens hard cap. Skills can spend up to 600 of
 * that on their constraints per [INV-3]; the remaining 200 is for
 * context + focus + recent turns + pinned facts.
 */

import type { WorkingMemory, CreativeContext, PinnedFact, Focus } from "./types.js";
import type { ConversationTurn } from "../types.js";

const MAX_RECENT_TURNS = 10;
const MAX_PINNED = 10;
const PROMPT_BUDGET_TOKENS = 800;
/** Rough chars-per-token heuristic for budget enforcement. */
const CHARS_PER_TOKEN = 4;

export class WorkingMemoryStore {
  private wm: WorkingMemory;

  constructor(initial?: Partial<WorkingMemory>) {
    this.wm = {
      context: initial?.context ?? emptyContext(),
      focus: initial?.focus ?? {},
      recent_turns: initial?.recent_turns ?? [],
      pinned: initial?.pinned ?? [],
      critical_constraints: initial?.critical_constraints ?? [],
    };
  }

  setContext(ctx: CreativeContext): void {
    this.wm.context = ctx;
  }

  patchContext(patch: Partial<CreativeContext>): void {
    this.wm.context = { ...this.wm.context, ...patch };
  }

  setFocus(focus: Focus): void {
    this.wm.focus = focus;
  }

  addTurn(turn: ConversationTurn): void {
    this.wm.recent_turns.push(turn);
    if (this.wm.recent_turns.length > MAX_RECENT_TURNS) {
      this.wm.recent_turns.splice(0, this.wm.recent_turns.length - MAX_RECENT_TURNS);
    }
  }

  pin(text: string): PinnedFact {
    const fact: PinnedFact = {
      id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      ts: Date.now(),
    };
    this.wm.pinned.push(fact);
    if (this.wm.pinned.length > MAX_PINNED) {
      this.wm.pinned.splice(0, this.wm.pinned.length - MAX_PINNED);
    }
    return fact;
  }

  unpin(id: string): void {
    this.wm.pinned = this.wm.pinned.filter((f) => f.id !== id);
  }

  setCriticalConstraints(constraints: string[]): void {
    this.wm.critical_constraints = constraints;
  }

  snapshot(): WorkingMemory {
    return structuredClone(this.wm);
  }

  /**
   * Marshal the working memory into a prompt prefix, enforcing the
   * token budget by truncating older recent_turns first, then trimming
   * pinned facts, then truncating critical_constraints.
   *
   * [INV-3]: caller should also enforce a 600-char skill prompt
   * budget separately; that's checked by the skill loader.
   */
  marshal(): { text: string; estimated_tokens: number; truncated: boolean } {
    let text = formatWM(this.wm);
    let estimated = Math.ceil(text.length / CHARS_PER_TOKEN);
    let truncated = false;

    // Truncation order: recent_turns (oldest first), then pinned, then constraints
    let copy = structuredClone(this.wm);
    while (estimated > PROMPT_BUDGET_TOKENS && copy.recent_turns.length > 0) {
      copy.recent_turns.shift();
      truncated = true;
      text = formatWM(copy);
      estimated = Math.ceil(text.length / CHARS_PER_TOKEN);
    }
    while (estimated > PROMPT_BUDGET_TOKENS && copy.pinned.length > 0) {
      copy.pinned.shift();
      truncated = true;
      text = formatWM(copy);
      estimated = Math.ceil(text.length / CHARS_PER_TOKEN);
    }
    while (estimated > PROMPT_BUDGET_TOKENS && copy.critical_constraints.length > 0) {
      copy.critical_constraints.shift();
      truncated = true;
      text = formatWM(copy);
      estimated = Math.ceil(text.length / CHARS_PER_TOKEN);
    }

    return { text, estimated_tokens: estimated, truncated };
  }
}

function emptyContext(): CreativeContext {
  return { style: "", palette: "", characters: "", setting: "", rules: "", mood: "" };
}

function formatWM(wm: WorkingMemory): string {
  const lines: string[] = [];
  if (hasContext(wm.context)) {
    lines.push("CREATIVE CONTEXT:");
    if (wm.context.style) lines.push(`  Style: ${wm.context.style}`);
    if (wm.context.palette) lines.push(`  Palette: ${wm.context.palette}`);
    if (wm.context.characters) lines.push(`  Characters: ${wm.context.characters}`);
    if (wm.context.setting) lines.push(`  Setting: ${wm.context.setting}`);
    if (wm.context.rules) lines.push(`  Rules: ${wm.context.rules}`);
    if (wm.context.mood) lines.push(`  Mood: ${wm.context.mood}`);
    lines.push("");
  }
  if (wm.focus.project_id || wm.focus.scene_index !== undefined || wm.focus.mode) {
    lines.push("FOCUS:");
    if (wm.focus.project_id) lines.push(`  Project: ${wm.focus.project_id}`);
    if (wm.focus.scene_index !== undefined) lines.push(`  Scene: ${wm.focus.scene_index}`);
    if (wm.focus.mode) lines.push(`  Mode: ${wm.focus.mode}`);
    lines.push("");
  }
  if (wm.pinned.length > 0) {
    lines.push("PINNED FACTS:");
    for (const f of wm.pinned) lines.push(`  - ${f.text}`);
    lines.push("");
  }
  if (wm.critical_constraints.length > 0) {
    lines.push("CONSTRAINTS:");
    for (const c of wm.critical_constraints) lines.push(`  - ${c}`);
    lines.push("");
  }
  if (wm.recent_turns.length > 0) {
    lines.push("RECENT TURNS:");
    for (const t of wm.recent_turns) {
      const role = t.message.role.toUpperCase();
      lines.push(`  ${role}: ${t.message.content}`);
    }
  }
  return lines.join("\n");
}

function hasContext(ctx: CreativeContext): boolean {
  return Object.values(ctx).some((v) => v && v.length > 0);
}
