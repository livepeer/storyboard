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
import { FrameExtractor } from "@/lib/stream/frame-extractor";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";

export function CameraWidget() {
  const [active, setActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  // `streamCount` is derived state (length of sessionsRef at last update).
  // The authoritative source is sessionsRef; streamCount just drives
  // re-renders. `streaming` is true iff at least one stream is active.
  const [streamCount, setStreamCount] = useState(0);
  const streaming = streamCount > 0;
  const [status, setStatus] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState("");
  // Default to DIRECT mode. "AI" mode sends the text through the main
  // chat agent which takes 2-5 seconds per prompt update because of the
  // Gemini round-trip + tool schemas + reasoning. For simple descriptive
  // prompts like "superman fights batman in marvel style" the direct
  // path (controlStream → SDK → fal, ~1.5-3s dominated by fal apply
  // latency) is strictly faster. Agent mode remains available for
  // complex asks like "make it more dreamy" that benefit from
  // interpretation, but is no longer the default.
  const [useAgent, setUseAgent] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Map of active LV2V sessions keyed by the canvas card id that owns
  // each stream. Multiple concurrent streams against the same webcam
  // feed are supported — each session publishes its own captured
  // frames at 10fps to its own trickle channel, so they don't share
  // any state on the SDK side. The per-stream asyncio.Lock in
  // sdk-service-build/app.py (feat/sdk-nonblocking-io branch)
  // guarantees correct serialization per stream.
  const sessionsRef = useRef<Map<string, Lv2vSession>>(new Map());
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

  // Clean up ALL active streams on page unload to prevent orphans on the SDK.
  // Each session is stopped independently; the SDK's reaper would also kill
  // them after ~2min idle, but explicit stop is cleaner.
  useEffect(() => {
    const cleanup = () => {
      for (const session of sessionsRef.current.values()) {
        if (!session.stopped) {
          stopStream(session);
        }
      }
      sessionsRef.current.clear();
    };
    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
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

  // Per-stream frame extractors for non-webcam sources, keyed by
  // canvas card id so multiple concurrent streams can each own their
  // own extractor (same webcam-style fan-out, for image/video sources).
  const extractorsRef = useRef<Map<string, FrameExtractor>>(new Map());

  // Helper: add a new session to the map and bump the re-render counter.
  const registerSession = useCallback((cardId: string, session: Lv2vSession) => {
    sessionsRef.current.set(cardId, session);
    setStreamCount(sessionsRef.current.size);
  }, []);

  // Helper: remove a session from the map (after stop or error).
  const unregisterSession = useCallback((cardId: string) => {
    sessionsRef.current.delete(cardId);
    extractorsRef.current.get(cardId)?.stop();
    extractorsRef.current.delete(cardId);
    setStreamCount(sessionsRef.current.size);
  }, []);

  // Listen for agent-triggered LV2V start (from chat)
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        prompt: string;
        params?: Record<string, unknown>;
        needsInput?: boolean;
        source?: { type: string; url: string };
        streamCardId?: string;
      };
      if (!detail?.prompt) return;

      const hasNonWebcamSource = detail.source && detail.source.type !== "webcam" && detail.source.url;

      if (hasNonWebcamSource) {
        // --- Non-webcam source: each call creates a new stream + card,
        // even if other streams (webcam or otherwise) are already
        // running. Supports N concurrent streams per source card.
        setStatus("Starting stream from source\u2026");
        setCurrentPrompt(detail.prompt);
        let cardId: string | undefined;
        try {
          const session = await startStream(detail.prompt, detail.params);

          const cardRefId = detail.streamCardId
            ? useCanvasStore.getState().cards.find((c) => c.id === detail.streamCardId)?.refId || `lv2v_${Date.now()}`
            : `lv2v_${Date.now()}`;
          let card = detail.streamCardId
            ? useCanvasStore.getState().cards.find((c) => c.id === detail.streamCardId)
            : undefined;
          if (!card) {
            card = addCard({
              type: "stream",
              title: `LV2V: ${detail.prompt.slice(0, 25)}`,
              refId: cardRefId,
            });
          }
          cardId = card.id;
          linkRefIdToStream(card.refId, session.streamId);
          registerSession(cardId, session);

          setStatus("Waiting for pipeline\u2026");
          addMessage(`Starting LV2V from ${detail.source!.type} source\u2026`, "system");
          await waitForReady(session, (phase) => setStatus(phase));

          const sourceType = detail.source!.type as "image" | "video" | "url";
          const extractor = new FrameExtractor({
            type: sourceType,
            url: detail.source!.url,
            fps: 10,
            quality: 0.8,
          });
          await extractor.init();
          extractorsRef.current.set(cardId, extractor);

          startPublishing(session, () => extractor.captureFrame(), 100);

          session.onFrame = (url) => updateCard(card!.id, { url });
          session.onStatus = (msg) => setStatus(msg);
          session.onError = (err) => {
            addMessage(`LV2V: ${err}`, "system");
            if (cardId) unregisterSession(cardId);
          };
          startPolling(session, 200);

          setStatus(`Streaming (${sessionsRef.current.size} active)`);
          addMessage(`LV2V started from ${sourceType}: ${detail.prompt}`, "agent");
        } catch (e) {
          if (cardId) unregisterSession(cardId);
          setStatus("");
          addMessage(
            `LV2V error: ${e instanceof Error ? e.message : "Unknown"}`,
            "system",
          );
        }
      } else {
        // --- Webcam source: one webcam feed, N concurrent streams.
        // Each lv2v-start event creates a new session and a new
        // stream card. The webcam is only started once (first call);
        // subsequent calls share the same video element, each running
        // its own startPublishing interval that captures fresh frames
        // from the shared video feed 10 times per second.
        if (!videoRef.current) return;
        if (!active || !videoRef.current.srcObject) {
          try {
            await startWebcam(videoRef.current);
            setActive(true);
            addMessage("Camera auto-started for LV2V", "system");
          } catch {
            addMessage("Camera failed to start", "system");
            return;
          }
          await new Promise((r) => setTimeout(r, 500));
        }

        setStatus("Starting stream\u2026");
        setCurrentPrompt(detail.prompt);
        let cardId: string | undefined;
        try {
          const session = await startStream(detail.prompt, detail.params);
          const cardRefId = `lv2v_${Date.now()}`;
          const card = addCard({
            type: "stream",
            title: `LV2V: ${detail.prompt.slice(0, 25)}`,
            refId: cardRefId,
          });
          cardId = card.id;
          linkRefIdToStream(cardRefId, session.streamId);
          registerSession(cardId, session);

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
          session.onError = (err) => {
            addMessage(`LV2V: ${err}`, "system");
            if (cardId) unregisterSession(cardId);
          };
          startPolling(session, 200);

          setStatus(`Streaming (${sessionsRef.current.size} active)`);
          addMessage(`LV2V started: ${detail.prompt}`, "agent");
        } catch (e) {
          if (cardId) unregisterSession(cardId);
          setStatus("");
          addMessage(
            `LV2V error: ${e instanceof Error ? e.message : "Unknown"}`,
            "system",
          );
        }
      }
    };
    window.addEventListener("lv2v-start", handler);
    return () => window.removeEventListener("lv2v-start", handler);
  }, [active, addCard, updateCard, addMessage, registerSession, unregisterSession]);

  const handleStop = useCallback(() => {
    // Stop ALL active sessions and clean up their extractors.
    for (const [cardId, session] of sessionsRef.current.entries()) {
      stopStream(session);
      extractorsRef.current.get(cardId)?.stop();
    }
    sessionsRef.current.clear();
    extractorsRef.current.clear();
    setStreamCount(0);
    setCurrentPrompt("");
    stopWebcam();
    setActive(false);
  }, []);

  const handleLv2v = useCallback(async () => {
    if (!videoRef.current) return;
    const prompt = window.prompt("LV2V style prompt:", "cyberpunk neon city");
    if (!prompt) return;

    setStatus("Starting stream\u2026");
    setCurrentPrompt(prompt);
    let cardId: string | undefined;

    try {
      const session = await startStream(prompt);
      const cardRefId = `lv2v_${Date.now()}`;
      const card = addCard({
        type: "stream",
        title: `LV2V: ${prompt.slice(0, 30)}`,
        refId: cardRefId,
      });
      cardId = card.id;
      linkRefIdToStream(cardRefId, session.streamId);
      registerSession(cardId, session);

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
          if (cardId) unregisterSession(cardId);
          setStatus("");
          return;
        }
      }

      addMessage("Pipeline ready \u2014 starting frame capture", "agent");

      startPublishing(session, () => captureFrame(video), 100);

      session.onFrame = (url) => updateCard(card.id, { url });
      session.onStatus = (msg) => setStatus(msg);
      session.onError = (err) => {
        addMessage(`LV2V: ${err}`, "system");
        if (cardId) unregisterSession(cardId);
      };

      startPolling(session, 200);

      setStatus(`Streaming (${sessionsRef.current.size} active)`);
      addMessage(`LV2V stream started: ${prompt}`, "agent");
    } catch (e) {
      if (cardId) unregisterSession(cardId);
      setStatus("");
      setCurrentPrompt("");
      addMessage(
        `LV2V error: ${e instanceof Error ? e.message : "Unknown"}`,
        "system",
      );
    }
  }, [addCard, updateCard, addMessage, registerSession, unregisterSession]);

  /** Send a direct control command to EVERY active LV2V stream.
   *
   * With multi-stream support, the camera widget's inline prompt input
   * broadcasts to all currently-running sessions. For per-stream
   * control, use the individual stream card's cockpit UI instead.
   *
   * Optimistic UI: the confirmation message and currentPrompt state are
   * updated synchronously BEFORE the network fires, so the user sees
   * immediate feedback. The actual fal-side apply still takes ~1.5-3s
   * (frame propagation through the pipeline) but that's irreducible.
   * We fire-and-forget the controlStream() calls so the UI never blocks
   * on the network round-trip.
   */
  const handleDirectControl = useCallback(
    (text: string) => {
      const sessions = Array.from(sessionsRef.current.values());
      const trimmed = text.trim();
      if (sessions.length === 0 || !trimmed) return;

      // Optimistic: update local state + show confirmation IMMEDIATELY.
      setCurrentPrompt(trimmed);
      addMessage(
        `\u2192 ${trimmed}${sessions.length > 1 ? ` (${sessions.length} streams)` : ""}`,
        "system",
      );

      // Fire the network calls in parallel without awaiting. Errors
      // surface as a follow-up system message but don't block the UI.
      Promise.all(sessions.map((s) => controlStream(s, trimmed))).catch(
        (e: unknown) => {
          addMessage(
            `Control error: ${e instanceof Error ? e.message : "Unknown"}`,
            "system",
          );
        },
      );
    },
    [addMessage],
  );

  /** Send intent to the agent to interpret via live-director skill */
  const handleAgentControl = useCallback(
    (text: string) => {
      const sessions = Array.from(sessionsRef.current.values());
      if (sessions.length === 0 || !text.trim()) return;
      // Use the most recently started session's stream id as the
      // implicit target context — the agent can still look at the
      // canvas to pick a different one if the intent mentions it.
      const lastSession = sessions[sessions.length - 1];
      window.dispatchEvent(
        new CustomEvent("chat-prefill", {
          detail: {
            text: `[LV2V stream ${lastSession.streamId} active (${sessions.length} total), current prompt: "${currentPrompt}"] ${text.trim()}`,
            autoSend: true,
          },
        }),
      );
    },
    [currentPrompt],
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

      {/* Stream info bar — shows FPS, pipeline, session stats.
          With multi-stream support, the numbers are aggregated across
          all active sessions (pub/recv are sums). For per-stream
          detail, use each stream card's cockpit UI. */}
      {streaming && !minimized && (() => {
        const sessions = Array.from(sessionsRef.current.values());
        const anyStopped = sessions.some((s) => s.stopped);
        const allStopped = sessions.length > 0 && sessions.every((s) => s.stopped);
        const sumPub = sessions.reduce((acc, s) => acc + (s.publishOk || 0), 0);
        const sumRecv = sessions.reduce((acc, s) => acc + (s.totalRecv || 0), 0);
        const sumErr = sessions.reduce((acc, s) => acc + (s.publishErr || 0), 0);
        return (
        <div className="flex items-center gap-2 border-t border-[var(--border)] bg-white/[0.02] px-2 py-1 text-[8px] text-[var(--text-dim)]">
          <span style={{ color: allStopped ? "#ef4444" : "#10b981" }}>
            {allStopped ? "Stopped" : anyStopped ? "Partial" : "Live"}
          </span>
          <span>streams:{sessions.length}</span>
          <span>pub:{sumPub}</span>
          <span>recv:{sumRecv}</span>
          {sumErr ? (
            <span style={{ color: "#f59e0b" }}>err:{sumErr}</span>
          ) : null}
          <span className="flex-1" />
          <span>longlive</span>
        </div>
        );
      })()}

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
