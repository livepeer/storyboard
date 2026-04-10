import { useSkillStore } from "./store";
import { getCachedCapabilities } from "@/lib/sdk/capabilities";
import { useCanvasStore } from "@/lib/canvas/store";

interface ParsedCommand {
  command: string;
  args: string;
}

export function parseCommand(input: string): ParsedCommand | null {
  const t = input.trim();
  if (!t.startsWith("/")) return null;
  const match = t.match(/^\/(\S+)(?:\s+(.*))?$/);
  if (!match) return null;
  return { command: match[1], args: (match[2] || "").trim() };
}

export async function executeCommand(cmd: ParsedCommand): Promise<string> {
  const store = useSkillStore.getState();
  if (!store.initialized) await store.initRegistry();

  switch (cmd.command) {
    case "skills":
      return listSkills();
    case "skills/load":
      return loadSkill(cmd.args);
    case "skills/unload":
      return unloadSkill(cmd.args);
    case "skills/clear":
      return clearSkills();
    case "skills/load-by-category":
      return loadByCategory(cmd.args);
    case "skills/create":
      return createSkill(cmd.args);
    case "capabilities":
      return showCapabilities();
    case "export":
      return exportCanvas();
    default:
      return `Unknown command: /${cmd.command}\nAvailable: /skills, /skills/load, /skills/unload, /skills/clear, /skills/load-by-category, /skills/create, /capabilities, /export`;
  }
}

function listSkills(): string {
  const { registry, loaded } = useSkillStore.getState();
  const categories = new Map<string, typeof registry>();
  for (const s of registry) {
    const cat = s.category || "other";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(s);
  }
  const lines: string[] = ["Skills:"];
  for (const [cat, skills] of categories) {
    lines.push(`\n── ${cat.toUpperCase()} ──`);
    for (const s of skills) {
      const marker = loaded.includes(s.id) ? "\u25CF" : "\u25CB";
      const tag = s.type === "style-override" ? " [style]" : "";
      lines.push(`${marker} ${s.id}${tag}`);
      lines.push(`  ${s.description}`);
      lines.push(`  \u2192 /skills/load ${s.id}`);
    }
  }
  lines.push(`\n\u25CF = loaded  \u25CB = available`);
  lines.push(`Active: ${loaded.length > 0 ? loaded.join(", ") : "none"}`);
  return lines.join("\n");
}

async function loadSkill(id: string): Promise<string> {
  if (!id) return "Usage: /skills/load <skill_id>";
  const content = await useSkillStore.getState().loadSkill(id);
  if (!content) return `Skill "${id}" not found. Use /skills to list available.`;
  const meta = useSkillStore.getState().registry.find((s) => s.id === id);
  const extra = meta?.type === "style-override"
    ? `\nStyle active: "${meta.prompt_prefix || ""}..."`
    : "";
  return `Loaded: ${id}${extra}`;
}

function unloadSkill(id: string): string {
  if (!id) return "Usage: /skills/unload <skill_id>";
  useSkillStore.getState().unloadSkill(id);
  return `Unloaded: ${id}`;
}

function clearSkills(): string {
  useSkillStore.getState().clearLoaded();
  return "All skills unloaded.";
}

async function loadByCategory(cat: string): Promise<string> {
  if (!cat) return "Usage: /skills/load-by-category <category>\nCategories: core, creation, workflow, live, style, integration, user";
  await useSkillStore.getState().loadByCategory(cat);
  const loaded = useSkillStore.getState().loaded;
  return `Loaded ${cat} skills: ${loaded.join(", ")}`;
}

function createSkill(args: string): string {
  // Parse: "xxx for yyy" or "xxx yyy"
  const forMatch = args.match(/^(\S+)\s+for\s+(.+)$/i);
  const id = forMatch ? forMatch[1] : args.split(/\s+/)[0];
  const desc = forMatch ? forMatch[2] : args.slice(id.length).trim();
  if (!id) return "Usage: /skills/create <name> for <description>";
  if (!desc) return `Usage: /skills/create ${id} for <what this style/skill does>`;

  useSkillStore.getState().addUserSkill(id, desc, desc);
  return `Created and loaded: ${id}\nStyle prefix: "${desc}"\nUse /skills/unload ${id} to deactivate.`;
}

function showCapabilities(): string {
  const caps = getCachedCapabilities();
  if (caps.length === 0) return "No capabilities loaded. SDK may be unreachable.";
  const lines = ["Available models:"];
  for (const c of caps) {
    lines.push(`  ${c.name} — ${c.model_id}`);
  }
  return lines.join("\n");
}

function exportCanvas(): string {
  const state = useCanvasStore.getState();
  const data = {
    cards: state.cards.map((c) => ({
      refId: c.refId, type: c.type, title: c.title, url: c.url,
      x: c.x, y: c.y, w: c.w, h: c.h,
    })),
    edges: state.edges,
    exported_at: new Date().toISOString(),
  };
  const json = JSON.stringify(data, null, 2);

  // Copy to clipboard
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(json).catch(() => {});
  }

  return `Exported ${data.cards.length} cards, ${data.edges.length} edges.\nCopied to clipboard.`;
}
