"use client";

/**
 * ScopePlayer — renders a live Scope stream via SDK trickle protocol.
 *
 * Uses canvas-based rendering for smooth frame display:
 * - createImageBitmap for off-thread JPEG decode
 * - requestAnimationFrame for smooth render (holds last frame if poll is slow)
 * - No blob URL leaks
 * - FPS counter overlay
 */

import React, { useRef, useEffect, useCallback, type ReactNode } from "react";
import { useSdkStream, type StreamSource } from "./use-sdk-stream";
import type { ScopeParams, ScopeStreamState } from "./types";

export interface ScopePlayerProps {
  /** SDK service URL */
  sdkUrl: string;
  /** Daydream API key */
  apiKey?: string;
  /** Initial params — if provided, auto-starts a NEW stream */
  initialParams?: ScopeParams;
  /** Attach to an already-started stream (skip start, just poll frames) */
  externalStreamId?: string;
  /** Called when state changes */
  onStateChange?: (state: ScopeStreamState) => void;
  /** CSS class */
  className?: string;
  /** Overlay content (scene name, recording indicator, etc.) */
  children?: ReactNode;
  /** Show FPS counter. Default: true */
  showFps?: boolean;
  /** Called once with setSource, so the parent can switch publish input mid-stream */
  onSourceReady?: (setSource: (source: StreamSource) => void) => void;
}

export function ScopePlayer({
  sdkUrl,
  apiKey,
  initialParams,
  externalStreamId,
  onStateChange,
  className,
  children,
  showFps = true,
  onSourceReady,
}: ScopePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastBitmapRef = useRef<ImageBitmap | null>(null);
  const animFrameRef = useRef<number>(0);

  const handleFrame = useCallback((bitmap: ImageBitmap) => {
    lastBitmapRef.current = bitmap;
  }, []);

  const { state, start, attach, stop, control, setSource } = useSdkStream({
    sdkUrl,
    apiKey,
    onFrame: handleFrame,
    onStateChange,
  });

  // Expose setSource to parent
  useEffect(() => {
    onSourceReady?.(setSource);
  }, [onSourceReady, setSource]);

  // Render loop — draws latest frame to canvas at display refresh rate
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function renderLoop() {
      if (lastBitmapRef.current && ctx) {
        const bm = lastBitmapRef.current;
        if (canvas!.width !== bm.width || canvas!.height !== bm.height) {
          canvas!.width = bm.width;
          canvas!.height = bm.height;
        }
        ctx.drawImage(bm, 0, 0);
      }
      animFrameRef.current = requestAnimationFrame(renderLoop);
    }
    animFrameRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Attach to external stream (started by agent tool)
  useEffect(() => {
    if (externalStreamId && state.status === "idle") {
      attach(externalStreamId);
    }
  }, [externalStreamId, state.status, attach]);

  // Auto-start if initialParams provided (standalone mode)
  useEffect(() => {
    if (initialParams && !externalStreamId && state.status === "idle") {
      start(initialParams);
    }
  }, [initialParams, externalStreamId, state.status, start]);

  // Status overlay
  const statusOverlay = state.status !== "streaming" && (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)",
      color: "#fff", gap: 8,
    }}>
      {state.status === "idle" && <span style={{ fontSize: 14, opacity: 0.5 }}>Ready to stream</span>}
      {state.status === "connecting" && (
        <>
          <div style={{ width: 24, height: 24, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13 }}>Connecting…</span>
        </>
      )}
      {state.status === "warming" && (
        <>
          <div style={{ width: 24, height: 24, border: "2px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13 }}>{state.phase || "Warming up…"}</span>
          <span style={{ fontSize: 11, opacity: 0.5 }}>Cold start can take 1-2 minutes</span>
        </>
      )}
      {state.status === "error" && (
        <>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <span style={{ fontSize: 13, color: "#ef4444" }}>{state.error}</span>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", background: "#000", borderRadius: 8, overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        data-scope-player=""
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
      {statusOverlay}
      {/* FPS counter */}
      {showFps && state.status === "streaming" && (
        <div style={{
          position: "absolute", top: 6, right: 8,
          fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.5)",
          background: "rgba(0,0,0,0.4)", padding: "2px 6px", borderRadius: 4,
        }}>
          {state.fps} FPS · {state.framesReceived} frames
        </div>
      )}
      {/* User overlay content */}
      {children}
    </div>
  );
}

// Re-export for direct access
export { useSdkStream } from "./use-sdk-stream";
