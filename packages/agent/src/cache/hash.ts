import { createHash } from "node:crypto";

export interface CacheKey {
  provider: string;
  model: string;
  prompt: string;
  params?: Record<string, unknown>;
  user_id?: string;
}

export function hashCacheKey(key: CacheKey): string {
  const canonical = JSON.stringify({
    provider: key.provider,
    model: key.model,
    prompt: key.prompt,
    params: key.params ?? null,
    user_id: key.user_id ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
