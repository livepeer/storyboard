"use client";

/**
 * useSdkStream — manages a Scope stream via the Livepeer SDK trickle protocol.
 *
 * Flow: SDK /stream/start → poll /stream/{id}/frame → render to canvas
 *       SDK /stream/{id}/control → update params mid-stream
 *       SDK /stream/{id}/stop → cleanup
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { ScopeStreamState, ScopeParams } from "./types";

export interface UseSdkStreamOptions {
  sdkUrl: string;
  apiKey?: string;
  /** Called when a new frame is decoded */
  onFrame?: (bitmap: ImageBitmap) => void;
  /** Called when stream state changes */
  onStateChange?: (state: ScopeStreamState) => void;
}

export function useSdkStream(opts: UseSdkStreamOptions) {
  const [state, setState] = useState<ScopeStreamState>({
    status: "idle",
    streamId: null,
    fps: 0,
    framesReceived: 0,
    error: null,
    phase: null,
  });

  const streamIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const frameCountRef = useRef(0);
  const fpsStartRef = useRef(0);

  const headers = useCallback(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.apiKey) h["Authorization"] = `Bearer ${opts.apiKey}`;
    return h;
  }, [opts.apiKey]);

  const updateState = useCallback((patch: Partial<ScopeStreamState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      if (opts.onStateChange) {
        const cb = opts.onStateChange;
        queueMicrotask(() => cb(next));
      }
      return next;
    });
  }, [opts.onStateChange]);

  // Start a new stream
  const start = useCallback(async (params: ScopeParams) => {
    if (runningRef.current) return;

    updateState({ status: "connecting", error: null, phase: "starting stream…" });

    try {
      const resp = await fetch(`${opts.sdkUrl}/stream/start`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ model_id: "scope", params }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Stream start failed: ${resp.status} ${text.slice(0, 150)}`);
      }
      const data = await resp.json();
      const streamId = data.stream_id as string;
      streamIdRef.current = streamId;
      runningRef.current = true;

      updateState({ status: "warming", streamId, phase: "warming up GPU…" });

      // Start polling frames immediately — first frame arrival transitions to "streaming"
      frameCountRef.current = 0;
      fpsStartRef.current = performance.now();
      pollFrames(streamId);
    } catch (e) {
      updateState({
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
        phase: null,
      });
    }
  }, [opts.sdkUrl, headers, updateState]);

  // Attach to an already-started stream (skip start, go straight to polling)
  const attach = useCallback(async (streamId: string) => {
    if (runningRef.current) return;
    streamIdRef.current = streamId;
    runningRef.current = true;

    updateState({ status: "warming", streamId, phase: "connecting to stream…" });

    frameCountRef.current = 0;
    fpsStartRef.current = performance.now();
    pollFrames(streamId);
  }, [updateState]);

  // Poll frames — dual-fetcher for higher throughput
  const pollFrames = useCallback(async (streamId: string) => {
    const CONCURRENCY = 2;
    let stopped = false;
    let fpsWindowStart = performance.now();
    let fpsWindowFrames = 0;
    let firstFrameReceived = false;
    let noFrameCount = 0;
    const MAX_NO_FRAME = 300; // ~5 min of no frames at 1 poll/s before giving up

    async function fetcher() {
      while (!stopped && runningRef.current && streamIdRef.current === streamId) {
        try {
          const resp = await fetch(`${opts.sdkUrl}/stream/${streamId}/frame`, {
            headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
          });

          if (resp.ok) {
            const contentType = resp.headers.get("content-type") || "";
            if (contentType.includes("image")) {
              const blob = await resp.blob();
              if (blob.size > 100) {
                const bitmap = await createImageBitmap(blob);
                opts.onFrame?.(bitmap);
                frameCountRef.current++;
                fpsWindowFrames++;
                noFrameCount = 0;

                // Transition from "warming" to "streaming" on first real frame
                if (!firstFrameReceived) {
                  firstFrameReceived = true;
                  updateState({ status: "streaming", phase: null });
                }

                // Rolling FPS over 2-second window
                const now = performance.now();
                const elapsed = (now - fpsWindowStart) / 1000;
                if (elapsed >= 2) {
                  updateState({
                    fps: Math.round(fpsWindowFrames / elapsed),
                    framesReceived: frameCountRef.current,
                  });
                  fpsWindowStart = now;
                  fpsWindowFrames = 0;
                }

                // Minimal yield between successful frames
                await new Promise((r) => setTimeout(r, 16));
                continue;
              }
            }
          } else if (resp.status === 410) {
            updateState({ status: "error", error: "Stream ended (SDK restarted)", phase: null });
            runningRef.current = false;
            stopped = true;
            return;
          }

          // No frame yet — back off
          noFrameCount++;
          if (noFrameCount > MAX_NO_FRAME) {
            updateState({ status: "error", error: "Stream timed out — no frames received", phase: null });
            runningRef.current = false;
            stopped = true;
            return;
          }

          // Longer pause when no frames (warm-up phase)
          const backoff = firstFrameReceived ? 50 : 1000;
          if (!firstFrameReceived && noFrameCount % 5 === 0) {
            updateState({ phase: `warming up GPU… (${noFrameCount}s)` });
          }
          await new Promise((r) => setTimeout(r, backoff));
        } catch {
          // Network error — hold last frame, brief pause
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    const fetchers = Array.from({ length: CONCURRENCY }, () => fetcher());
    await Promise.all(fetchers);
  }, [opts.sdkUrl, opts.apiKey, opts.onFrame, updateState]);

  // Control (update params mid-stream)
  const control = useCallback(async (params: Partial<ScopeParams>) => {
    if (!streamIdRef.current) return;
    try {
      await fetch(`${opts.sdkUrl}/stream/${streamIdRef.current}/control`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "parameters", params }),
      });
    } catch (e) {
      console.warn("[ScopeStream] Control failed:", e);
    }
  }, [opts.sdkUrl, headers]);

  // Stop
  const stop = useCallback(async () => {
    runningRef.current = false;
    if (!streamIdRef.current) return;
    try {
      await fetch(`${opts.sdkUrl}/stream/${streamIdRef.current}/stop`, {
        method: "POST",
        headers: headers(),
      });
    } catch { /* best effort */ }
    streamIdRef.current = null;
    updateState({ status: "idle", streamId: null, fps: 0, phase: null });
  }, [opts.sdkUrl, headers, updateState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (streamIdRef.current) {
        fetch(`${opts.sdkUrl}/stream/${streamIdRef.current}/stop`, {
          method: "POST",
          headers: headers(),
        }).catch(() => {});
      }
    };
  }, [opts.sdkUrl, headers]);

  return { state, start, attach, stop, control, streamId: streamIdRef.current };
}
