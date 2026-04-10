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
  linkRefIdToStream,
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
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const { addCard, updateCard } = useCanvasStore();
  const addMessage = useChatStore((s) => s.addMessage);

  // --- Drag to reposition ---
  const onDragStart = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !panelRef.current) return;
    const { startX, startY, origX, origY } = dragRef.current;
    const panel = panelRef.current;
    panel.style.left = `${origX + (e.clientX - startX)}px`;
    panel.style.top = `${origY + (e.clientY - startY)}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }, []);
  const onDragEnd = useCallback(() => { dragRef.current = null; }, []);

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

  // Listen for agent-triggered LV2V start (from chat)
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { prompt: string };
      if (!detail?.prompt) return;
      // Auto-start webcam if not active
      if (!active && videoRef.current) {
        try {
          await startWebcam(videoRef.current);
          setActive(true);
          addMessage("Camera auto-started for LV2V", "system");
        } catch {
          addMessage("Camera failed to start", "system");
          return;
        }
        // Wait for video to initialize
        await new Promise((r) => setTimeout(r, 500));
      }
      // Start LV2V with the prompt
      if (!streaming && videoRef.current) {
        setStreaming(true);
        setStatus("Starting stream\u2026");
        setCurrentPrompt(detail.prompt);
        try {
          const session = await startStream(detail.prompt);
          sessionRef.current = session;
          const cardRefId = `lv2v_${Date.now()}`;
          const card = addCard({ type: "stream", title: `LV2V: ${detail.prompt.slice(0, 25)}`, refId: cardRefId });
          linkRefIdToStream(cardRefId, session.streamId);

          setStatus("Waiting for pipeline\u2026");
          addMessage("Waiting for LV2V pipeline\u2026", "system");
          await waitForReady(session, (phase) => setStatus(phase));

          const video = videoRef.current!;
          if (!video.srcObject || video.videoWidth === 0) {
            await startWebcam(video);
            await new Promise((r) => setTimeout(r, 1000));
          }

          startPublishing(session, () => captureFrame(video), 100);
          session.onFrame = (url) => updateCard(card.id, { url });
          session.onStatus = (msg) => setStatus(msg);
          session.onError = (err) => addMessage(`LV2V: ${err}`, "system");
          startPolling(session, 200);

          setStatus("Streaming");
          addMessage(`LV2V started: ${detail.prompt}`, "agent");
        } catch (e) {
          setStreaming(false);
          setStatus("");
          addMessage(`LV2V error: ${e instanceof Error ? e.message : "Unknown"}`, "system");
        }
      }
    };
    window.addEventListener("lv2v-start", handler);
    return () => window.removeEventListener("lv2v-start", handler);
  }, [active, streaming, addCard, updateCard, addMessage]);

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

      const cardRefId = `lv2v_${Date.now()}`;
      const card = addCard({
        type: "stream",
        title: `LV2V: ${prompt.slice(0, 30)}`,
        refId: cardRefId,
      });

      // Link card refId to SDK stream ID so agent can use either
      linkRefIdToStream(cardRefId, session.streamId);

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
      ref={panelRef}
      className={`fixed bottom-4 left-4 z-[1500] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] ${
        active ? "w-[280px]" : "w-auto"
      }`}
    >
      {/* Header — draggable */}
      <div
        className="flex h-9 cursor-move items-center gap-2 border-b border-[var(--border)] bg-white/[0.02] px-2.5"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
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
            {streaming ? (
              <button
                onClick={handleStop}
                className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-400 transition-colors hover:bg-red-500/25"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleLv2v}
                className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-[#ec4899] transition-colors hover:bg-white/[0.1]"
              >
                LV2V
              </button>
            )}
            {streaming && (
              <span className="max-w-[80px] truncate text-[8px] text-[var(--text-dim)]">{status}</span>
            )}
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

      {/* Stream info bar — shows FPS, pipeline, session stats */}
      {streaming && !minimized && (
        <div className="flex items-center gap-2 border-t border-[var(--border)] bg-white/[0.02] px-2 py-1 text-[8px] text-[var(--text-dim)]">
          <span style={{ color: sessionRef.current?.stopped ? "#ef4444" : "#10b981" }}>
            {sessionRef.current?.stopped ? "Stopped" : "Live"}
          </span>
          <span>pub:{sessionRef.current?.publishOk || 0}</span>
          <span>recv:{sessionRef.current?.totalRecv || 0}</span>
          {sessionRef.current?.publishErr ? (
            <span style={{ color: "#f59e0b" }}>err:{sessionRef.current.publishErr}</span>
          ) : null}
          <span className="flex-1" />
          <span>longlive</span>
        </div>
      )}

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

          {/* Quick presets — maps to Scope presets + agent commands */}
          <div className="mt-1 flex flex-wrap gap-1">
            {[
              { label: "Dreamy", cmd: useAgent ? "make it dreamy" : "dreamy soft focus ethereal glow" },
              { label: "Cinema", cmd: useAgent ? "cinematic film look" : "cinematic dramatic lighting film grain" },
              { label: "Anime", cmd: useAgent ? "anime style" : "anime cel shaded vibrant colors" },
              { label: "Abstract", cmd: useAgent ? "go abstract and wild" : "abstract surreal fractal patterns" },
              { label: "Paint", cmd: useAgent ? "oil painting style" : "oil painting warm colors thick brush strokes" },
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
