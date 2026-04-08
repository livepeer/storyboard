import { loadConfig } from "@/lib/sdk/client";

export interface Lv2vSession {
  streamId: string;
  publishTimer: ReturnType<typeof setInterval> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  stopped: boolean;
  publishSeq: number;
  pollSeq: number;
  frameCount: number;
  onFrame?: (url: string) => void;
  onStatus?: (msg: string) => void;
  onError?: (err: string) => void;
}

const sessions = new Map<string, Lv2vSession>();

function sdkHeaders(): Record<string, string> {
  const config = loadConfig();
  const h: Record<string, string> = {};
  if (config.apiKey) h["Authorization"] = `Bearer ${config.apiKey}`;
  return h;
}

function sdkUrl(): string {
  return loadConfig().serviceUrl;
}

export async function startStream(prompt: string): Promise<Lv2vSession> {
  const resp = await fetch(`${sdkUrl()}/stream/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sdkHeaders() },
    body: JSON.stringify({ model_id: "scope", params: { prompt } }),
  });
  if (!resp.ok) throw new Error(`Stream start failed: ${resp.status}`);
  const data = await resp.json();
  const streamId = data.stream_id;

  const session: Lv2vSession = {
    streamId,
    publishTimer: null,
    pollTimer: null,
    stopped: false,
    publishSeq: 0,
    pollSeq: -1,
    frameCount: 0,
  };
  sessions.set(streamId, session);
  return session;
}

export async function waitForReady(
  session: Lv2vSession,
  onStatus?: (phase: string) => void
): Promise<void> {
  for (let i = 0; i < 600; i++) {
    if (session.stopped) throw new Error("Stream stopped");
    const resp = await fetch(`${sdkUrl()}/stream/${session.streamId}/status`, {
      headers: sdkHeaders(),
    });
    const st = await resp.json();
    const phase = st.status || st.phase || "unknown";
    onStatus?.(phase);
    if (phase === "ready" || phase === "running") return;
    if (phase === "failed" || phase === "error") {
      throw new Error(`Stream failed: ${st.error || phase}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Stream start timeout");
}

export function startPublishing(
  session: Lv2vSession,
  getFrame: () => Blob | null,
  intervalMs = 100
) {
  session.publishTimer = setInterval(async () => {
    if (session.stopped) return;
    const blob = getFrame();
    if (!blob) return;
    try {
      await fetch(
        `${sdkUrl()}/stream/${session.streamId}/publish?seq=${session.publishSeq++}`,
        {
          method: "POST",
          headers: { "Content-Type": "image/jpeg", ...sdkHeaders() },
          body: blob,
        }
      );
    } catch {
      // Publish errors are non-fatal
    }
  }, intervalMs);
}

export function startPolling(session: Lv2vSession, intervalMs = 200) {
  session.pollTimer = setInterval(async () => {
    if (session.stopped) return;
    try {
      const resp = await fetch(
        `${sdkUrl()}/stream/${session.streamId}/frame?seq=${session.pollSeq}`,
        { headers: sdkHeaders() }
      );
      if (
        resp.status === 200 &&
        resp.headers.get("content-type")?.includes("image")
      ) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const seq = parseInt(
          resp.headers.get("X-Trickle-Seq") || "0",
          10
        );
        session.pollSeq = seq;
        session.frameCount++;
        session.onFrame?.(url);
      }
    } catch {
      // Poll errors are non-fatal
    }
  }, intervalMs);
}

export async function controlStream(
  session: Lv2vSession,
  prompt: string,
  params?: Record<string, unknown>
): Promise<void> {
  const payload: Record<string, unknown> = { prompts: prompt, ...params };
  await fetch(`${sdkUrl()}/stream/${session.streamId}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sdkHeaders() },
    body: JSON.stringify({ type: "parameters", params: payload }),
  });
}

export async function stopStream(session: Lv2vSession): Promise<void> {
  session.stopped = true;
  if (session.publishTimer) clearInterval(session.publishTimer);
  if (session.pollTimer) clearInterval(session.pollTimer);
  sessions.delete(session.streamId);
  try {
    await fetch(`${sdkUrl()}/stream/${session.streamId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sdkHeaders() },
      body: "{}",
    });
  } catch {
    // Best-effort stop
  }
}

export function getSession(streamId: string): Lv2vSession | undefined {
  return sessions.get(streamId);
}
