import type { ConversationTurn, ToolCall, ToolResult, ProjectId } from "../types.js";

/** The Creative Context — porting from storyboard's session-context.ts */
export interface CreativeContext {
  style: string;
  palette: string;
  characters: string;
  setting: string;
  rules: string;
  mood: string;
}

/** A pinned fact the user has explicitly added to working memory. */
export interface PinnedFact {
  id: string;
  text: string;
  ts: number;
}

/** The current focus — what the user is actively working on. */
export interface Focus {
  project_id?: ProjectId;
  scene_index?: number;
  mode?: string;
}

/** Tier 1 working memory — always injected into LLM calls. */
export interface WorkingMemory {
  context: CreativeContext;
  focus: Focus;
  /** Last 5–10 turns verbatim. */
  recent_turns: ConversationTurn[];
  pinned: PinnedFact[];
  critical_constraints: string[];
}

/** A media artifact (image, video, stream) tracked in session memory. */
export interface Artifact {
  id: string;
  kind: "image" | "video" | "audio" | "stream";
  prompt: string;
  url?: string;
  capability?: string;
  params?: Record<string, unknown>;
  /** Optional parent artifact for derivation (e.g. an edit of an earlier image). */
  parent_artifact_id?: string;
  /** Branch this artifact lives on (for undo/rewind). */
  branch: string;
  ts: number;
}

/** A logged tool call. */
export interface LoggedToolCall {
  id: string;
  call: ToolCall;
  result?: ToolResult;
  ts: number;
  /** Branch this happened on. */
  branch: string;
}

/** A decision the user made — accept / reject / undo. */
export interface Decision {
  id: string;
  kind: "accept" | "reject" | "undo" | "rewind";
  target_artifact_id?: string;
  note?: string;
  ts: number;
  branch: string;
}

/** Tier 2 session memory — queryable, in-process. */
export interface SessionMemory {
  conversation_log: ConversationTurn[];
  tool_call_log: LoggedToolCall[];
  artifact_registry: Artifact[];
  decisions_log: Decision[];
}

/**
 * A single line in memory.jsonl — the long-term append-only log.
 * [INV-4]: writes are append-only, reads reconstruct state by replay.
 */
export type MemoryEvent =
  | { kind: "session_start"; session_id: string; ts: number }
  | { kind: "context_set"; context: CreativeContext; ts: number }
  | { kind: "context_patch"; patch: Partial<CreativeContext>; ts: number }
  | { kind: "focus_set"; focus: Focus; ts: number }
  | { kind: "turn"; turn: ConversationTurn }
  | { kind: "tool_call"; call: LoggedToolCall }
  | { kind: "artifact"; artifact: Artifact }
  | { kind: "decision"; decision: Decision }
  | { kind: "pin"; fact: PinnedFact }
  | { kind: "unpin"; id: string; ts: number }
  | { kind: "undo"; turn_id: string; ts: number }
  | { kind: "rewind"; n: number; ts: number; new_branch: string }
  | { kind: "branch"; name: string; from: string; ts: number };

import type { SessionMemoryStore } from "./session.js";
import type { WorkingMemoryStore } from "./working.js";

export interface MemoryToolContext {
  working: WorkingMemoryStore;
  session: SessionMemoryStore;
}
