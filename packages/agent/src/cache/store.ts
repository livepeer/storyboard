import { promises as fs } from "node:fs";
import * as path from "node:path";
import { hashCacheKey, type CacheKey } from "./hash.js";

export interface CacheEntry {
  key_hash: string;
  result: { url?: string; data?: unknown };
  ts: number;
  /** TTL in ms — entries past this are ignored on read. */
  ttl_ms: number;
}

export class CacheStore {
  constructor(private dir: string) {}

  private fileFor(hash: string): string {
    return path.join(this.dir, `${hash}.json`);
  }

  async lookup(key: CacheKey): Promise<CacheEntry | null> {
    const hash = hashCacheKey(key);
    try {
      const text = await fs.readFile(this.fileFor(hash), "utf8");
      const entry = JSON.parse(text) as CacheEntry;
      if (Date.now() - entry.ts > entry.ttl_ms) return null;
      return entry;
    } catch {
      return null;
    }
  }

  async store(key: CacheKey, result: CacheEntry["result"], ttlMs = 24 * 60 * 60 * 1000): Promise<void> {
    const hash = hashCacheKey(key);
    await fs.mkdir(this.dir, { recursive: true });
    const entry: CacheEntry = { key_hash: hash, result, ts: Date.now(), ttl_ms: ttlMs };
    await fs.writeFile(this.fileFor(hash), JSON.stringify(entry), "utf8");
  }
}
