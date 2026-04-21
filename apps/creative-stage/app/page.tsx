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
import { ScopePlayer, type ScopeParams, type ScopeStreamState } from "@livepeer/scope-player";
import { AgentRunner, ToolRegistry, WorkingMemoryStore, SessionMemoryStore } from "@livepeer/agent";
import { createStageTools, type StageToolContext } from "../lib/stage-tools";
import { PerformanceEngine, type PerformanceState, type Scene } from "../lib/performance";
import { SceneStrip } from "../components/SceneStrip";
import { WaveformBar } from "../components/WaveformBar";
import { detectBpm } from "../lib/bpm-detect";

// Stores
const artifacts = createArtifactStore();
const chat = createChatStore();

// SDK config from localStorage
function getSdkConfig() {
  if (typeof window === "undefined") return { url: "https://sdk.daydream.monster", key: "" };
  return {
    url: localStorage.getItem("sdk_service_url") || "https://sdk.daydream.monster",
    key: localStorage.getItem("sdk_api_key") || "",
  };
}

export default function Stage() {
  const [mounted, setMounted] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [arts, setArts] = useState<Artifact[]>([]);
  const [streamState, setStreamState] = useState<ScopeStreamState | null>(null);
  const [streamParams, setStreamParams] = useState<ScopeParams | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const controlRef = useRef<((params: Partial<ScopeParams>) => Promise<void>) | null>(null);

  const [messages, setMessages] = useState(chat.getState().messages);
  const perfRef = useRef(new PerformanceEngine());
  const [perfState, setPerfState] = useState<PerformanceState>({ scenes: [], currentScene: 0, isPlaying: false, elapsed: 0, totalDuration: 0 });
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const unsubArt = artifacts.subscribe((s) => setArts([...s.artifacts]));
    const unsubChat = chat.subscribe((s) => setMessages([...s.messages]));
    return () => { unsubArt(); unsubChat(); };
  }, []);

  // Create the live output card (center of canvas)
  useEffect(() => {
    if (!mounted) return;
    const existing = artifacts.getState().getByRefId("live-output");
    if (!existing) {
      artifacts.getState().add({
        type: "stream",
        title: "Live Output",
        refId: "live-output",
        x: 200,
        y: 50,
        w: 640,
        h: 400,
      });
    }
  }, [mounted]);

  // Agent setup
  const handleSend = useCallback(async (text: string) => {
    chat.getState().addMessage(text, "user");

    const sdk = getSdkConfig();
    const say = (msg: string) => chat.getState().addMessage(msg, "system");

    // Build agent with stage tools
    const controlStreamFn = async (params: Record<string, unknown>) => {
      if (!streamIdRef.current) return;
      const cfg = getSdkConfig();
      await fetch(`${cfg.url}/stream/${streamIdRef.current}/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
        },
        body: JSON.stringify({ type: "parameters", params }),
      });
    };

    const toolCtx: StageToolContext = {
      sdkUrl: sdk.url,
      apiKey: sdk.key,
      streamId: streamIdRef.current,
      setStreamId: (id) => {
        streamIdRef.current = id;
        if (id) {
          setStreamParams({
            prompts: text,
          });
        }
      },
      controlStream: async (params) => {
        try {
          await controlStreamFn(params as Record<string, unknown>);
        } catch (e) {
          say(`Control failed: ${(e as Error).message}`);
        }
      },
      setScenes: (scenes) => {
        const indexed: Scene[] = scenes.map((s, i) => ({ ...s, index: i }));
        perfRef.current.setScenes(indexed);
        setPerfState(perfRef.current.getState());
      },
      playPerformance: () => {
        perfRef.current.play(controlStreamFn, setPerfState);
      },
      stopPerformance: () => {
        perfRef.current.stop();
        setPerfState(perfRef.current.getState());
      },
      setAudioUrl,
      setBpm,
    };

    const tools = new ToolRegistry();
    for (const tool of createStageTools(toolCtx)) {
      tools.register({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        mcp_exposed: false,
        execute: async (args) => {
          const result = await tool.execute(args as Record<string, unknown>);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
      });
    }

    // Use LivepeerProvider via /api/llm/chat proxy
    // For now, use a simple fetch-based provider
    const { LivepeerProvider } = await import("../lib/livepeer-provider");
    const provider = new LivepeerProvider({ proxyUrl: "/api/llm/chat" });

    const runner = new AgentRunner(
      provider,
      tools,
      new WorkingMemoryStore(),
      new SessionMemoryStore(),
    );

    chat.getState().setProcessing(true);

    try {
      for await (const event of runner.runStream({ user: text, maxIterations: 5 })) {
        switch (event.kind) {
          case "text":
            if (event.text) {
              chat.getState().addMessage(event.text, "agent");
            }
            break;
          case "tool_call":
            say(`Calling ${event.name}…`);
            break;
          case "tool_result":
            if (!event.ok) say(`${event.name} failed`);
            break;
          case "usage": {
            const t = event.usage.input + event.usage.output;
            if (t > 0) say(`${t.toLocaleString()} tokens`);
            break;
          }
          case "error":
            say(`Error: ${event.error}`);
            break;
        }
      }
    } catch (e) {
      say(`Agent error: ${(e as Error).message}`);
    } finally {
      chat.getState().setProcessing(false);
    }
  }, []);

  // Import media — file picker
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

      // Auto-detect BPM for audio files
      if (isAudio) {
        setAudioUrl(blobUrl);
        detectBpm(file).then((result) => {
          setBpm(result.bpm);
          chat.getState().addMessage(`Audio loaded: ${title} — ${result.bpm} BPM (${Math.round(result.confidence * 100)}% confidence)`, "system");
        }).catch(() => {});
      }

      // Upload to GCS for public URL
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

  // Drag-drop near LiveOutput → apply as VACE reference
  const handleCardDrop = useCallback((droppedId: string) => {
    const store = artifacts.getState();
    const dropped = store.artifacts.find((a) => a.id === droppedId);
    const live = store.getByRefId("live-output");
    if (!dropped || !live || dropped.refId === "live-output") return;
    if (dropped.type !== "image") return; // only images for VACE

    // Check if dropped card is near the LiveOutput
    const dx = Math.abs((dropped.x + dropped.w / 2) - (live.x + live.w / 2));
    const dy = Math.abs((dropped.y + dropped.h / 2) - (live.y + live.h / 2));
    const isNear = dx < live.w && dy < live.h;

    if (isNear && dropped.url && streamIdRef.current) {
      const sdk = getSdkConfig();
      // Apply as VACE reference
      fetch(`${sdk.url}/stream/${streamIdRef.current}/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sdk.key ? { Authorization: `Bearer ${sdk.key}` } : {}),
        },
        body: JSON.stringify({
          type: "parameters",
          params: { vace_enabled: true, vace_ref_images: [dropped.url], vace_context_scale: 0.8 },
        }),
      }).then(() => {
        // Connect edge
        store.connect(dropped.refId, "live-output", { action: "vace-reference" });
        chat.getState().addMessage(`Reference applied: "${dropped.title}" → Live Output`, "system");
      }).catch((e) => {
        chat.getState().addMessage(`Reference failed: ${(e as Error).message}`, "system");
      });
    }
  }, []);

  // Settings dialog
  const [showSettings, setShowSettings] = useState(false);
  const [sdkUrl, setSdkUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (mounted) {
      const cfg = getSdkConfig();
      setSdkUrl(cfg.url);
      setApiKey(cfg.key);
      if (!cfg.key) setShowSettings(true); // auto-show if no key
    }
  }, [mounted]);

  const saveSettings = () => {
    localStorage.setItem("sdk_service_url", sdkUrl);
    localStorage.setItem("sdk_api_key", apiKey);
    setShowSettings(false);
  };

  if (!mounted) return null;

  const liveCard = arts.find((a) => a.refId === "live-output");
  const sdk = getSdkConfig();

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Canvas (left, 75%) */}
      <div style={{ flex: 1, position: "relative" }}>
        <InfiniteBoard
          viewport={viewport}
          onViewportChange={(v) => setViewport((prev) => ({ ...prev, ...v }))}
          gridColor="rgba(255,255,255,0.02)"
        >
          {/* Live Output — ScopePlayer as a canvas card */}
          {liveCard && (
            <ArtifactCard
              artifact={liveCard}
              viewportScale={viewport.scale}
              onMove={(id, x, y) => artifacts.getState().update(id, { x, y })}
              onResize={(id, w, h) => artifacts.getState().update(id, { w, h })}
            >
              <ScopePlayer
                sdkUrl={sdk.url}
                apiKey={sdk.key}
                initialParams={streamParams ?? undefined}
                onStateChange={setStreamState}
                showFps={true}
              >
                {/* Stream info overlay */}
                {streamState?.status === "streaming" && (
                  <div style={{
                    position: "absolute", bottom: 8, left: 10,
                    fontSize: 11, color: "rgba(255,255,255,0.5)",
                    background: "rgba(0,0,0,0.4)", padding: "3px 8px", borderRadius: 4,
                  }}>
                    🔴 Live
                  </div>
                )}
              </ScopePlayer>
            </ArtifactCard>
          )}

          {/* Other artifact cards (reference images, recordings, etc.) */}
          {arts.filter((a) => a.refId !== "live-output").map((a) => (
            <ArtifactCard
              key={a.id}
              artifact={a}
              viewportScale={viewport.scale}
              onMove={(id, x, y) => {
                artifacts.getState().update(id, { x, y });
                // Check proximity to LiveOutput on every move — apply VACE when near
                handleCardDrop(id);
              }}
              onResize={(id, w, h) => artifacts.getState().update(id, { w, h })}
            >
              <div style={{ width: "100%", height: "100%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, overflow: "hidden" }}>
                {a.url && a.type === "image" && <img src={a.url} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                {a.url && a.type === "video" && <video src={a.url} controls muted style={{ width: "100%", height: "100%" }} />}
                {!a.url && <span style={{ color: "#555", fontSize: 12 }}>{a.title}</span>}
              </div>
            </ArtifactCard>
          ))}
        </InfiniteBoard>

        {/* Waveform Bar (above scene strip when audio loaded) */}
        <WaveformBar
          audioUrl={audioUrl}
          bpm={bpm}
          isPlaying={perfState.isPlaying}
          currentTime={perfState.elapsed}
          totalDuration={perfState.totalDuration}
          onSync={(detectedBpm) => {
            if (!streamIdRef.current) return;
            const sdk = getSdkConfig();
            fetch(`${sdk.url}/stream/${streamIdRef.current}/control`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(sdk.key ? { Authorization: `Bearer ${sdk.key}` } : {}),
              },
              body: JSON.stringify({
                type: "parameters",
                params: {
                  modulation: {
                    noise_scale: {
                      enabled: true, shape: "cosine", rate: "bar",
                      depth: 0.3, bpm: detectedBpm,
                    },
                  },
                },
              }),
            }).then(() => {
              chat.getState().addMessage(`Beat sync enabled: ${detectedBpm} BPM → noise_scale modulation`, "system");
            }).catch(() => {});
          }}
        />

        {/* Scene Timeline Strip (bottom of canvas) */}
        <SceneStrip
          state={perfState}
          onPlay={() => {
            if (!streamIdRef.current) {
              chat.getState().addMessage("Start a stream first, then play the performance.", "system");
              return;
            }
            const sdk = getSdkConfig();
            const controlFn = async (params: Record<string, unknown>) => {
              await fetch(`${sdk.url}/stream/${streamIdRef.current}/control`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(sdk.key ? { Authorization: `Bearer ${sdk.key}` } : {}),
                },
                body: JSON.stringify({ type: "parameters", params }),
              });
            };
            perfRef.current.play(controlFn, setPerfState);
          }}
          onStop={() => {
            perfRef.current.stop();
            setPerfState(perfRef.current.getState());
          }}
          onReorder={(from, to) => {
            perfRef.current.reorderScenes(from, to);
            setPerfState(perfRef.current.getState());
          }}
          onRemove={(idx) => {
            perfRef.current.scenes.splice(idx, 1);
            perfRef.current.scenes.forEach((s, i) => { s.index = i; });
            setPerfState(perfRef.current.getState());
          }}
          onEditScene={(idx, updates) => {
            Object.assign(perfRef.current.scenes[idx], updates);
            setPerfState(perfRef.current.getState());
          }}
        />

        {/* Import + Settings buttons */}
        <button
          onClick={handleImportFile}
          style={{
            position: "absolute", top: 12, right: 80, zIndex: 100,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#aaa", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13,
          }}
        >
          + Import
        </button>
        <button
          onClick={() => setShowSettings(true)}
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 100,
            background: apiKey ? "rgba(255,255,255,0.06)" : "rgba(233,69,96,0.2)",
            border: apiKey ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(233,69,96,0.4)",
            color: apiKey ? "#aaa" : "#e94560",
            borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13,
          }}
        >
          ⚙️ {apiKey ? "" : "Setup"}
        </button>
      </div>

      {/* Chat (right, 340px) */}
      <div style={{ width: 340, borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 14, fontWeight: 700 }}>
          Creative Stage
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            placeholder="Describe a scene to stream live…"
          />
        </div>
      </div>

      {/* Settings dialog */}
      {showSettings && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowSettings(false)}
        >
          <div
            style={{ width: 380, background: "#1a1a1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Settings</h3>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>SDK URL</label>
            <input value={sdkUrl} onChange={(e) => setSdkUrl(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#eee", fontSize: 13, marginBottom: 12, boxSizing: "border-box" }} />
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Daydream API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk_..." style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#eee", fontSize: 13, marginBottom: 16, boxSizing: "border-box" }} />
            <button onClick={saveSettings} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
