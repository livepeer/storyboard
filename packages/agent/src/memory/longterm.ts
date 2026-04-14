/**
 * Tier 3: long-term memory. Persists across sessions. Per-project on
 * disk under ~/.config/livepeer-agent/projects/<project_id>/.
 *
 * Events get appended to memory.jsonl by every state-changing
 * operation. On startup, the SDK can re-load a project by replaying
 * the log into a SessionMemoryStore + WorkingMemoryStore.
 */

import * as os from "node:os";
import * as path from "node:path";
import { JsonlLog } from "./jsonl.js";
import { SessionMemoryStore } from "./session.js";
import { WorkingMemoryStore } from "./working.js";
import type { MemoryEvent } from "./types.js";

export interface LongtermConfig {
  /** Override the default ~/.config/livepeer-agent root (used in tests). */
  rootDir?: string;
}

export class LongtermMemory {
  readonly rootDir: string;

  constructor(config: LongtermConfig = {}) {
    this.rootDir = config.rootDir ?? path.join(os.homedir(), ".config", "livepeer-agent");
  }

  projectDir(projectId: string): string {
    return path.join(this.rootDir, "projects", projectId);
  }

  log(projectId: string): JsonlLog {
    return new JsonlLog(path.join(this.projectDir(projectId), "memory.jsonl"));
  }

  /**
   * Replay the project's memory.jsonl into fresh working + session
   * stores. Used by `livepeer --resume` and the storyboard app's
   * project re-open flow.
   */
  async resume(projectId: string): Promise<{
    working: WorkingMemoryStore;
    session: SessionMemoryStore;
    eventCount: number;
  }> {
    const events = await this.log(projectId).readAll();
    const working = new WorkingMemoryStore();
    const session = new SessionMemoryStore();
    let currentBranch = "main";

    for (const e of events) {
      switch (e.kind) {
        case "session_start":
          break;
        case "context_set":
          working.setContext(e.context);
          break;
        case "context_patch":
          working.patchContext(e.patch);
          break;
        case "focus_set":
          working.setFocus(e.focus);
          break;
        case "turn":
          working.addTurn(e.turn);
          session.recordTurn(e.turn);
          break;
        case "tool_call":
          session.recordToolCall(e.call.call, e.call.result);
          break;
        case "artifact":
          session.recordArtifact(e.artifact);
          break;
        case "decision":
          session.recordDecision(e.decision);
          break;
        case "pin":
          working.pin(e.fact.text);
          break;
        case "unpin":
          working.unpin(e.id);
          break;
        case "rewind":
          currentBranch = e.new_branch;
          session.setBranch(currentBranch);
          break;
        case "branch":
          currentBranch = e.name;
          session.setBranch(currentBranch);
          break;
        case "undo":
          // Undo is handled at marshal time, not by mutating state
          break;
      }
    }

    return { working, session, eventCount: events.length };
  }

  /** List all projects under the root dir. */
  async listProjects(): Promise<string[]> {
    const { promises: fs } = await import("node:fs");
    const projectsDir = path.join(this.rootDir, "projects");
    try {
      return await fs.readdir(projectsDir);
    } catch {
      return [];
    }
  }
}
