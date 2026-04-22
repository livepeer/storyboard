"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  InfiniteBoard,
  ArtifactCard,
  ChatPanel,
  createArtifactStore,
  createChatStore,
  type Artifact,
} from "@livepeer/creative-kit";
import { ScopePlayer, type ScopeStreamState } from "@livepeer/scope-player";
import type { ScopeParams } from "@livepeer/scope-player";
import { AgentRunner, ToolRegistry, WorkingMemoryStore, SessionMemoryStore } from "@livepeer/agent";
import { createStageTools, type StageToolContext } from "../lib/stage-tools";
import { PerformanceEngine, type PerformanceState, type Scene } from "../lib/performance";
import { STAGE_SYSTEM_PROMPT } from "../lib/stage-prompt";
import { SceneStrip } from "../components/SceneStrip";
import { WaveformBar } from "../components/WaveformBar";
import { RecordBar } from "../components/RecordBar";
import { detectBpm } from "../lib/bpm-detect";
import { StageRecorder, type RecorderState } from "../lib/recorder";

// ─── Stores ───
const artifacts = createArtifactStore();
const chat = createChatStore();

function getSdkConfig() {
  if (typeof window === "undefined") return { url: "https://sdk.daydream.monster", key: "" };
  return {
    url: localStorage.getItem("sdk_service_url") || "https://sdk.daydream.monster",
    key: localStorage.getItem("sdk_api_key") || "",
  };
}

// ─── Styles ───
const S = {
  root: {
    display: "flex", height: "100vh", overflow: "hidden", background: "#08080c",
  } as React.CSSProperties,

  canvasArea: {
    flex: 1, position: "relative" as const, overflow: "hidden",
  } as React.CSSProperties,

  chatSidebar: {
    width: 360, display: "flex", flexDirection: "column" as const,
    background: "rgba(12, 12, 18, 0.85)", backdropFilter: "blur(20px) saturate(1.2)",
    borderLeft: "1px solid rgba(255,255,255,0.06)",
  } as React.CSSProperties,

  chatHeader: {
    padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  } as React.CSSProperties,

  chatTitle: {
    fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em",
    background: "linear-gradient(135deg, #818cf8, #c084fc)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  } as React.CSSProperties,

  liveIndicator: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)",
    background: "rgba(255,255,255,0.03)", padding: "4px 10px", borderRadius: 20,
  } as React.CSSProperties,

  liveDot: {
    width: 6, height: 6, borderRadius: "50%", background: "#4ade80",
    animation: "pulse-dot 1.5s ease-in-out infinite",
  } as React.CSSProperties,

  streamOverlay: {
    position: "absolute" as const, bottom: 10, left: 12,
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.6)",
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
    padding: "4px 10px", borderRadius: 20,
  } as React.CSSProperties,

  topBar: {
    position: "absolute" as const, top: 14, right: 14, zIndex: 100,
    display: "flex", gap: 8,
  } as React.CSSProperties,

  cardContent: {
    width: "100%", height: "100%", background: "rgba(255,255,255,0.02)",
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, overflow: "hidden",
  } as React.CSSProperties,

  overlay: {
    position: "fixed" as const, inset: 0, zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
    animation: "fadeIn 0.2s ease-out",
  } as React.CSSProperties,

  dialog: {
    width: 400, background: "rgba(16,16,22,0.95)", backdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
    padding: "28px 28px 24px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
    animation: "fadeInScale 0.25s ease-out",
  } as React.CSSProperties,

  dialogTitle: {
    margin: "0 0 4px", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em",
  } as React.CSSProperties,

  dialogSubtitle: {
    margin: "0 0 20px", fontSize: 12, color: "#8888aa",
  } as React.CSSProperties,

  label: {
    fontSize: 11, fontWeight: 600, color: "#8888aa", display: "block",
    marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: "0.05em",
  } as React.CSSProperties,
};

