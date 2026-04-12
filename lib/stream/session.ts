import { loadConfig } from "@/lib/sdk/client";

export interface Lv2vSession {
  streamId: string;
  publishTimer: ReturnType<typeof setInterval> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  stopped: boolean;
  publishSeq: number;
  pollSeq: number;
  frameCount: number;
  totalRecv: number;
  publishOk: number;
  publishErr: number;
  consecutiveEmpty: number;
  consecutivePublishFail: number;
  lastFpsTime: number;
  /** Most recent params applied via controlStream — for HUD display */
  lastParams?: Record<string, unknown>;
  onFrame?: (url: string) => void;
  onStatus?: (msg: string) => void;
  onError?: (err: string) => void;
}

const sessions = new Map<string, Lv2vSession>();
// Map canvas card refId → SDK stream ID (so agent can use either)
const refIdToStreamId = new Map<string, string>();

function sdkHeaders(): Record<string, string> {
  const config = loadConfig();
  const h: Record<string, string> = {};
  if (config.apiKey) h["Authorization"] = `Bearer ${config.apiKey}`;
  return h;
}

function sdkUrl(): string {
  return loadConfig().serviceUrl;
}

export async function startStream(
  prompt: string,
  scopeParams?: Record<string, unknown>
): Promise<Lv2vSession> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...sdkHeaders() };
  const hasAuth = !!headers["Authorization"];
  const url = sdkUrl();
  console.log(`[LV2V] Starting stream: sdk=${url}, auth=${hasAuth}, prompt="${prompt.slice(0, 30)}"${scopeParams ? ", scopeParams=" + Object.keys(scopeParams).join(",") : ""}`);
  if (!hasAuth) {
    console.warn("[LV2V] WARNING: No Daydream API key — signer will reject, stream will die");
  }
  // Merge prompt into params. If scopeParams provided (from scope_start tool),
  // pass the full Scope config (graph, pipelines, LoRA, VACE, noise, etc.)
  // through to the SDK which proxies to the fal runner.
  const params: Record<string, unknown> = { prompt, ...scopeParams };
  const resp = await fetch(`${sdkUrl()}/stream/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model_id: "scope", params }),
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
    totalRecv: 0,
    publishOk: 0,
    publishErr: 0,
    consecutiveEmpty: 0,
    consecutivePublishFail: 0,
    lastFpsTime: Date.now(),
  };
  sessions.set(streamId, session);
  return session;
}

/**
 * Wait for SDK background init to complete.
 * Phases: connecting → waiting_runner → loading_pipeline → starting_stream → sending_prompt → ready
 * The fal runner needs ~2-5 min on cold start. Frames sent before ready go to the wrong URL.
 */
export async function waitForReady(
  session: Lv2vSession,
  onStatus?: (phase: string) => void
): Promise<void> {
  const PHASE_LABELS: Record<string, string> = {
    connecting: "connecting to fal runner\u2026",
    waiting_runner: "waiting for fal runner to start\u2026",
    loading_pipeline: "loading pipeline (downloading model weights)\u2026",
    starting_stream: "starting media stream\u2026",
    sending_prompt: "sending prompt\u2026",
    ready: "ready!",
  };

  let lastPhase = "";
  for (let i = 0; i < 600; i++) {
    // up to 10 min
    if (session.stopped) throw new Error("Stream stopped");
    try {
      const resp = await fetch(
        `${sdkUrl()}/stream/${session.streamId}/status`,
        { headers: sdkHeaders() }
      );
      const st = await resp.json();
      const phase = st.phase || st.status || "unknown";

      if (phase !== lastPhase) {
        lastPhase = phase;
        onStatus?.(PHASE_LABELS[phase] || phase);
      }

      if (phase === "error" || phase === "failed") {
        throw new Error(`Pipeline error: ${st.error || phase}`);
      }

      if (st.ready || phase === "ready" || phase === "running") return;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Pipeline error:")) throw e;
      // Status not available yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Stream start timeout (10 min)");
}

/**
 * Publish webcam frames at ~10fps.
 * Uses async toBlob for reliable frame capture (matching original storyboard).
 * Only call AFTER waitForReady — frames sent before ready go to wrong URL.
 */
export function startPublishing(
  session: Lv2vSession,
  getFrame: () => Blob | null,
  intervalMs = 100
) {
  // Capture headers ONCE at start time (matches original storyboard pattern)
  const headers: Record<string, string> = { "Content-Type": "image/jpeg", ...sdkHeaders() };
  console.log(`[LV2V] Publishing started: auth=${!!headers["Authorization"]}, interval=${intervalMs}ms`);

  session.publishTimer = setInterval(async () => {
    if (session.stopped) return;
    const blob = getFrame();
    if (!blob || blob.size === 0) return;
    try {
      const r = await fetch(
        `${sdkUrl()}/stream/${session.streamId}/publish?seq=${session.publishSeq++}`,
        { method: "POST", headers, body: blob }
      );
      if (r.ok) {
        session.publishOk++;
        session.consecutivePublishFail = 0;
        if (session.publishOk <= 3) {
          console.log(`[LV2V] Published frame #${session.publishOk}, seq=${session.publishSeq - 1}, blob=${blob.size}B`);
        }
      } else {
        session.publishErr++;
        session.consecutivePublishFail = (session.consecutivePublishFail || 0) + 1;
        if (session.publishErr <= 5) {
          console.log(`[LV2V] Publish error: HTTP ${r.status}, seq=${session.publishSeq - 1}`);
        }
        // Auto-stop if publish fails consistently (stream is dead server-side)
        if (session.consecutivePublishFail > 30) {
          console.warn(`[LV2V] Stream dead — ${session.consecutivePublishFail} consecutive publish failures. Auto-stopping.`);
          session.onError?.("Stream died — publish failures. Stopping.");
          stopStream(session);
          return;
        }
      }
    } catch {
      session.publishErr++;
    }
  }, intervalMs);
}

