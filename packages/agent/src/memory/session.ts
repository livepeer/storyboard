/**
 * Tier 2: session memory. Queryable, in-process, holds the artifact
 * registry, tool call log, decisions log, and full conversation log.
 *
 * Not in the prompt by default. The LLM calls memory tools (recall,
 * show, thread, summarize) to access this layer.
 */

import type {
  Artifact,
  Decision,
  LoggedToolCall,
  SessionMemory,
} from "./types.js";
import type { ConversationTurn, ToolCall, ToolResult } from "../types.js";

export class SessionMemoryStore {
  private mem: SessionMemory = {
    conversation_log: [],
    tool_call_log: [],
    artifact_registry: [],
    decisions_log: [],
  };

  private currentBranch = "main";

  setBranch(b: string): void {
    this.currentBranch = b;
  }

  branch(): string {
    return this.currentBranch;
  }

  recordTurn(turn: ConversationTurn): void {
    this.mem.conversation_log.push(turn);
  }

  recordToolCall(call: ToolCall, result?: ToolResult): LoggedToolCall {
    const logged: LoggedToolCall = {
      id: `lt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      call,
      result,
      ts: Date.now(),
      branch: this.currentBranch,
    };
    this.mem.tool_call_log.push(logged);
    return logged;
  }

  recordArtifact(a: Omit<Artifact, "id" | "ts" | "branch">): Artifact {
    const artifact: Artifact = {
      ...a,
      id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      branch: this.currentBranch,
    };
    this.mem.artifact_registry.push(artifact);
    return artifact;
  }

  recordDecision(d: Omit<Decision, "id" | "ts" | "branch">): Decision {
    const decision: Decision = {
      ...d,
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      branch: this.currentBranch,
    };
    this.mem.decisions_log.push(decision);
    return decision;
  }

  /** Keyword search across artifact prompts and conversation content. */
  recall(query: string, limit = 10): Array<Artifact | ConversationTurn> {
    const q = query.toLowerCase();
    const fromArtifacts = this.mem.artifact_registry
      .filter((a) => a.branch === this.currentBranch && a.prompt.toLowerCase().includes(q))
      .slice(-limit);
    const fromTurns = this.mem.conversation_log
      .filter((t) => t.message.content.toLowerCase().includes(q))
      .slice(-limit);
    return [...fromArtifacts, ...fromTurns].slice(-limit);
  }

  /** Fetch a specific item by id (artifact or turn). */
  show(id: string): Artifact | ConversationTurn | undefined {
    return (
      this.mem.artifact_registry.find((a) => a.id === id) ||
      this.mem.conversation_log.find((t) => t.id === id)
    );
  }

  /** Fetch all artifacts and decisions related to a scope (e.g. a project_id or scene index). */
  thread(scope: string): { artifacts: Artifact[]; decisions: Decision[] } {
    const scopeStr = scope.toLowerCase();
    const artifacts = this.mem.artifact_registry.filter(
      (a) =>
        a.branch === this.currentBranch &&
        (a.id.includes(scopeStr) ||
          a.prompt.toLowerCase().includes(scopeStr) ||
          (a.params && JSON.stringify(a.params).toLowerCase().includes(scopeStr))),
    );
    const matchedArtifactIds = new Set(artifacts.map((a) => a.id));
    const decisions = this.mem.decisions_log.filter(
      (d) =>
        d.branch === this.currentBranch &&
        (d.target_artifact_id?.includes(scopeStr) ||
          d.note?.toLowerCase().includes(scopeStr) ||
          (d.target_artifact_id != null && matchedArtifactIds.has(d.target_artifact_id))),
    );
    return { artifacts, decisions };
  }

  summarize(): string {
    const totalArt = this.mem.artifact_registry.length;
    const totalTurns = this.mem.conversation_log.length;
    const totalCalls = this.mem.tool_call_log.length;
    return `${totalTurns} turns, ${totalCalls} tool calls, ${totalArt} artifacts on branch '${this.currentBranch}'.`;
  }

  snapshot(): SessionMemory {
    return structuredClone(this.mem);
  }
}
