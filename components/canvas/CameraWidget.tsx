"use client";

import { useCallback, useRef, useState } from "react";
import { startWebcam, stopWebcam, captureFrame } from "@/lib/stream/webcam";
import {
  startStream,
  waitForReady,
  startPublishing,
  startPolling,
  stopStream,
  type Lv2vSession,
} from "@/lib/stream/session";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";

export function CameraWidget() {
  const [active, setActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<Lv2vSession | null>(null);
  const { addCard, updateCard, addEdge } = useCanvasStore();
  const addMessage = useChatStore((s) => s.addMessage);

  const handleStart = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      await startWebcam(videoRef.current);
      setActive(true);
      addMessage("Camera started", "system");
    } catch (e) {
      addMessage(
        `Camera error: ${e instanceof Error ? e.message : "Unknown"}`,
        "system"
      );
    }
  }, [addMessage]);

  const handleStop = useCallback(() => {
    stopWebcam();
    setActive(false);
    if (sessionRef.current) {
      stopStream(sessionRef.current);
      sessionRef.current = null;
      setStreaming(false);
    }
  }, []);

  const handleLv2v = useCallback(async () => {
    if (!videoRef.current || streaming) return;
    const prompt = window.prompt("LV2V style prompt:", "cyberpunk neon city");
    if (!prompt) return;

    setStreaming(true);
    setStatus("Starting stream…");

    try {
      const session = await startStream(prompt);
      sessionRef.current = session;

      // Create stream card
      const card = addCard({
        type: "stream",
        title: `LV2V: ${prompt.slice(0, 30)}`,
        refId: `lv2v_${Date.now()}`,
      });

      setStatus("Waiting for pipeline…");
      await waitForReady(session, (phase) => setStatus(phase));

      // Publish webcam frames at ~10fps
      const video = videoRef.current!;
      startPublishing(session, () => captureFrame(video), 100);

      // Poll output frames
      session.onFrame = (url) => {
        updateCard(card.id, { url });
      };
      startPolling(session, 200);

      setStatus("Streaming");
      addMessage(`LV2V stream started: ${prompt}`, "agent");
    } catch (e) {
      setStreaming(false);
      setStatus("");
      addMessage(
        `LV2V error: ${e instanceof Error ? e.message : "Unknown"}`,
        "system"
      );
    }
  }, [streaming, addCard, updateCard, addEdge, addMessage]);

  return (
    <div
      className={`fixed bottom-4 left-4 z-[1500] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] ${
        active ? "w-[280px]" : "w-auto"
      }`}
    >
      {/* Header */}
      <div className="flex h-9 items-center gap-2 border-b border-[var(--border)] bg-white/[0.02] px-2.5">
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: "#10b981", background: "rgba(16,185,129,0.1)" }}
        >
          CAM
        </span>
        <span className="flex-1 text-[11px] font-medium text-[var(--text-muted)]">
          Camera
        </span>
        {active && (
          <>
            <button
              onClick={handleLv2v}
              disabled={streaming}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-[#ec4899] transition-colors hover:bg-white/[0.1] disabled:opacity-50"
            >
              {streaming ? status : "LV2V"}
            </button>
            <button
              onClick={() => setMinimized(!minimized)}
              className="flex h-[22px] w-[22px] items-center justify-center rounded bg-transparent text-xs text-[var(--text-dim)] hover:bg-white/[0.08]"
            >
              {minimized ? "□" : "—"}
            </button>
            <button
              onClick={handleStop}
              className="flex h-[22px] w-[22px] items-center justify-center rounded bg-transparent text-xs text-[var(--text-dim)] hover:bg-white/[0.08] hover:text-red-500"
            >
              ×
            </button>
          </>
        )}
        {!active && (
          <button
            onClick={handleStart}
            className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-white/[0.1]"
          >
            Start
          </button>
        )}
      </div>

      {/* Video preview */}
      {active && !minimized && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full bg-black"
        />
      )}
      {/* Hidden video for getUserMedia when not yet active */}
      {!active && (
        <video ref={videoRef} autoPlay muted playsInline className="hidden" />
      )}
    </div>
  );
}
