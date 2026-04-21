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
  /** Frame poll interval in ms. Default: 100 (10fps) */
  pollInterval?: number;
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
      opts.onStateChange?.(next);
      return next;
    });
  }, [opts.onStateChange]);

  // Start stream
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

      updateState({ status: "warming", streamId, phase: "waiting for fal runner…" });

      // Wait for ready (poll /stream/{id}/status)
      await waitForReady(streamId);

      updateState({ status: "streaming", phase: null });

      // Start frame polling
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

  // Wait for SDK stream to be ready (fal runner cold start)
  const waitForReady = useCallback(async (streamId: string) => {
    const MAX_WAIT = 300_000; // 5 min
    const start = Date.now();

    while (Date.now() - start < MAX_WAIT && runningRef.current) {
      try {
        const resp = await fetch(`${opts.sdkUrl}/stream/${streamId}/status`, {
          headers: headers(),
        });
        if (resp.ok) {
          const data = await resp.json();
          const phase = data.phase || data.status;
          updateState({ phase });
          if (phase === "ready" || phase === "streaming") return;
        }
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    // Proceed even if not "ready" — frames may start appearing
  }, [opts.sdkUrl, headers, updateState]);

  // Poll frames
  const pollFrames = useCallback(async (streamId: string) => {
    const interval = opts.pollInterval ?? 100;

    while (runningRef.current && streamIdRef.current === streamId) {
      try {
        const resp = await fetch(`${opts.sdkUrl}/stream/${streamId}/frame`, {
          headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
        });

        if (resp.ok) {
          const contentType = resp.headers.get("content-type") || "";
          if (contentType.includes("image")) {
            const blob = await resp.blob();
            if (blob.size > 0) {
              const bitmap = await createImageBitmap(blob);
              opts.onFrame?.(bitmap);
              frameCountRef.current++;

              // Update FPS
              const elapsed = (performance.now() - fpsStartRef.current) / 1000;
              if (elapsed > 1) {
                updateState({
                  fps: Math.round(frameCountRef.current / elapsed),
                  framesReceived: frameCountRef.current,
                });
              }
            }
          }
        } else if (resp.status === 410) {
          // Stream gone (SDK restarted)
          updateState({ status: "error", error: "Stream ended (410)", phase: null });
          runningRef.current = false;
          return;
        }
      } catch { /* network hiccup — hold last frame */ }

      await new Promise((r) => setTimeout(r, interval));
    }
  }, [opts.sdkUrl, opts.apiKey, opts.pollInterval, opts.onFrame, updateState]);

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

  return { state, start, stop, control, streamId: streamIdRef.current };
}
