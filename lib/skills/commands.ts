import { useSkillStore } from "./store";
import { getCachedCapabilities } from "@/lib/sdk/capabilities";
import { useCanvasStore } from "@/lib/canvas/store";
import { useSessionContext } from "@/lib/agents/session-context";

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
    case "organize":
      return organizeCanvas(cmd.args);
    case "export":
      return exportCanvas();
    case "context":
      return showContext(cmd.args);
    default:
      return `Unknown command: /${cmd.command}\nAvailable: /skills, /context, /capabilities, /organize, /export`;
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

  // Categorize by provider and type
  const categorized: Record<string, Record<string, Array<{ name: string; model_id: string }>>> = {};

  for (const c of caps) {
    const mid = c.model_id;
    // Provider
    let provider = "other";
    if (mid.startsWith("fal-ai/") || mid.startsWith("easel-ai/") || mid.startsWith("bytedance/")) provider = "fal";
    else if (mid.startsWith("gemini/")) provider = "gemini";

    // Category
    let category = "utility";
    const name = c.name.toLowerCase();
    const model = mid.toLowerCase();
    if (model.includes("text-to-video") || model.includes("t2v") || name.includes("t2v")) category = "t2v";
    else if (model.includes("image-to-video") || model.includes("i2v") || name.includes("i2v") || name.includes("transition")) category = "i2v";
    else if (name.includes("lv2v") || model.includes("scope")) category = "lv2v";
    else if (model.includes("v2v") || name.includes("v2v")) category = "v2v";
    else if (model.includes("text-to-image") || model.includes("flux") || model.includes("recraft") || name === "gemini-image" || model.includes("nano-banana")) category = "t2i";
    else if (model.includes("kontext") || model.includes("fill") || model.includes("edit") || name.includes("face-swap") || name === "bg-remove") category = "i2i";
    else if (model.includes("tts") || model.includes("speech") || model.includes("music") || model.includes("audio") || name === "sfx") category = "audio";
    else if (model.includes("lipsync") || model.includes("omnihuman") || name === "talking-head") category = "avatar";
    else if (model.includes("sam") || model.includes("upscale") || model.includes("sr")) category = "utility";
    else if (model.includes("gemini") && !model.includes("image")) category = "llm";

    if (!categorized[provider]) categorized[provider] = {};
    if (!categorized[provider][category]) categorized[provider][category] = [];
    categorized[provider][category].push({ name: c.name, model_id: c.model_id });
  }

  const categoryLabels: Record<string, string> = {
    t2i: "Text \u2192 Image",
    i2i: "Image \u2192 Image (edit/fill/swap)",
    t2v: "Text \u2192 Video",
    i2v: "Image \u2192 Video",
    v2v: "Video \u2192 Video",
    lv2v: "Live Video (LV2V)",
    audio: "Audio / Music / TTS",
    avatar: "Avatar / Lipsync",
    llm: "LLM / Text",
    utility: "Utility (upscale/segment)",
  };

  const lines: string[] = [`Models (${caps.length}):`];
  for (const [provider, categories] of Object.entries(categorized).sort()) {
    lines.push(`\n\u2501\u2501 ${provider.toUpperCase()} \u2501\u2501`);
    for (const [cat, models] of Object.entries(categories).sort()) {
      lines.push(`  ${categoryLabels[cat] || cat}:`);
      for (const m of models) {
        lines.push(`    \u25CB ${m.name} \u2014 ${m.model_id}`);
      }
    }
  }
  return lines.join("\n");
}

function organizeCanvas(mode?: string): string {
  const store = useCanvasStore.getState();
  if (store.cards.length === 0) return "Canvas is empty \u2014 nothing to organize.";

  const m = (mode || "grid").toLowerCase().trim();

  if (m === "narrative" || m === "flow" || m === "story") {
    store.narrativeLayout();
    return `Organized ${store.cards.length} cards in narrative flow (horizontal chain).`;
  }

  store.autoLayout();
  return `Organized ${store.cards.length} cards in grid layout.\nTip: /organize narrative \u2014 horizontal story flow`;
}

function showContext(args?: string): string {
  const { context, summary, clearContext } = useSessionContext.getState();

  if (args === "clear") {
    clearContext();
    return "Creative context cleared. Next generation starts fresh.";
  }

  if (!context) {
    return "No active creative context.\nPaste a storyboard brief to auto-extract, or it will be created from your first multi-scene prompt.";
  }

  const lines = [
    `Creative Context: ${summary}`,
    "",
    `  Style:      ${context.style || "(not set)"}`,
    `  Palette:    ${context.palette || "(not set)"}`,
    `  Characters: ${context.characters || "(not set)"}`,
    `  Setting:    ${context.setting || "(not set)"}`,
    `  Rules:      ${context.rules || "(not set)"}`,
    `  Mood:       ${context.mood || "(not set)"}`,
    "",
    "This prefix is injected into every generation prompt.",
    "Say 'wrong style, use X' to update. /context clear to reset.",
  ];
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
