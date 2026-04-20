"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { loadConfig, saveConfig, checkHealth } from "@/lib/sdk/client";
import { useChatStore } from "@/lib/chat/store";
import {
  getActivePluginId,
  getPluginList,
  setActivePlugin,
} from "@/lib/agents/registry";
import { checkBudget } from "@/lib/agents/claude/budget";
import { getCompactionStats } from "@/lib/agents/claude/compaction";
import { McpPanel } from "./McpPanel";

const AGENT_STORAGE_KEY = "storyboard_active_agent";

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [orchUrl, setOrchUrl] = useState("");
  const [activeAgent, setActiveAgent] = useState("built-in");
  const [status, setStatus] = useState<"idle" | "connecting" | "ok" | "error">(
    "idle"
  );
  const addMessage = useChatStore((s) => s.addMessage);

  // Load saved config on mount
  useEffect(() => {
    const cfg = loadConfig();
    setUrl(cfg.serviceUrl);
    setApiKey(cfg.apiKey);
    setOrchUrl(cfg.orchUrl);

    // Restore saved agent selection
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(AGENT_STORAGE_KEY);
      if (saved) {
        setActiveAgent(saved);
        try {
          setActivePlugin(saved);
        } catch {
          // Plugin not registered yet, will be set on page load
        }
      }
    }
  }, []);

  const handleAgentChange = useCallback(
    (agentId: string) => {
      setActiveAgent(agentId);
      if (typeof window !== "undefined") {
        localStorage.setItem(AGENT_STORAGE_KEY, agentId);
      }
      try {
        setActivePlugin(agentId);
        addMessage(`Agent switched to: ${agentId}`, "system");
      } catch (e) {
        addMessage(
          `Cannot switch agent: ${e instanceof Error ? e.message : "Unknown"}`,
          "system"
        );
      }
    },
    [addMessage]
  );

  const handleConnect = useCallback(async () => {
    const trimmedUrl = url.trim().replace(/\/+$/, "");
    setStatus("connecting");
    saveConfig({
      serviceUrl: trimmedUrl,
      apiKey: apiKey.trim(),
      orchUrl: orchUrl.trim().replace(/\/+$/, ""),
    });
    try {
      await checkHealth();
      setStatus("ok");
      addMessage(`SDK Service: ${trimmedUrl}`, "system");
      setTimeout(() => setOpen(false), 600);
    } catch (e) {
      setStatus("error");
      addMessage(
        `Connection failed: ${e instanceof Error ? e.message : "Unknown error"}`,
        "system"
      );
    }
  }, [url, apiKey, orchUrl, addMessage]);

  const plugins = typeof window !== "undefined" ? getPluginList() : [];

  // Draggable dialog
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Center on first open
  useEffect(() => {
    if (open && !initialized) {
      setPos({ x: Math.max(0, (window.innerWidth - 420) / 2), y: Math.max(20, (window.innerHeight - 500) / 2) });
      setInitialized(true);
    }
  }, [open, initialized]);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const onDragEnd = useCallback(() => { dragRef.current = null; }, []);

  return (
    <>
      {/* Gear button in top bar */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent text-sm text-[var(--text-muted)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        title="Settings"
      >
        &#9881;
      </button>

      {/* Overlay */}
      {open && (
        <>
        {/* Backdrop */}
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.5)" }}
          onClick={() => setOpen(false)}
        />
        {/* Draggable dialog */}
        <div style={{
          position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
          width: 420, background: "#1a1a1e",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
          padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}>
          {/* Drag handle (title bar) */}
          <div
            style={{ cursor: "grab", userSelect: "none", marginBottom: 12 }}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 className="text-base font-semibold text-[var(--text)]">
                Settings
              </h2>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <p className="text-xs text-[var(--text-muted)]" style={{ margin: 0 }}>
              Drag title bar to move
            </p>
          </div>

            {/* Agent selector */}
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Agent
            </label>
            <select
              value={activeAgent}
              onChange={(e) => handleAgentChange(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none"
            >
              {(plugins.length > 0
                ? plugins
                : [{ id: "built-in", name: "Built-in Agent" }]
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              SDK Service URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://sdk.daydream.monster"
              className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
            />

            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Daydream API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_..."
              className="mb-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
            />
            <p className="mb-4 text-[10px] text-[var(--text-dim)]">
              Get your API key at{" "}
              <a
                href="https://docs.daydream.live/api/api-reference"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-muted)] underline"
              >
                docs.daydream.live
              </a>
            </p>

            {/* MCP Connected Tools */}
            <div className="mb-6">
              <McpPanel />
            </div>

            <details className="mb-6">
              <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">
                Advanced: Direct Orchestrator URL
              </summary>
              <input
                type="url"
                value={orchUrl}
                onChange={(e) => setOrchUrl(e.target.value)}
                placeholder="https://... (leave empty to use SDK Service)"
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
              />
            </details>

            {/* Usage stats */}
            <details className="mb-6">
              <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">
                Usage
              </summary>
              <UsageStats />
            </details>

            <button
              onClick={handleConnect}
              disabled={status === "connecting"}
              className="w-full rounded-lg bg-white py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "connecting"
                ? "Connecting..."
                : status === "ok"
                  ? "Connected"
                  : status === "error"
                    ? "Retry"
                    : "Connect"}
            </button>
        </div>
        </>
      )}
    </>
  );
}

function UsageStats() {
  // Re-render every 3s to pick up token usage changes
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(interval);
  }, []);

  const budget = checkBudget();
  const compaction = getCompactionStats();

  // Artifact counts from canvas + project stores
  const { useCanvasStore } = require("@/lib/canvas/store");
  const { useProjectStore } = require("@/lib/projects/store");
  const cards = useCanvasStore.getState().cards;
  const projects = useProjectStore.getState().projects;
  const imageCount = cards.filter((c: { type: string }) => c.type === "image").length;
  const videoCount = cards.filter((c: { type: string }) => c.type === "video").length;
  const audioCount = cards.filter((c: { type: string }) => c.type === "audio").length;

  return (
    <div className="mt-2 space-y-2 text-[10px] text-[var(--text-dim)]">
      <div className="flex items-center justify-between">
        <span>Tokens used today</span>
        <span className={budget.warning ? "text-yellow-400" : ""}>
          {budget.used.toLocaleString()} / {budget.limit.toLocaleString()} ({budget.pct}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all ${
            budget.warning ? "bg-yellow-400" : "bg-emerald-400"
          }`}
          style={{ width: `${Math.min(budget.pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span>Artifacts on canvas</span>
        <span>
          {cards.length} total ({imageCount} img, {videoCount} vid, {audioCount} aud)
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span>Projects</span>
        <span>{projects.length}</span>
      </div>
      {compaction.estimated_tokens_saved > 0 && (
        <div className="flex items-center justify-between">
          <span>Tokens saved via compaction</span>
          <span className="text-emerald-400">
            ~{compaction.estimated_tokens_saved.toLocaleString()}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span>Compaction runs</span>
        <span>{compaction.compaction_count}</span>
      </div>
    </div>
  );
}
