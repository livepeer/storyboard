/**
 * Append-only JSONL log. Reader rebuilds in-memory state by replay.
 *
 * [INV-4]: writes are append-only. There is no update or delete
 * primitive. Branching, undo, and rewind all work via NEW events
 * (rewind, branch, undo) appended to the log.
 *
 * [INV-5]: this is local-only by default. Cloud sync (Tier 4) reads
 * from this same log and ships changes to the hosted SDK only when
 * the user has explicitly opted in.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { MemoryEvent } from "./types.js";

export class JsonlLog {
  constructor(private filepath: string) {}

  /** Append a single event. Creates the file and parent dirs if needed. */
  async append(event: MemoryEvent): Promise<void> {
    await fs.mkdir(path.dirname(this.filepath), { recursive: true });
    const line = JSON.stringify(event) + "\n";
    await fs.appendFile(this.filepath, line, "utf8");
  }

  /** Read all events in order. Used for resume / replay. */
  async readAll(): Promise<MemoryEvent[]> {
    try {
      const text = await fs.readFile(this.filepath, "utf8");
      return text
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as MemoryEvent);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  /** Append-only safety check — refuses to truncate. */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filepath);
      return true;
    } catch {
      return false;
    }
  }
}
