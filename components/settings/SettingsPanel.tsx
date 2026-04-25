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

  // Dynamic agent config fields — load/save from localStorage
  const [agentConfig, setAgentConfig] = useState<Record<string, string>>({});
  const activePlugin = plugins.find((p) => p.id === activeAgent);

  // Load agent config when agent changes
  useEffect(() => {
    if (!activePlugin?.configFields?.length) return;
    const loaded: Record<string, string> = {};
    for (const field of activePlugin.configFields) {
      loaded[field.key] = localStorage.getItem(`storyboard_${field.key}`) || "";
    }
    setAgentConfig(loaded);
  }, [activeAgent, activePlugin]);

  const handleAgentConfigChange = useCallback((key: string, value: string) => {
    setAgentConfig((prev) => ({ ...prev, [key]: value }));
    localStorage.setItem(`storyboard_${key}`, value);
  }, []);

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

            {/* Dynamic agent config fields */}
            {activePlugin?.configFields?.map((field) => (
              <div key={field.key} className="mb-3">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={agentConfig[field.key] || ""}
                  onChange={(e) => handleAgentConfigChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
                />
              </div>
            ))}

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
                href="https://app.daydream.live/sign-in?returnUrl=/explore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-muted)] underline"
              >
                app.daydream.live
              </a>
            </p>

            {/* Chat Bots */}
            <TelegramSection />
            <DiscordSection />

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
  // Re-render on every chat message (token usage updates after each agent turn)
  const messageCount = useChatStore((s) => s.messages.length);
  // Also poll every 5s as a fallback for non-chat token changes
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
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

/** Telegram Bot settings — configure, test, enable/disable. */
function TelegramSection() {
  const [token, setToken] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("telegram_bot_token") || "" : ""
  );
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error" | "registered">("idle");
  const [botName, setBotName] = useState("");
  const [enabled, setEnabled] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("telegram_bot_enabled") === "1" : false
  );

  const handleTest = useCallback(async () => {
    if (!token.trim()) return;
    setStatus("testing");
    try {
      const resp = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", token: token.trim() }),
      });
      const data = await resp.json();
      if (data.ok && data.result) {
        setBotName(`@${data.result.username}`);
        setStatus("ok");
        localStorage.setItem("telegram_bot_token", token.trim());
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [token]);

  const handleToggle = useCallback(async () => {
    if (!token.trim()) return;
    const newEnabled = !enabled;
    try {
      if (newEnabled) {
        // Register webhook
        const host = window.location.origin;
        const resp = await fetch("/api/telegram/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "register",
            token: token.trim(),
            webhookUrl: `${host}/api/telegram`,
          }),
        });
        const data = await resp.json();
        if (data.ok) {
          setEnabled(true);
          setStatus("registered");
          localStorage.setItem("telegram_bot_enabled", "1");
          localStorage.setItem("telegram_bot_token", token.trim());
        } else {
          setStatus("error");
        }
      } else {
        // Unregister webhook
        await fetch("/api/telegram/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unregister", token: token.trim() }),
        });
        setEnabled(false);
        setStatus("idle");
        localStorage.setItem("telegram_bot_enabled", "0");
      }
    } catch {
      setStatus("error");
    }
  }, [token, enabled]);

  return (
    <details className="mb-6">
      <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">
        Telegram Bot
        {enabled && <span className="ml-2 text-green-400 text-[9px]">Active</span>}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[10px] text-[var(--text-dim)]">
          Connect a Telegram bot to generate images via chat. Get a bot token from{" "}
          <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline text-[var(--text-muted)]">@BotFather</a>.
        </p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Bot token from @BotFather"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={!token.trim()}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-white/20 disabled:opacity-40"
          >
            Test
          </button>
          <button
            onClick={handleToggle}
            disabled={!token.trim()}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
              enabled
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
            }`}
          >
            {enabled ? "Disable" : "Enable"}
          </button>
          {status === "ok" && <span className="text-[10px] text-green-400">{botName}</span>}
          {status === "registered" && <span className="text-[10px] text-green-400">Webhook registered</span>}
          {status === "testing" && <span className="text-[10px] text-[var(--text-dim)]">Testing...</span>}
          {status === "error" && <span className="text-[10px] text-red-400">Failed — check token</span>}
        </div>
      </div>
    </details>
  );
}

/** Discord Bot settings. */
function DiscordSection() {
  const [appId, setAppId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("discord_app_id") || "" : ""
  );
  const [token, setToken] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("discord_bot_token") || "" : ""
  );
  const [status, setStatus] = useState<"idle" | "registering" | "ok" | "error">("idle");

  const handleRegister = useCallback(async () => {
    if (!appId.trim() || !token.trim()) return;
    setStatus("registering");
    try {
      localStorage.setItem("discord_app_id", appId.trim());
      localStorage.setItem("discord_bot_token", token.trim());
      const resp = await fetch("/api/discord/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: appId.trim(), token: token.trim() }),
      });
      const data = await resp.json();
      setStatus(data.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    }
  }, [appId, token]);

  return (
    <details className="mb-6">
      <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">
        Discord Bot
        {status === "ok" && <span className="ml-2 text-green-400 text-[9px]">Commands registered</span>}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[10px] text-[var(--text-dim)]">
          Create a Discord app at{" "}
          <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="underline text-[var(--text-muted)]">discord.com/developers</a>.
          Set Interactions Endpoint URL to: <code className="text-[9px]">{typeof window !== "undefined" ? window.location.origin : ""}/api/discord</code>
        </p>
        <input
          type="text"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="Application ID"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
        />
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Bot Token"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleRegister}
            disabled={!appId.trim() || !token.trim()}
            className="rounded-lg bg-[#5865F2]/20 px-3 py-1.5 text-[11px] font-semibold text-[#5865F2] hover:bg-[#5865F2]/30 disabled:opacity-40"
          >
            Register Commands
          </button>
          {status === "ok" && <span className="text-[10px] text-green-400">Slash commands registered</span>}
          {status === "registering" && <span className="text-[10px] text-[var(--text-dim)]">Registering...</span>}
          {status === "error" && <span className="text-[10px] text-red-400">Failed — check credentials</span>}
        </div>
      </div>
    </details>
  );
}
