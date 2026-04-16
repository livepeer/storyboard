"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getMcpServers,
  addMcpServer,
  removeMcpServer,
  connectServer,
  disconnectServer,
} from "@/lib/mcp/store";
import { MCP_PRESETS } from "@/lib/mcp/types";
import type { McpServerConfig } from "@/lib/mcp/types";

export function McpPanel() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customToken, setCustomToken] = useState("");

  useEffect(() => {
    setServers(getMcpServers());
  }, []);

  const refresh = useCallback(() => setServers(getMcpServers()), []);

  const handleAddPreset = useCallback(
    (presetId: string) => {
      const preset = MCP_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      // Check if already added
      if (servers.some((s) => s.url === preset.url)) return;
      addMcpServer({
        name: preset.name,
        url: preset.url,
        authType: preset.authType,
      });
      refresh();
    },
    [servers, refresh]
  );

  const handleAddCustom = useCallback(() => {
    if (!customName.trim() || !customUrl.trim()) return;
    const server = addMcpServer({
      name: customName.trim(),
      url: customUrl.trim(),
      authType: customToken ? "bearer" : "none",
      token: customToken || undefined,
    });
    if (customToken) {
      connectServer(server.id, customToken);
    }
    setCustomName("");
    setCustomUrl("");
    setCustomToken("");
    setShowAdd(false);
    refresh();
  }, [customName, customUrl, customToken, refresh]);

  const handleConnect = useCallback(
    async (id: string) => {
      const server = servers.find((s) => s.id === id);
      if (!server) return;

      // OAuth servers (Anthropic remote MCP) — launch popup flow
      if (server.authType === "oauth") {
        try {
          // 1. Start OAuth flow via server-side route
          const resp = await fetch("/api/mcp/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "start",
              serverBaseUrl: server.url,
            }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: "unknown" }));
            window.alert(`OAuth setup failed: ${(err as Record<string, string>).error}`);
            return;
          }
          const { authUrl } = (await resp.json()) as { authUrl: string };

          // 2. Open popup for user authorization
          const popup = window.open(authUrl, "mcp-oauth", "width=600,height=700");
          if (!popup) {
            window.alert("Popup blocked — allow popups for this site and try again.");
            return;
          }

          // 3. Listen for token from callback page via postMessage
          const handler = (e: MessageEvent) => {
            if (e.data?.type === "mcp-oauth-success" && e.data.token) {
              connectServer(id, e.data.token);
              refresh();
              window.removeEventListener("message", handler);
            } else if (e.data?.type === "mcp-oauth-error") {
              window.alert(`OAuth failed: ${e.data.error}`);
              window.removeEventListener("message", handler);
            }
          };
          window.addEventListener("message", handler);

          // Auto-cleanup after 5 minutes if popup never posts back
          setTimeout(() => window.removeEventListener("message", handler), 5 * 60 * 1000);
        } catch (e) {
          window.alert(`OAuth error: ${e instanceof Error ? e.message : "unknown"}`);
        }
        return;
      }

      // Bearer / none auth — simple token prompt
      const token = window.prompt("Enter token (or leave blank):");
      connectServer(id, token || undefined);
      refresh();
    },
    [servers, refresh]
  );

  const handleDisconnect = useCallback(
    (id: string) => {
      disconnectServer(id);
      refresh();
    },
    [refresh]
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeMcpServer(id);
      refresh();
    },
    [refresh]
  );

  // Which presets aren't added yet
  const addedUrls = new Set(servers.map((s) => s.url));
  const availablePresets = MCP_PRESETS.filter((p) => !addedUrls.has(p.url));

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Connected Tools (MCP)
      </label>

      {/* Connected servers */}
      {servers.map((server) => (
        <div
          key={server.id}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              server.connected ? "bg-emerald-400" : "bg-[var(--text-dim)]"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-[var(--text)]">
              {server.name}
            </div>
            <div className="truncate text-[9px] text-[var(--text-dim)]">
              {server.url}
            </div>
          </div>
          {server.connected ? (
            <button
              onClick={() => handleDisconnect(server.id)}
              className="text-[9px] text-[var(--text-dim)] hover:text-red-400"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => handleConnect(server.id)}
              className="text-[9px] text-emerald-400 hover:text-emerald-300"
            >
              Connect
            </button>
          )}
          <button
            onClick={() => handleRemove(server.id)}
            className="text-[9px] text-[var(--text-dim)] hover:text-red-400"
          >
            &#10005;
          </button>
        </div>
      ))}

      {servers.length === 0 && (
        <div className="text-[10px] text-[var(--text-dim)]">
          No MCP servers connected. Add one below to extend Claude with external tools.
        </div>
      )}

      {/* Quick-add presets */}
      {availablePresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availablePresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleAddPreset(preset.id)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-dim)] transition-colors hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-[var(--text-muted)]"
            >
              <span>{preset.icon}</span>
              {preset.name}
            </button>
          ))}
        </div>
      )}

      {/* Custom server */}
      {showAdd ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Server name"
            className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10px] text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
          />
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://my-mcp-server.com/mcp"
            className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10px] text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
          />
          <input
            value={customToken}
            onChange={(e) => setCustomToken(e.target.value)}
            placeholder="Bearer token (optional)"
            type="password"
            className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 font-mono text-[10px] text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddCustom}
              className="rounded bg-white px-3 py-1 text-[10px] font-medium text-black hover:opacity-90"
            >
              Add
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          + Add custom MCP server
        </button>
      )}
    </div>
  );
}
