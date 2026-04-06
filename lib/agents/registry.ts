import type { AgentPlugin } from "./types";

let activePlugin: AgentPlugin | null = null;
const plugins = new Map<string, AgentPlugin>();

export function registerPlugin(plugin: AgentPlugin) {
  plugins.set(plugin.id, plugin);
}

export function setActivePlugin(id: string) {
  const plugin = plugins.get(id);
  if (!plugin) throw new Error(`Plugin "${id}" not registered`);
  activePlugin = plugin;
}

export function getActivePlugin(): AgentPlugin | null {
  return activePlugin;
}

export function getActivePluginId(): string | null {
  return activePlugin?.id ?? null;
}

export function getPluginList(): AgentPlugin[] {
  return Array.from(plugins.values());
}
