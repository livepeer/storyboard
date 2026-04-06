"use client";

import { useCallback, useEffect, useState } from "react";
import { loadConfig, saveConfig, checkHealth } from "@/lib/sdk/client";
import { useChatStore } from "@/lib/chat/store";
import {
  getActivePluginId,
  getPluginList,
  setActivePlugin,
} from "@/lib/agents/registry";

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
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
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

            {/* Agent selector */}
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Agent
            </label>
            <select
              value={activeAgent}
              onChange={(e) => handleAgentChange(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none transition-colors focus:border-[var(--border-hover)]"
            >
              {plugins.length > 0 ? (
                plugins.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              ) : (
                <option value="built-in">Built-in Agent</option>
              )}
              <option value="claude" disabled>
                Claude (coming soon)
              </option>
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
