import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { hashCacheKey } from "../../src/cache/hash.js";
import { CacheStore } from "../../src/cache/store.js";

let tmp: string;
let cache: CacheStore;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "livepeer-cache-"));
  cache = new CacheStore(tmp);
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("hashCacheKey", () => {
  it("produces stable hashes for identical inputs", () => {
    const a = hashCacheKey({ provider: "fal", model: "flux-dev", prompt: "a cat" });
    const b = hashCacheKey({ provider: "fal", model: "flux-dev", prompt: "a cat" });
    expect(a).toBe(b);
  });

  it("produces different hashes when params differ", () => {
    const a = hashCacheKey({ provider: "fal", model: "flux-dev", prompt: "a cat", params: { steps: 20 } });
    const b = hashCacheKey({ provider: "fal", model: "flux-dev", prompt: "a cat", params: { steps: 50 } });
    expect(a).not.toBe(b);
  });
});

describe("CacheStore", () => {
  it("lookup returns null on miss", async () => {
    const result = await cache.lookup({ provider: "fal", model: "flux-dev", prompt: "miss" });
    expect(result).toBeNull();
  });

  it("store + lookup round-trips a result", async () => {
    const key = { provider: "fal", model: "flux-dev", prompt: "hit" };
    await cache.store(key, { url: "https://example.com/cat.png" });
    const result = await cache.lookup(key);
    expect(result?.result.url).toBe("https://example.com/cat.png");
  });

  it("expires entries past TTL", async () => {
    const key = { provider: "fal", model: "flux-dev", prompt: "expire" };
    await cache.store(key, { url: "x" }, 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    expect(await cache.lookup(key)).toBeNull();
  });
});
