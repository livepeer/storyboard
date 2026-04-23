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

/** A source that produces JPEG blobs for publishing to the stream. */
export interface StreamSource {
  type: "blank" | "image" | "video";
  /** For image/video: the URL to extract frames from */
  url?: string;
  /** Label shown in UI */
  label?: string;
}

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
  const sourceRef = useRef<StreamSource>({ type: "blank" });
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceBitmapRef = useRef<ImageBitmap | null>(null); // cached image bitmap for fast draw

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

  /** Set the publish source. Switches what gets sent to the pipeline mid-stream. */
  const setSource = useCallback((source: StreamSource) => {
    const prev = sourceRef.current;
    sourceRef.current = source;
    sourceBitmapRef.current = null; // clear cached bitmap

    // Cleanup previous video source
    if (prev.type === "video" && sourceVideoRef.current) {
      sourceVideoRef.current.pause();
      sourceVideoRef.current.src = "";
      sourceVideoRef.current = null;
    }

    if (source.type === "blank") return;

    if (source.type === "video" && source.url && typeof document !== "undefined") {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = source.url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => {});
      sourceVideoRef.current = video;
    } else if (source.type === "image" && source.url) {
      // Load image as bitmap. Try fetch first (works for blob: and same-origin),
      // fall back to Image element for cross-origin CDN URLs.
      const loadViaFetch = () =>
        fetch(source.url!)
          .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.blob(); })
          .then((blob) => createImageBitmap(blob));

      const loadViaImg = () =>
        new Promise<ImageBitmap>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => createImageBitmap(img).then(resolve).catch(reject);
          img.onerror = () => reject(new Error("Image load failed"));
          img.src = source.url!;
        });

      loadViaFetch()
        .catch(() => loadViaImg()) // fallback for CORS-restricted CDN URLs
        .then((bm) => {
          if (sourceRef.current === source) {
            sourceBitmapRef.current = bm;
            console.log(`[useSdkStream] Image source ready: ${bm.width}x${bm.height}`);
          }
        })
        .catch((e) => {
          console.warn("[useSdkStream] Image source load failed (both methods):", e);
        });
    }
  }, []);

  /** Capture a JPEG blob from the current source. */
  const captureSourceFrame = useCallback(async (blankBlob: Blob): Promise<Blob> => {
    const src = sourceRef.current;
    if (src.type === "blank") return blankBlob;

    // Ensure we have a canvas for encoding
    if (!sourceCanvasRef.current) {
      sourceCanvasRef.current = document.createElement("canvas");
    }
    const canvas = sourceCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blankBlob;

    if (src.type === "image") {
      const bm = sourceBitmapRef.current;
      if (!bm) return blankBlob; // image still loading
      if (canvas.width !== bm.width || canvas.height !== bm.height) {
        canvas.width = bm.width;
        canvas.height = bm.height;
      }
      ctx.drawImage(bm, 0, 0);
      return new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b || blankBlob), "image/jpeg", 0.7)
      );
    }

    if (src.type === "video") {
      const video = sourceVideoRef.current;
      if (!video || video.readyState < 2) return blankBlob;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 512;
        canvas.height = video.videoHeight || 512;
      }
      ctx.drawImage(video, 0, 0);
      return new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b || blankBlob), "image/jpeg", 0.7)
      );
    }

    return blankBlob;
  }, []);

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

      // Publish blank frames so the pipeline has input to process
      publishBlankFrames(streamId);

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

    // Start publishing blank frames — the SDK requires input frames even for
    // "text-only" mode because the pipeline processes input→output. Without
    // published frames, the pipeline has nothing to process and the stream
    // times out. Scope applies noise_scale to transform the blank input.
    publishBlankFrames(streamId);

    frameCountRef.current = 0;
    fpsStartRef.current = performance.now();
    pollFrames(streamId);
  }, [updateState]);

  // Publish blank (black) frames to keep the pipeline fed.
  // The SDK creates per-stream trickle channels during _init_stream_session
  // (30-90s cold start). Until then, /publish returns 404. We poll slowly
  // (every 2s) until the first successful publish, then ramp up to 10fps.
  const publishBlankFrames = useCallback(async (streamId: string) => {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    if (!canvas) return;
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 512, 512);

    let seq = 0;
    let consecutive404 = 0;
    let publishReady = false;
    const publishHeaders: Record<string, string> = {};
    if (opts.apiKey) publishHeaders["Authorization"] = `Bearer ${opts.apiKey}`;

    // Pre-create the JPEG blob once (reuse for all frames)
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.5)
    );

    async function publishLoop() {
      // Wait for first output frame before publishing — the SDK's trickle
      // publish channel returns 404 until _init_stream_session completes
      // (30-90s). Polling during warm-up just spams the console.
      while (runningRef.current && streamIdRef.current === streamId && !publishReady) {
        await new Promise((r) => setTimeout(r, 2000));
        // Check if we've received any frames yet (set by pollFrames)
        if (frameCountRef.current > 0) {
          publishReady = true;
        }
      }

      // Now publish frames — use source content if available, blank otherwise
      while (runningRef.current && streamIdRef.current === streamId) {
        try {
          const frameBlob = await captureSourceFrame(blob);
          const resp = await fetch(`${opts.sdkUrl}/stream/${streamId}/publish?seq=${seq}`, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg", ...publishHeaders },
            body: frameBlob,
          }).catch(() => null);

          if (resp?.ok) {
            seq++;
            consecutive404 = 0;
          } else if (resp?.status === 404) {
            consecutive404++;
            if (consecutive404 > 10) return; // stream gone
          } else if (resp?.status === 410) {
            return;
          }
        } catch { /* continue */ }

        await new Promise((r) => setTimeout(r, 100));
      }
    }
    publishLoop();
  }, [opts.sdkUrl, opts.apiKey, captureSourceFrame]);

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

  return { state, start, attach, stop, control, setSource, streamId: streamIdRef.current };
}
