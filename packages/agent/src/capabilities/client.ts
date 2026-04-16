export interface HostedSdkConfig {
  baseUrl: string; // e.g. https://sdk.daydream.monster
  apiKey: string;  // sk_...
}

export class HostedSdkClient {
  constructor(private cfg: HostedSdkConfig) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${this.cfg.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Hosted SDK ${path} ${r.status}: ${text}`);
    }
    return r.json() as Promise<T>;
  }

  createSession(): Promise<{ session_id: string }> {
    return this.post("/agent/session", {});
  }

  setContext(
    sid: string,
    ctx: Record<string, string>
  ): Promise<{ ok: boolean }> {
    return this.post(`/agent/session/${sid}/context`, ctx);
  }

  inference(
    sid: string,
    capability: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.post("/agent/inference", {
      session_id: sid,
      capability,
      params,
    });
  }

  cacheLookup(key: string): Promise<{ hit: boolean; value?: unknown }> {
    return this.post("/agent/cache/lookup", { key });
  }

  cacheStore(
    key: string,
    value: unknown,
    ttl = 3600
  ): Promise<{ ok: boolean }> {
    return this.post("/agent/cache/store", { key, value, ttl });
  }

  enrich(sid: string, raw: string): Promise<{ prompt: string }> {
    return this.post("/agent/enrich", { session_id: sid, raw_prompt: raw });
  }
}
