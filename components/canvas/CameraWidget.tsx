"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startWebcam, stopWebcam, captureFrame } from "@/lib/stream/webcam";
import {
  startStream,
  waitForReady,
  startPublishing,
  startPolling,
  controlStream,
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
  const [promptInput, setPromptInput] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [useAgent, setUseAgent] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<Lv2vSession | null>(null);
  const promptRef = useRef<HTMLInputElement>(null);
  const { addCard, updateCard } = useCanvasStore();
  const addMessage = useChatStore((s) => s.addMessage);

  // Clean up stream on page unload to prevent orphaned streams on the SDK
  useEffect(() => {
    const cleanup = () => {
      if (sessionRef.current && !sessionRef.current.stopped) {
        stopStream(sessionRef.current);
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("beforeunload", cleanup);
      cleanup(); // also clean on component unmount (HMR, navigation)
    };
  }, []);

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
      setCurrentPrompt("");
    }
  }, []);

  const handleLv2v = useCallback(async () => {
    if (!videoRef.current || streaming) return;
    const prompt = window.prompt("LV2V style prompt:", "cyberpunk neon city");
    if (!prompt) return;

    setStreaming(true);
    setStatus("Starting stream\u2026");
    setCurrentPrompt(prompt);

    try {
      const session = await startStream(prompt);
      sessionRef.current = session;

      const card = addCard({
        type: "stream",
        title: `LV2V: ${prompt.slice(0, 30)}`,
        refId: `lv2v_${Date.now()}`,
      });

      setStatus("Waiting for pipeline (2-5 min cold start)\u2026");
      addMessage("Waiting for pipeline to be ready (2-5 min on cold start)\u2026", "system");
      await waitForReady(session, (phase) => setStatus(phase));

      // Camera sleep detection — browser may suspend camera during long pipeline wait
      const video = videoRef.current!;
      if (!video.srcObject || video.videoWidth === 0) {
        addMessage("Camera suspended during wait \u2014 restarting\u2026", "system");
        setStatus("Restarting camera\u2026");
        await startWebcam(video);
        await new Promise((r) => setTimeout(r, 1000));
        if (!video.srcObject || video.videoWidth === 0) {
          addMessage("Camera unavailable \u2014 cannot publish frames", "system");
          setStreaming(false);
          setStatus("");
          return;
        }
      }

      addMessage("Pipeline ready \u2014 starting frame capture", "agent");

      // Publish webcam frames at ~10fps (only AFTER pipeline ready)
      startPublishing(session, () => captureFrame(video), 100);

      // Wire up callbacks
      session.onFrame = (url) => {
        updateCard(card.id, { url });
      };
      session.onStatus = (msg) => {
        setStatus(msg);
      };
      session.onError = (err) => {
        addMessage(`LV2V: ${err}`, "system");
      };

      startPolling(session, 200);

      setStatus("Publishing cam @ 10fps\u2026");
      addMessage(`LV2V stream started: ${prompt}`, "agent");
    } catch (e) {
      setStreaming(false);
      setStatus("");
      setCurrentPrompt("");
      addMessage(
        `LV2V error: ${e instanceof Error ? e.message : "Unknown"}`,
        "system"
      );
    }
  }, [streaming, addCard, updateCard, addMessage]);

  /** Send a direct control command to the LV2V stream */
  const handleDirectControl = useCallback(
    async (text: string) => {
      if (!sessionRef.current || !text.trim()) return;
      try {
        await controlStream(sessionRef.current, text.trim());
        setCurrentPrompt(text.trim());
        addMessage(`LV2V prompt: ${text.trim()}`, "system");
      } catch (e) {
        addMessage(
          `Control error: ${e instanceof Error ? e.message : "Unknown"}`,
          "system"
        );
      }
    },
    [addMessage]
  );

  /** Send intent to the agent to interpret via live-director skill */
  const handleAgentControl = useCallback(
    (text: string) => {
      if (!sessionRef.current || !text.trim()) return;
      const streamId = sessionRef.current.streamId;
      // Send to chat agent with context about the active stream
      window.dispatchEvent(
        new CustomEvent("chat-prefill", {
          detail: {
            text: `[LV2V stream ${streamId} active, current prompt: "${currentPrompt}"] ${text.trim()}`,
            autoSend: true,
          },
        })
      );
    },
    [currentPrompt]
  );

  const handlePromptSubmit = useCallback(() => {
    const text = promptInput.trim();
    if (!text) return;
    setPromptInput("");
    if (useAgent) {
      handleAgentControl(text);
    } else {
      handleDirectControl(text);
    }
  }, [promptInput, useAgent, handleAgentControl, handleDirectControl]);

  const handlePromptKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handlePromptSubmit();
      }
    },
    [handlePromptSubmit]
  );

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
              {minimized ? "\u25A1" : "\u2014"}
            </button>
            <button
              onClick={handleStop}
              className="flex h-[22px] w-[22px] items-center justify-center rounded bg-transparent text-xs text-[var(--text-dim)] hover:bg-white/[0.08] hover:text-red-500"
            >
              \u00D7
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

      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={active && !minimized ? "w-full bg-black" : "hidden"}
      />

      {/* LV2V Prompt Control Bar — visible when streaming */}
      {streaming && !minimized && (
        <div className="border-t border-[var(--border)] p-1.5">
          {/* Current prompt display */}
          {currentPrompt && (
            <div className="mb-1 truncate text-[9px] text-[var(--text-dim)]">
              \u25B6 {currentPrompt}
            </div>
          )}

          {/* Mode toggle + input */}
          <div className="flex gap-1">
            <button
              onClick={() => setUseAgent(!useAgent)}
              title={useAgent ? "Agent mode: AI interprets your intent" : "Direct mode: sends raw prompt"}
              className={`shrink-0 rounded px-1.5 py-1 text-[8px] font-semibold uppercase transition-colors ${
                useAgent
                  ? "bg-purple-500/20 text-purple-300"
                  : "bg-white/[0.06] text-[var(--text-dim)]"
              }`}
            >
              {useAgent ? "AI" : "RAW"}
            </button>
            <input
              ref={promptRef}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={handlePromptKey}
              placeholder={
                useAgent
                  ? "make it dreamy, go wild, freeze..."
                  : "oil painting warm colors..."
              }
              className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-[10px] text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
            />
            <button
              onClick={handlePromptSubmit}
              className="shrink-0 rounded bg-white/[0.08] px-2 py-1 text-[9px] text-[var(--text-muted)] transition-colors hover:bg-white/[0.12]"
            >
              \u21B5
            </button>
          </div>

          {/* Quick presets */}
          <div className="mt-1 flex flex-wrap gap-1">
            {[
              { label: "Dreamy", cmd: useAgent ? "make it dreamy" : "dreamy soft focus ethereal glow" },
              { label: "Wild", cmd: useAgent ? "go wild" : "psychedelic fractal patterns neon" },
              { label: "Freeze", cmd: useAgent ? "freeze this" : currentPrompt },
              { label: "Paint", cmd: useAgent ? "make it look like a painting" : "oil painting warm colors visible brush strokes" },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  if (useAgent) handleAgentControl(p.cmd);
                  else handleDirectControl(p.cmd);
                }}
                className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[8px] text-[var(--text-dim)] transition-colors hover:bg-white/[0.08] hover:text-[var(--text-muted)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
