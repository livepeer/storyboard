/**
 * MCP server configuration store — persists in localStorage.
 */

import type { McpServerConfig } from "./types";

const STORAGE_KEY = "storyboard_mcp_servers";

function load(): McpServerConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(servers: McpServerConfig[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

export function getMcpServers(): McpServerConfig[] {
  return load();
}

export function getConnectedServers(): McpServerConfig[] {
  return load().filter((s) => s.connected);
}

export function addMcpServer(
  config: Omit<McpServerConfig, "id" | "connected">
): McpServerConfig {
  const servers = load();
  const server: McpServerConfig = {
    ...config,
    id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    connected: false,
  };
  servers.push(server);
  save(servers);
  return server;
}

export function updateMcpServer(
  id: string,
  patch: Partial<McpServerConfig>
): McpServerConfig | null {
  const servers = load();
  const idx = servers.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  servers[idx] = { ...servers[idx], ...patch };
  save(servers);
  return servers[idx];
}

export function removeMcpServer(id: string): boolean {
  const servers = load();
  const filtered = servers.filter((s) => s.id !== id);
  if (filtered.length === servers.length) return false;
  save(filtered);
  return true;
}

export function connectServer(id: string, token?: string): McpServerConfig | null {
  return updateMcpServer(id, {
    connected: true,
    token,
    lastConnected: Date.now(),
  });
}

export function disconnectServer(id: string): McpServerConfig | null {
  return updateMcpServer(id, {
    connected: false,
    token: undefined,
  });
}

export function clearMcpServers() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
