import type {
  SdkConfig,
  HealthResponse,
  Capability,
  InferenceRequest,
  InferenceResponse,
} from "./types";

const STORAGE_KEYS = {
  serviceUrl: "sdk_service_url",
  apiKey: "sdk_api_key",
  orchUrl: "orch_url",
} as const;

const DEFAULT_URL = "https://sdk.daydream.monster";

export function loadConfig(): SdkConfig {
  if (typeof window === "undefined") {
    return { serviceUrl: DEFAULT_URL, apiKey: "", orchUrl: "" };
  }
  return {
    serviceUrl: localStorage.getItem(STORAGE_KEYS.serviceUrl) || DEFAULT_URL,
    apiKey: localStorage.getItem(STORAGE_KEYS.apiKey) || "",
    orchUrl: localStorage.getItem(STORAGE_KEYS.orchUrl) || "",
  };
}

export function saveConfig(config: SdkConfig) {
  localStorage.setItem(STORAGE_KEYS.serviceUrl, config.serviceUrl);
  localStorage.setItem(STORAGE_KEYS.apiKey, config.apiKey);
  localStorage.setItem(STORAGE_KEYS.orchUrl, config.orchUrl);
}

export async function sdkFetch<T = unknown>(
  path: string,
  body?: unknown,
  timeout = 300_000
): Promise<T> {
  const config = loadConfig();

  // Retry once on network errors (connection refused, DNS flap, timeout).
  // HTTP errors (4xx, 5xx) are NOT retried — they're deterministic.
  const MAX_RETRIES = 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {};
      if (body) headers["Content-Type"] = "application/json";
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

      const resp = await fetch(config.serviceUrl + path, {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const err = await resp.text();
        // Auto-retry 503 (no GPU available) once after 3s
        if (resp.status === 503 && attempt < MAX_RETRIES) {
          console.warn(`[SDK] ${path} 503 (no GPU), retrying in 3s (attempt ${attempt + 1})`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new Error(`HTTP ${resp.status}: ${err.slice(0, 200)}`);
      }

      return (await resp.json()) as T;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;

      // Only retry on network errors, not HTTP errors
      const msg = e instanceof Error ? e.message : "";
      const isNetworkError = msg.includes("Failed to fetch")
        || msg.includes("NetworkError")
        || msg.includes("ERR_CONNECTION")
        || msg.includes("abort")
        || msg.includes("CORS");

      if (isNetworkError && attempt < MAX_RETRIES) {
        console.warn(`[SDK] ${path} network error, retrying in 2s (attempt ${attempt + 1}):`, msg.slice(0, 80));
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

export function checkHealth(): Promise<HealthResponse> {
  return sdkFetch<HealthResponse>("/health");
}

export function listCapabilities(): Promise<Capability[]> {
  return sdkFetch<Capability[]>("/capabilities");
}

export function runInference(
  req: InferenceRequest
): Promise<InferenceResponse> {
  return sdkFetch<InferenceResponse>("/inference", req);
}