/**
 * Poll for output frames + dead stream detection.
 * Matches the original storyboard's polling logic.
 */
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
        (resp.headers.get("content-type") || "").includes("image")
      ) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const seq = parseInt(
          resp.headers.get("X-Trickle-Seq") || "0",
          10
        );
        session.pollSeq = seq;
        session.frameCount++;
        session.totalRecv++;
        session.consecutiveEmpty = 0;
        session.onFrame?.(url);

        // Log first few frames to console for debugging
        if (session.totalRecv <= 3) {
          console.log(`[LV2V] Frame #${session.totalRecv} received, seq=${seq}, blob=${blob.size}B`);
        }

        // FPS reporting every 3s
        const now = Date.now();
        if (now - session.lastFpsTime > 3000) {
          const fps = (
            session.frameCount /
            ((now - session.lastFpsTime) / 1000)
          ).toFixed(1);
          session.onStatus?.(
            `${fps}fps | recv:${session.totalRecv} | pub:${session.publishOk}${session.publishErr ? " err:" + session.publishErr : ""}`
          );
          session.frameCount = 0;
          session.lastFpsTime = now;
        }

        if (session.totalRecv === 1) {
          session.onStatus?.("First output frame received!");
        }
      } else {
        session.consecutiveEmpty++;

        // Status update every ~3s while waiting
        if (session.consecutiveEmpty % 15 === 0) {
          session.onStatus?.(
            `waiting for output\u2026 | pub:${session.publishOk}${session.publishErr ? " err:" + session.publishErr : ""}`
          );
        }

        // Dead stream detection: publishing but never receiving after 60s
        if (
          session.consecutiveEmpty > 300 &&
          session.publishOk > 100 &&
          session.totalRecv === 0
        ) {
          session.onError?.(
            `Stream appears dead \u2014 published ${session.publishOk} frames but received none`
          );
          session.consecutiveEmpty = 0; // don't spam
        }
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
  const payload: Record<string, unknown> = { ...params };
  if (prompt) payload.prompts = prompt;
  // Track applied params for HUD display
  session.lastParams = { ...(session.lastParams || {}), ...payload };
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

export function getSession(id: string): Lv2vSession | undefined {
  // Accept either SDK stream ID or canvas card refId
  return sessions.get(id) || sessions.get(refIdToStreamId.get(id) || "");
}

/** Link a canvas card refId to an SDK stream ID so the agent can use either. */
export function linkRefIdToStream(refId: string, streamId: string) {
  refIdToStreamId.set(refId, streamId);
}

/** Get the active stream (if exactly one is running). */
export function getActiveSession(): Lv2vSession | undefined {
  for (const session of sessions.values()) {
    if (!session.stopped) return session;
  }
  return undefined;
}