// ─── Component ───
export default function Stage() {
  const [mounted, setMounted] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [arts, setArts] = useState<Artifact[]>([]);
  const [streamState, setStreamState] = useState<ScopeStreamState | null>(null);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const streamIdRef = useRef<string | null>(null);

  const [messages, setMessages] = useState(chat.getState().messages);
  const perfRef = useRef(new PerformanceEngine());
  const [perfState, setPerfState] = useState<PerformanceState>({ scenes: [], currentScene: 0, isPlaying: false, elapsed: 0, totalDuration: 0 });
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef(new StageRecorder());
  const [recState, setRecState] = useState<RecorderState>({ isRecording: false, duration: 0, blobUrl: null });
  const playerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingPlayRef = useRef(false);

  // Scene set tabs — each prompt creates a scene set, tabs let you switch
  interface SceneSet { id: string; title: string; scenes: Scene[]; audioUrl?: string | null }
  const sceneSetsRef = useRef<SceneSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [sceneSets, setSceneSets] = useState<Array<{ id: string; title: string; sceneCount: number }>>([]);

  useEffect(() => {
    setMounted(true);
    const unsubArt = artifacts.subscribe((s) => setArts([...s.artifacts]));
    const unsubChat = chat.subscribe((s) => setMessages([...s.messages]));
    return () => { unsubArt(); unsubChat(); };
  }, []);

  // Helper to sync scene sets UI
  const syncSceneSets = useCallback(() => {
    setSceneSets(sceneSetsRef.current.map((s) => ({ id: s.id, title: s.title, sceneCount: s.scenes.length })));
  }, []);

  // Play audio when URL changes
  useEffect(() => {
    if (!audioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = audioUrl;
      audioRef.current.loop = true;
      audioRef.current.play().catch(() => {});
    }
  }, [audioUrl]);

  // Auto-play performance when stream becomes ready
  useEffect(() => {
    if (pendingPlayRef.current && streamState?.status === "streaming" && streamIdRef.current) {
      pendingPlayRef.current = false;
      // Create a controlFn with retry — /control may 404 if SDK session is still initializing
      const controlFn = async (params: Record<string, unknown>) => {
        const cfg = getSdkConfig();
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const resp = await fetch(`${cfg.url}/stream/${streamIdRef.current}/control`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
              body: JSON.stringify({ type: "parameters", params }),
            });
            if (resp.ok) return;
            if (resp.status === 404 && attempt < 4) {
              await new Promise((r) => setTimeout(r, 3000));
              continue;
            }
          } catch {
            if (attempt < 4) await new Promise((r) => setTimeout(r, 3000));
          }
        }
      };
      perfRef.current.play(controlFn, setPerfState);
      chat.getState().addMessage("Stream ready — performance playing!", "system");
    }
  }, [streamState?.status]);

  // Test hook for E2E
  useEffect(() => {
    if (!mounted) return;
    (window as unknown as Record<string, unknown>).__testInjectScenes = (scenes: Array<{ title: string; prompt: string; preset: string; duration: number }>) => {
      const indexed: Scene[] = scenes.map((s, i) => ({ ...s, index: i }));
      perfRef.current.setScenes(indexed);
      setPerfState(perfRef.current.getState());
    };
  }, [mounted]);

  // Create live output card
  useEffect(() => {
    if (!mounted) return;
    const existing = artifacts.getState().getByRefId("live-output");
    if (!existing) {
      artifacts.getState().add({
        type: "stream", title: "Live Output", refId: "live-output",
        x: 200, y: 50, w: 640, h: 400,
      });
    }
  }, [mounted]);

  // ─── Agent Handler ───
  const processingRef = useRef(false);
  const handleSend = useCallback(async (text: string) => {
    // Always show the user message
    chat.getState().addMessage(text, "user");

    // Guard against concurrent agent calls
    if (processingRef.current) {
      chat.getState().addMessage("Still processing previous request — please wait.", "system");
      return;
    }
    processingRef.current = true;

    const sdk = getSdkConfig();
    const say = (msg: string) => chat.getState().addMessage(msg, "system");

    const controlStreamFn = async (params: Record<string, unknown>) => {
      if (!streamIdRef.current) return;
      const cfg = getSdkConfig();
      // Retry on 404 — the SDK session's control channel may not be ready yet
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const resp = await fetch(`${cfg.url}/stream/${streamIdRef.current}/control`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
            body: JSON.stringify({ type: "parameters", params }),
          });
          if (resp.ok) return;
          if (resp.status === 404 && attempt < 4) {
            await new Promise((r) => setTimeout(r, 3000)); // wait 3s and retry
            continue;
          }
          console.log(`[control] Failed: ${resp.status}`);
          return;
        } catch {
          if (attempt < 4) await new Promise((r) => setTimeout(r, 3000));
        }
      }
    };

    const toolCtx: StageToolContext = {
      sdkUrl: sdk.url, apiKey: sdk.key,
      get streamId() { return streamIdRef.current; },
      setStreamId: (id) => {
        streamIdRef.current = id;
        setActiveStreamId(id);
      },
      controlStream: async (params) => {
        try { await controlStreamFn(params as Record<string, unknown>); }
        catch (e) { say(`Control failed: ${(e as Error).message}`); }
      },
      setScenes: (scenes) => {
        const indexed: Scene[] = scenes.map((s, i) => ({ ...s, index: i }));
        perfRef.current.setScenes(indexed);
        setPerfState(perfRef.current.getState());

        // Create a new scene set tab
        const firstScene = scenes[0];
        const name = (firstScene?.title || firstScene?.prompt || "")
          .replace(/^[^,]*,\s*/, "").split(/[,.]/).at(0)?.trim().slice(0, 25)
          || `Set ${sceneSetsRef.current.length + 1}`;
        const setId = `set-${Date.now()}`;
        sceneSetsRef.current.push({ id: setId, title: name, scenes: indexed, audioUrl: null });
        setActiveSetId(setId);
        syncSceneSets();
      },
      playPerformance: () => { perfRef.current.play(controlStreamFn, setPerfState); },
      stopPerformance: () => { perfRef.current.stop(); setPerfState(perfRef.current.getState()); },
      playWhenReady: () => { pendingPlayRef.current = true; },
      setAudioUrl, setBpm,
      getSceneCount: () => perfRef.current.scenes.length,
      saveSceneSet: () => {
        if (perfRef.current.scenes.length === 0) return;
        // Update existing set or create new one
        if (activeSetId) {
          const existing = sceneSetsRef.current.find((s) => s.id === activeSetId);
          if (existing) {
            existing.scenes = [...perfRef.current.scenes];
            existing.audioUrl = audioUrl;
          }
        }
        syncSceneSets();
      },
      setSceneVaceRef: (idx, url) => {
        if (perfRef.current.scenes[idx]) {
          perfRef.current.scenes[idx].vaceRef = url;
          setPerfState(perfRef.current.getState());
        }
      },
      addArtifact: (a) => {
        const isVideo = a.type === "video";
        artifacts.getState().add({
          type: a.type as "image" | "video" | "audio",
          title: a.title, url: a.url, refId: a.refId,
          x: a.x ?? 900, y: a.y ?? 50,
          w: isVideo ? 320 : 200,
          h: isVideo ? 200 : 130,
        });
      },
      say: (msg) => chat.getState().addMessage(msg, "system"),
    };

    const tools = new ToolRegistry();
    for (const tool of createStageTools(toolCtx)) {
      tools.register({
        name: tool.name, description: tool.description, parameters: tool.parameters, mcp_exposed: false,
        execute: async (args) => {
          const result = await tool.execute(args as Record<string, unknown>);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
      });
    }

    const { LivepeerProvider } = await import("../lib/livepeer-provider");
    const provider = new LivepeerProvider({ proxyUrl: "/api/llm/chat" });
    const working = new WorkingMemoryStore();
    working.setCriticalConstraints([STAGE_SYSTEM_PROMPT]);
    const runner = new AgentRunner(provider, tools, working, new SessionMemoryStore());

    chat.getState().setProcessing(true);
    try {
      for await (const event of runner.runStream({ user: text, maxIterations: 8 })) {
        switch (event.kind) {
          case "text": if (event.text) chat.getState().addMessage(event.text, "agent"); break;
          case "tool_call": say(`Calling ${event.name}…`); break;
          case "tool_result":
            if (!event.ok) {
              say(`${event.name} failed: ${event.content?.slice(0, 200) || ''}`);
            } else {
              try {
                const r = JSON.parse(event.content || '{}');
                if (r.error) say(`Error: ${r.error}`);
                else if (r.message) say(r.message);
                else if (r.stream_id) say(`Stream started: ${r.stream_id}`);
                else if (r.status) say(`${event.name}: ${r.status}`);
              } catch { /* not JSON */ }
            }
            break;
          case "usage": { const t = event.usage.input + event.usage.output; if (t > 0) say(`${t.toLocaleString()} tokens`); break; }
          case "error": say(`Error: ${event.error}`); break;
        }
      }
    } catch (e) {
      say(`Agent error: ${(e as Error).message}`);
    } finally {
      chat.getState().setProcessing(false);
      processingRef.current = false;
    }
  }, []);

  // ─── Import Handler ───
  const handleImportFile = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,audio/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const isVideo = file.type.startsWith("video");
      const isAudio = file.type.startsWith("audio");
      const type = isAudio ? "audio" : isVideo ? "video" : "image";
      const blobUrl = URL.createObjectURL(file);
      const title = file.name.replace(/\.[^.]+$/, "").slice(0, 30);
      const store = artifacts.getState();
      const refId = `${type}-${Date.now()}`;
      store.add({ type, title, refId, url: blobUrl, x: 50, y: 500 });

      if (isAudio) {
        setAudioUrl(blobUrl);
        detectBpm(file).then((result) => {
          setBpm(result.bpm);
          chat.getState().addMessage(`Audio loaded: ${title} — ${result.bpm} BPM (${Math.round(result.confidence * 100)}% confidence)`, "system");
        }).catch(() => {});
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const resp = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl: reader.result, fileName: file.name }),
          });
          if (resp.ok) {
            const { url: publicUrl } = await resp.json();
            if (publicUrl?.startsWith("https://")) {
              const a = store.getByRefId(refId);
              if (a) store.update(a.id, { url: publicUrl });
            }
          }
        } catch { /* keep blob url */ }
      };
      reader.readAsDataURL(file);
      chat.getState().addMessage(`Imported: ${refId} — drag near Live Output to use as reference`, "system");
    };
    input.click();
  }, []);

  // ─── VACE Proximity ───
  const vaceAppliedRef = useRef(new Set<string>());
  const handleCardDrop = useCallback((droppedId: string) => {
    const store = artifacts.getState();
    const dropped = store.artifacts.find((a) => a.id === droppedId);
    const live = store.getByRefId("live-output");
    if (!dropped || !live || dropped.refId === "live-output") return;
    if (dropped.type !== "image") return;
    // Skip key frame cards — they're managed by the performance engine via vaceRef
    if (dropped.refId.startsWith("kf-")) return;
    // Prevent repeated VACE applications for the same card
    if (vaceAppliedRef.current.has(dropped.refId)) return;

    const dx = Math.abs((dropped.x + dropped.w / 2) - (live.x + live.w / 2));
    const dy = Math.abs((dropped.y + dropped.h / 2) - (live.y + live.h / 2));
    if (dx < live.w && dy < live.h && dropped.url && streamIdRef.current) {
      const sdk = getSdkConfig();
      fetch(`${sdk.url}/stream/${streamIdRef.current}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(sdk.key ? { Authorization: `Bearer ${sdk.key}` } : {}) },
        body: JSON.stringify({ type: "parameters", params: { vace_enabled: true, vace_ref_images: [dropped.url], vace_context_scale: 0.8 } }),
      }).then(() => {
        vaceAppliedRef.current.add(dropped.refId);
        store.connect(dropped.refId, "live-output", { action: "vace-reference" });
        chat.getState().addMessage(`Reference applied: "${dropped.title}" → Live Output`, "system");
      }).catch((e) => {
        chat.getState().addMessage(`Reference failed: ${(e as Error).message}`, "system");
      });
    }
  }, []);

  // ─── Settings ───
  const [showSettings, setShowSettings] = useState(false);
  const [sdkUrl, setSdkUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (mounted) {
      const cfg = getSdkConfig();
      setSdkUrl(cfg.url);
      setApiKey(cfg.key);
      if (!cfg.key) setShowSettings(true);
    }
  }, [mounted]);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space" && perfState.scenes.length > 0) {
        e.preventDefault();
        if (perfState.isPlaying) {
          perfRef.current.stop();
          setPerfState(perfRef.current.getState());
        } else if (streamIdRef.current) {
          const cfg = getSdkConfig();
          const fn = async (params: Record<string, unknown>) => {
            await fetch(`${cfg.url}/stream/${streamIdRef.current}/control`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
              body: JSON.stringify({ type: "parameters", params }),
            });
          };
          perfRef.current.play(fn, setPerfState);
        }
      }
      if (e.code === "KeyR" && !e.metaKey && !e.ctrlKey && streamState?.status === "streaming") {
        e.preventDefault();
        if (recorderRef.current.isRecording) {
          recorderRef.current.stop();
          setTimeout(() => setRecState(recorderRef.current.getState()), 500);
        } else {
          const canvas = document.querySelector("canvas[data-scope-player]") as HTMLCanvasElement;
          if (canvas) recorderRef.current.start(canvas, undefined, setRecState);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mounted, perfState.scenes.length, perfState.isPlaying, streamState?.status]);

  const saveSettings = () => {
    localStorage.setItem("sdk_service_url", sdkUrl);
    localStorage.setItem("sdk_api_key", apiKey);
    setShowSettings(false);
  };

  if (!mounted) return null;

  const liveCard = arts.find((a) => a.refId === "live-output");
  const sdk = getSdkConfig();
  const isStreaming = streamState?.status === "streaming";

  return (
    <div style={S.root}>
      {/* ─── Canvas Area ─── */}
      <div style={S.canvasArea}>
        <InfiniteBoard
          viewport={viewport}
          onViewportChange={(v) => setViewport((prev) => ({ ...prev, ...v }))}
          gridSize={32}
          gridColor="rgba(255,255,255,0.06)"
        >
          {/* Live Output */}
          {liveCard && (
            <ArtifactCard
              artifact={liveCard}
              viewportScale={viewport.scale}
              onMove={(id, x, y) => artifacts.getState().update(id, { x, y })}
              onResize={(id, w, h) => artifacts.getState().update(id, { w, h })}
            >
              <ScopePlayer
                sdkUrl={sdk.url} apiKey={sdk.key}
                externalStreamId={activeStreamId ?? undefined}
                onStateChange={setStreamState} showFps={true}
              >
                {isStreaming && (
                  <div style={S.streamOverlay}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171", animation: "pulse-dot 1.5s ease-in-out infinite" }} />
                    <span>Live</span>
                  </div>
                )}
              </ScopePlayer>
            </ArtifactCard>
          )}

          {/* Reference cards */}
          {arts.filter((a) => a.refId !== "live-output").map((a) => (
            <ArtifactCard
              key={a.id} artifact={a} viewportScale={viewport.scale}
              onMove={(id, x, y) => { artifacts.getState().update(id, { x, y }); handleCardDrop(id); }}
              onResize={(id, w, h) => artifacts.getState().update(id, { w, h })}
            >
              <div style={S.cardContent}>
                {a.url && a.type === "image" && <img src={a.url} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                {a.url && a.type === "video" && (
                  <video
                    src={a.url}
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                )}
                {a.url && a.type === "audio" && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "rgba(129,140,248,0.05)" }}>
                    <audio src={a.url} controls autoPlay loop style={{ width: "90%" }} onPointerDown={(e) => e.stopPropagation()} />
                  </div>
                )}
                {!a.url && <span style={{ color: "#555570", fontSize: 12, fontWeight: 500 }}>{a.title}</span>}
              </div>
            </ArtifactCard>
          ))}
        </InfiniteBoard>

        {/* Zoom controls — bottom-left */}
        <div style={{
          position: "absolute", bottom: perfState.scenes.length > 0 ? 84 : 14, right: 372,
          zIndex: 50, display: "flex", gap: 4, alignItems: "center",
        }}>
          <button
            onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
              color: "#8888aa", borderRadius: 6, padding: "3px 8px", cursor: "pointer",
              fontSize: 10, fontWeight: 600, fontFamily: "inherit",
            }}
          >Fit</button>
          <button
            onClick={() => setViewport((v) => ({ ...v, scale: Math.max(0.1, v.scale * 0.8) }))}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
              color: "#8888aa", borderRadius: 6, padding: "3px 6px", cursor: "pointer", fontSize: 11,
            }}
          >−</button>
          <span style={{ fontSize: 10, color: "#555570", fontVariantNumeric: "tabular-nums", width: 36, textAlign: "center" }}>
            {Math.round(viewport.scale * 100)}%
          </span>
          <button
            onClick={() => setViewport((v) => ({ ...v, scale: Math.min(5, v.scale * 1.25) }))}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
              color: "#8888aa", borderRadius: 6, padding: "3px 6px", cursor: "pointer", fontSize: 11,
            }}
          >+</button>
        </div>

        {/* Hidden audio player */}
        <audio ref={audioRef} style={{ display: "none" }} />

        {/* Waveform */}
        <WaveformBar
          audioUrl={audioUrl} bpm={bpm}
          isPlaying={perfState.isPlaying} currentTime={perfState.elapsed}
          totalDuration={perfState.totalDuration}
          onSync={(detectedBpm) => {
            if (!streamIdRef.current) return;
            const s = getSdkConfig();
            fetch(`${s.url}/stream/${streamIdRef.current}/control`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(s.key ? { Authorization: `Bearer ${s.key}` } : {}) },
              body: JSON.stringify({ type: "parameters", params: { modulation: { noise_scale: { enabled: true, shape: "cosine", rate: "bar", depth: 0.3, bpm: detectedBpm } } } }),
            }).then(() => chat.getState().addMessage(`Beat sync: ${detectedBpm} BPM → noise_scale`, "system")).catch(() => {});
          }}
        />

        {/* Scene Timeline */}
        <SceneStrip
          state={perfState}
          onPlay={() => {
            if (!streamIdRef.current) { chat.getState().addMessage("Start a stream first, then play.", "system"); return; }
            const s = getSdkConfig();
            const fn = async (params: Record<string, unknown>) => {
              await fetch(`${s.url}/stream/${streamIdRef.current}/control`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(s.key ? { Authorization: `Bearer ${s.key}` } : {}) },
                body: JSON.stringify({ type: "parameters", params }),
              });
            };
            perfRef.current.play(fn, setPerfState);
          }}
          onStop={() => { perfRef.current.stop(); setPerfState(perfRef.current.getState()); }}
          onReorder={(from, to) => { perfRef.current.reorderScenes(from, to); setPerfState(perfRef.current.getState()); }}
          onRemove={(idx) => { perfRef.current.removeScene(idx); setPerfState(perfRef.current.getState()); }}
          onEditScene={(idx, updates) => { perfRef.current.editScene(idx, updates); setPerfState(perfRef.current.getState()); }}
          onAddScene={(scene) => { perfRef.current.addScene(scene); setPerfState(perfRef.current.getState()); }}
          savedStreams={sceneSets.map((s) => ({ title: s.title, sceneCount: s.sceneCount, streamId: s.id }))}
          activeStreamId={activeSetId}
          onSwitchStream={(idx) => {
            const target = sceneSetsRef.current[idx];
            if (!target || target.id === activeSetId) return;

            // Save current scenes back
            if (activeSetId) {
              const cur = sceneSetsRef.current.find((s) => s.id === activeSetId);
              if (cur) { cur.scenes = [...perfRef.current.scenes]; cur.audioUrl = audioUrl; }
            }

            // Switch to target scene set (same stream, different scenes)
            perfRef.current.stop();
            perfRef.current.setScenes(target.scenes);
            setPerfState(perfRef.current.getState());
            setActiveSetId(target.id);
            syncSceneSets();

            // Restore audio
            if (target.audioUrl) { setAudioUrl(target.audioUrl); }
            else { setAudioUrl(null); }

            // Auto-play if stream is running
            if (streamIdRef.current) {
              const sdk = getSdkConfig();
              const fn = async (params: Record<string, unknown>) => {
                for (let a = 0; a < 5; a++) {
                  try {
                    const r = await fetch(`${sdk.url}/stream/${streamIdRef.current}/control`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...(sdk.key ? { Authorization: `Bearer ${sdk.key}` } : {}) },
                      body: JSON.stringify({ type: "parameters", params }),
                    });
                    if (r.ok) return;
                    if (r.status === 404) { await new Promise((r) => setTimeout(r, 3000)); continue; }
                  } catch { await new Promise((r) => setTimeout(r, 3000)); }
                }
              };
              perfRef.current.play(fn, setPerfState);
            }

            chat.getState().addMessage(`Switched to: "${target.title}"`, "system");
          }}
        />

        {/* Record */}
        <RecordBar
          state={recState} isStreaming={isStreaming}
          onRecord={() => {
            const canvas = document.querySelector("canvas[data-scope-player]") as HTMLCanvasElement;
            if (!canvas) { chat.getState().addMessage("No active stream to record.", "system"); return; }
            recorderRef.current.start(canvas, undefined, setRecState);
            chat.getState().addMessage("Recording started…", "system");
          }}
          onStop={() => {
            recorderRef.current.stop();
            setRecState(recorderRef.current.getState());
            setTimeout(() => {
              setRecState(recorderRef.current.getState());
              if (recorderRef.current.blobUrl) chat.getState().addMessage("Recording saved. Click Download to export.", "system");
            }, 500);
          }}
          onDownload={() => recorderRef.current.download()}
        />

        {/* Top-right actions */}
        <div style={S.topBar}>
          <button onClick={handleImportFile} className="btn" style={{ fontSize: 12 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Import
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className={apiKey ? "btn" : "btn btn-danger"}
            style={{ fontSize: 12 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            {apiKey ? "" : "Setup"}
          </button>
        </div>

        {/* Keyboard hint */}
        {(perfState.scenes.length > 0 || isStreaming) && (
          <div style={{
            position: "absolute", bottom: perfState.scenes.length > 0 ? 84 : 14, left: 14, zIndex: 50,
            display: "flex", gap: 6, opacity: 0.3, fontSize: 10, color: "#8888aa",
          }}>
            {perfState.scenes.length > 0 && <span style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.4)" }}>Space — Play/Stop</span>}
            {isStreaming && <span style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.4)" }}>R — Record</span>}
          </div>
        )}
      </div>

      {/* ─── Chat Sidebar ─── */}
      <div style={S.chatSidebar}>
        <div style={S.chatHeader}>
          <span style={S.chatTitle}>Creative Stage</span>
          {isStreaming && (
            <div style={S.liveIndicator}>
              <span style={S.liveDot} />
              <span>Streaming</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ChatPanel messages={messages} onSend={handleSend} placeholder="Describe a scene to stream live…" />
        </div>
      </div>

      {/* ─── Settings Dialog ─── */}
      {showSettings && (
        <div style={S.overlay} onClick={() => setShowSettings(false)}>
          <div style={S.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.dialogTitle}>Settings</h3>
            <p style={S.dialogSubtitle}>Connect to Livepeer SDK for live AI streaming</p>

            <label style={S.label}>SDK Service URL</label>
            <input value={sdkUrl} onChange={(e) => setSdkUrl(e.target.value)} className="input" style={{ marginBottom: 14 }} />

            <label style={S.label}>Daydream API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk_..." className="input" style={{ marginBottom: 20 }} />

            <button onClick={saveSettings} className="btn btn-accent" style={{ width: "100%", justifyContent: "center", padding: "11px 0", fontSize: 14 }}>
              Save & Connect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
