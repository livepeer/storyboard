"use client";

import { useCallback, useEffect, useState } from "react";
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
        <div
          className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-[420px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-lg)]">
            <h2 className="mb-1 text-base font-semibold text-[var(--text)]">
              Connect to Daydream
            </h2>
            <p className="mb-6 text-xs text-[var(--text-muted)]">
              The SDK Service handles inference, AI enrichment, live
              video-to-video, and orchestrator discovery.
            </p>

            {/* Agent marketplace */}
            <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Agent
            </label>
            <div className="mb-4 flex flex-col gap-2">
              {(plugins.length > 0
                ? plugins
                : [{ id: "built-in", name: "Built-in Agent", description: "Local DAG executor" }]
              ).map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAgentChange(p.id)}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    activeAgent === p.id
                      ? "border-white/20 bg-white/[0.06]"
                      : "border-[var(--border)] bg-transparent hover:border-[var(--border-hover)] hover:bg-white/[0.03]"
                  }`}
                >
                  <span
                    className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      activeAgent === p.id ? "bg-emerald-400" : "bg-[var(--text-dim)]"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[var(--text)]">
                      {p.name}
                    </div>
                    {"description" in p && (
                      <div className="mt-0.5 text-[10px] text-[var(--text-dim)] line-clamp-2">
                        {p.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

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
        </div>
      )}
    </>
  );
}

function UsageStats() {
  const budget = checkBudget();
  const compaction = getCompactionStats();

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
