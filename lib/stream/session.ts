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
  /** In-flight guards — when true, the next tick skips instead of stacking
   *  another fetch on top. Without this the publish loop would fire a new
   *  fetch every 100ms regardless of whether the previous one returned,
   *  eventually exhausting the browser's HTTP connection pool with
   *  ERR_INSUFFICIENT_RESOURCES after a few thousand frames. */
  publishInFlight: boolean;
  pollInFlight: boolean;
  /** Publish tick drops — stream frames older than the current interval
   *  that got skipped because the previous publish was still pending. */
  publishDropped: number;
  /** Last blob: URL handed to onFrame, so we can URL.revokeObjectURL it
   *  when we produce the next one. Without this, every frame we receive
   *  leaks a blob URL in the browser — over 5000 frames that's real
   *  memory pressure and contributes to the resource exhaustion. */
  lastFrameUrl: string | null;
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
    publishInFlight: false,
    pollInFlight: false,
    publishDropped: 0,
    lastFrameUrl: null,
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

    // Back-pressure: if the previous publish hasn't returned yet, drop
    // this frame entirely instead of stacking another fetch on top. This
    // is the fix for ERR_INSUFFICIENT_RESOURCES — without it, a slow SDK
    // (even 150ms / tick) leaks one socket per tick until Chrome's
    // per-host connection pool is exhausted and ALL further fetches to
    // sdk.daydream.monster fail. Dropping the frame is correct for
    // live video: the next capture (100ms later) is newer anyway.
    if (session.publishInFlight) {
      session.publishDropped++;
      return;
    }

    const blob = getFrame();
    if (!blob || blob.size === 0) return;

    session.publishInFlight = true;
    const seq = session.publishSeq++;
    try {
      const r = await fetch(
        `${sdkUrl()}/stream/${session.streamId}/publish?seq=${seq}`,
        { method: "POST", headers, body: blob },
      );
      // ALWAYS drain the response body, even on error, so the browser
      // can release the socket back to the connection pool. Without
      // this, keepalive connections stay pinned waiting for the app to
      // read the body, which (combined with the back-pressure bug
      // above) is how we got to 5000+ pending requests before freeze.
      try {
        await r.text();
      } catch {
        /* body read failed — nothing to do, fetch is done */
      }
      if (r.ok) {
        session.publishOk++;
        session.consecutivePublishFail = 0;
        if (session.publishOk <= 3) {
          console.log(
            `[LV2V] Published frame #${session.publishOk}, seq=${seq}, blob=${blob.size}B`,
          );
        }
      } else {
        session.publishErr++;
        session.consecutivePublishFail = (session.consecutivePublishFail || 0) + 1;
        if (session.publishErr <= 5) {
          console.log(`[LV2V] Publish error: HTTP ${r.status}, seq=${seq}`);
        }
        // 410 Gone = SDK has no record of this stream → it's dead forever, stop immediately
        if (r.status === 410) {
          console.warn(
            `[LV2V] Stream ${session.streamId} is gone (SDK returned 410). Auto-stopping.`,
          );
          session.onError?.("Stream session lost — likely SDK restart. Stopping.");
          stopStream(session);
          return;
        }
        // Auto-stop after 30 consecutive failures
        if (session.consecutivePublishFail > 30) {
          console.warn(
            `[LV2V] Stream dead — ${session.consecutivePublishFail} consecutive publish failures. Auto-stopping.`,
          );
          session.onError?.("Stream died — publish failures. Stopping.");
          stopStream(session);
          return;
        }
      }
    } catch (e) {
      session.publishErr++;
      // Browser-level failures (ERR_INSUFFICIENT_RESOURCES, connection
      // reset, offline) all land here. Count them against the same
      // consecutive-failure budget as HTTP errors so a cascading pool
      // exhaustion triggers the 30-strike auto-stop and frees the
      // timer instead of spamming forever.
      session.consecutivePublishFail = (session.consecutivePublishFail || 0) + 1;
      if (session.publishErr <= 5) {
        console.log(`[LV2V] Publish fetch threw: ${e}`);
      }
      if (session.consecutivePublishFail > 30) {
        console.warn(
          `[LV2V] Stream dead — ${session.consecutivePublishFail} consecutive fetch failures. Auto-stopping.`,
        );
        session.onError?.("Stream died — browser connection errors. Stopping.");
        stopStream(session);
        return;
      }
    } finally {
      session.publishInFlight = false;
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

    // Same back-pressure as the publish loop: if the previous /frame
    // poll hasn't returned yet, skip this tick instead of stacking
    // another fetch. Without this the poll loop would also contribute
    // to browser connection-pool exhaustion.
    if (session.pollInFlight) return;
    session.pollInFlight = true;

    try {
      const resp = await fetch(
        `${sdkUrl()}/stream/${session.streamId}/frame?seq=${session.pollSeq}`,
        { headers: sdkHeaders() },
      );
      if (
        resp.status === 200 &&
        (resp.headers.get("content-type") || "").includes("image")
      ) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const seq = parseInt(resp.headers.get("X-Trickle-Seq") || "0", 10);
        session.pollSeq = seq;
        session.frameCount++;
        session.totalRecv++;
        session.consecutiveEmpty = 0;

        // Revoke the PREVIOUS blob URL before handing over the new one.
        // Without this every polled frame leaks a blob URL (and its
        // underlying blob data) for the lifetime of the tab — over a
        // 10-minute stream at 5Hz that's 3000 leaked blobs, which is
        // real memory and contributes to the browser's resource
        // exhaustion when combined with the connection-pool leak.
        const prevUrl = session.lastFrameUrl;
        session.lastFrameUrl = url;
        if (prevUrl) {
          try {
            URL.revokeObjectURL(prevUrl);
          } catch {
            /* ignore */
          }
        }
        session.onFrame?.(url);

        // Log first few frames to console for debugging
        if (session.totalRecv <= 3) {
          console.log(
            `[LV2V] Frame #${session.totalRecv} received, seq=${seq}, blob=${blob.size}B`,
          );
        }

        // FPS reporting every 3s
        const now = Date.now();
        if (now - session.lastFpsTime > 3000) {
          const fps = (
            session.frameCount /
            ((now - session.lastFpsTime) / 1000)
          ).toFixed(1);
          const droppedSuffix = session.publishDropped > 0 ? ` drop:${session.publishDropped}` : "";
          session.onStatus?.(
            `${fps}fps | recv:${session.totalRecv} | pub:${session.publishOk}${session.publishErr ? " err:" + session.publishErr : ""}${droppedSuffix}`,
          );
          session.frameCount = 0;
          session.lastFpsTime = now;
        }

        if (session.totalRecv === 1) {
          session.onStatus?.("First output frame received!");
        }
      } else {
        // Always drain the body even on no-image responses so Chrome
        // can release the connection back to the pool.
        try {
          await resp.text();
        } catch {
          /* ignore */
        }
        session.consecutiveEmpty++;

        // Status update every ~3s while waiting
        if (session.consecutiveEmpty % 15 === 0) {
          session.onStatus?.(
            `waiting for output… | pub:${session.publishOk}${session.publishErr ? " err:" + session.publishErr : ""}`,
          );
        }

        // Dead stream detection: publishing but never receiving after 60s
        if (
          session.consecutiveEmpty > 300 &&
          session.publishOk > 100 &&
          session.totalRecv === 0
        ) {
          session.onError?.(
            `Stream appears dead — published ${session.publishOk} frames but received none`,
          );
          session.consecutiveEmpty = 0; // don't spam
        }
      }
    } catch {
      // Browser-level errors (ERR_INSUFFICIENT_RESOURCES, offline, etc.)
      // — non-fatal here, the publish loop is the one that auto-stops
      // on consecutive errors. Just count it and keep trying.
      session.consecutiveEmpty++;
    } finally {
      session.pollInFlight = false;
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
  // Revoke the last outstanding blob URL so the browser can free its
  // backing blob data. The <img> inside the Card component will drop
  // its reference on the next re-render; by that point the revoked
  // URL already freed the blob.
  if (session.lastFrameUrl) {
    try {
      URL.revokeObjectURL(session.lastFrameUrl);
    } catch {
      /* ignore */
    }
    session.lastFrameUrl = null;
  }
  sessions.delete(session.streamId);
  try {
    const r = await fetch(`${sdkUrl()}/stream/${session.streamId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sdkHeaders() },
      body: "{}",
    });
    // Drain the body so the connection returns to the pool cleanly.
    try {
      await r.text();
    } catch {
      /* ignore */
    }
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
