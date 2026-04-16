import { useSkillStore } from "./store";
import { getCachedCapabilities } from "@/lib/sdk/capabilities";
import { useCanvasStore } from "@/lib/canvas/store";
import {
  useSessionContext,
  generateContextFromDescription,
  type CreativeContext,
} from "@/lib/agents/session-context";
import { handleOrganize, handleLayoutCommand } from "@/lib/layout/commands";
import { handleStoryCommand } from "@/lib/story/commands";

interface ParsedCommand {
  command: string;
  args: string;
}

export function parseCommand(input: string): ParsedCommand | null {
  const t = input.trim();
  if (!t.startsWith("/")) return null;
  // [\s\S]* matches any character including newlines, so multi-line
  // pastes (e.g. `/context gen <long description...\nmultiple lines>`)
  // parse correctly. JS regex `.` doesn't match \n by default which
  // would otherwise truncate args at the first newline.
  const match = t.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
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
      return handleOrganize(cmd.args);
    case "layout":
      return handleLayoutCommand(cmd.args);
    case "export":
      return exportCanvas();
    case "save":
      return saveCards(cmd.args);
    case "context":
      return showContext(cmd.args);
    case "context/gen":
      // Allow `/context/gen <description>` as a shorthand alias for
      // `/context gen <description>` (parser splits on first whitespace
      // so this only fires if the user uses a slash separator).
      return contextGen(cmd.args);
    case "story":
      return handleStoryCommand(cmd.args);
    default:
      return `Unknown command: /${cmd.command}\nAvailable: /skills, /context, /story, /capabilities, /organize, /layout, /save, /export`;
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

async function showContext(args?: string): Promise<string> {
  const store = useSessionContext.getState();

  if (!args || args.trim() === "") {
    // /context — show current
    if (!store.context) {
      return [
        "No active creative context.",
        "",
        "Quick start:",
        "  /context gen <description>       — let the agent build it from a description",
        "  /context edit <field> <value>    — set a single field manually",
        "",
        "Or paste a storyboard brief and it will be auto-extracted.",
      ].join("\n");
    }
    const ctx = store.context;
    const lines = [
      `Creative Context: ${store.summary}`,
      "",
      `  Style:      ${ctx.style || "(not set)"}`,
      `  Palette:    ${ctx.palette || "(not set)"}`,
      `  Characters: ${ctx.characters || "(not set)"}`,
      `  Setting:    ${ctx.setting || "(not set)"}`,
      `  Rules:      ${ctx.rules || "(not set)"}`,
      `  Mood:       ${ctx.mood || "(not set)"}`,
      "",
      "Commands: /context gen <description> | /context edit <field> <value> | /context add <field> <value> | /context clear",
    ];
    if (store.pendingGen) {
      lines.push("");
      lines.push(`(pending /context gen clarification — answer with /context gen <your answers>)`);
    }
    return lines.join("\n");
  }

  const sub = args.trim();

  // /context gen <description> — LLM-generated/enriched context with
  // multi-turn clarification support.
  const genMatch = sub.match(/^gen(?:\s+([\s\S]+))?$/i);
  if (genMatch) {
    return contextGen(genMatch[1]?.trim() || "");
  }

  // /context clear
  if (sub === "clear") {
    store.clearContext();
    return "Creative context cleared. Next generation starts fresh.";
  }

  // /context edit <field> <value> — overwrite a field
  const editMatch = sub.match(/^edit\s+(style|palette|characters|setting|rules|mood)\s+(.+)$/i);
  if (editMatch) {
    const field = editMatch[1].toLowerCase() as keyof CreativeContext;
    const value = editMatch[2].trim();
    if (!store.context) {
      store.setContext({ style: "", palette: "", characters: "", setting: "", rules: "", mood: "", [field]: value });
    } else {
      store.updateContext({ [field]: value });
    }
    return `Updated ${field} → "${value}"`;
  }

  // /context edit (no field) — show usage
  if (sub === "edit") {
    return "Usage: /context edit <field> <value>\nFields: style, palette, characters, setting, rules, mood\nExample: /context edit style Studio Ghibli watercolor";
  }

  // /context add <field> <value> — append to a field
  const addMatch = sub.match(/^add\s+(style|palette|characters|setting|rules|mood)\s+(.+)$/i);
  if (addMatch) {
    const field = addMatch[1].toLowerCase() as keyof CreativeContext;
    const value = addMatch[2].trim();
    if (!store.context) {
      store.setContext({ style: "", palette: "", characters: "", setting: "", rules: "", mood: "", [field]: value });
      return `Set ${field} → "${value}"`;
    }
    const existing = store.context[field] || "";
    const combined = existing ? `${existing}, ${value}` : value;
    store.updateContext({ [field]: combined });
    return `Added to ${field} → "${combined}"`;
  }

  // /context add (no field) — show usage
  if (sub === "add") {
    return "Usage: /context add <field> <value>\nFields: style, palette, characters, setting, rules, mood\nExample: /context add characters white cat companion";
  }

  return `Unknown: /context ${sub}\nCommands: /context | /context gen <description> | /context edit <field> <value> | /context add <field> <value> | /context clear`;
}

/**
 * `/context gen <description>` — LLM produces (or extends) a CreativeContext
 * from a freeform description.
 *
 * Behavior:
 *  - Empty args: prints usage and bails.
 *  - If a previous /context gen left a pendingGen (because the LLM asked
 *    clarifying questions), the new args are treated as the user's answers
 *    and merged with the original description, then re-sent to the LLM.
 *  - Calls generateContextFromDescription. The LLM either returns a full
 *    enriched CreativeContext (Format A) or a small list of clarifying
 *    questions (Format B). On B we store a pendingGen and return the
 *    questions to the user; the next /context gen finishes the loop.
 *  - On success, if a context already exists, we EXTEND it (append new
 *    detail to existing fields, preserve user-set values). Otherwise we
 *    create the context from scratch.
 *
 * Latency: one Gemini round-trip (~1-3s). The slash command runner
 * already prints the user's input as a chat message before awaiting,
 * so the user sees their command echoed and a system response shortly
 * after.
 */
async function contextGen(rawArgs: string): Promise<string> {
  const args = (rawArgs || "").trim();
  if (!args) {
    return [
      "Usage: /context gen <description>",
      "",
      "Examples:",
      '  /context gen Studio Ghibli short film about a fisherman\'s daughter and her sea otter friend on a windy island',
      '  /context gen cyberpunk noir detective in neon-drenched Tokyo, 2099, rainy nights, a lone synthetic cat companion',
      "",
      "If your description is too vague, the agent will ask 1-3 quick questions",
      "you can answer by running /context gen <answers> again.",
    ].join("\n");
  }

  const store = useSessionContext.getState();

  // Multi-turn merge: if a clarification is pending, treat the new args
  // as the answers to those questions and merge with the original
  // description before re-asking the LLM.
  let effective = args;
  const pending = store.pendingGen;
  // Expire pending gens older than 10 min so a stale one doesn't quietly
  // re-merge into an unrelated new generation.
  const isPendingFresh = pending && Date.now() - pending.startedAt < 10 * 60 * 1000;
  if (isPendingFresh && pending) {
    effective = [
      pending.originalDescription,
      "",
      "Additional details:",
      args,
    ].join("\n");
  }

  const result = await generateContextFromDescription(effective);

  if (result.kind === "error") {
    return `Couldn't generate context: ${result.message}\nTry /context gen <description> again, or set fields manually with /context edit <field> <value>.`;
  }

  if (result.kind === "clarify") {
    store.setPendingGen({
      originalDescription: effective,
      askedQuestions: result.questions,
      startedAt: Date.now(),
    });
    return [
      "I need a bit more to build a strong context. Quick questions:",
      "",
      ...result.questions.map((q, i) => `  ${i + 1}. ${q}`),
      "",
      "Reply by running /context gen <your answers, written naturally>",
      "or fill specific fields directly with /context edit <field> <value>.",
    ].join("\n");
  }

  // Got a full context. Clear any pending state and merge with existing.
  store.clearPendingGen();
  const existing = store.context;
  let merged: CreativeContext;
  let mode: "created" | "extended";

  if (existing) {
    // Extend existing context: for each field, if existing already has
    // content and the new value is meaningfully different, append with
    // a comma (mirrors /context add semantics). If existing is empty,
    // adopt the new value. The user can always /context edit to
    // overwrite a field cleanly.
    const extend = (a: string, b: string): string => {
      const aTrim = a.trim();
      const bTrim = b.trim();
      if (!aTrim) return bTrim;
      if (!bTrim) return aTrim;
      // Avoid duplicating if the new value is already a substring of the existing one
      if (aTrim.toLowerCase().includes(bTrim.toLowerCase())) return aTrim;
      return `${aTrim}, ${bTrim}`;
    };
    merged = {
      style: extend(existing.style, result.context.style),
      palette: extend(existing.palette, result.context.palette),
      characters: extend(existing.characters, result.context.characters),
      setting: extend(existing.setting, result.context.setting),
      rules: extend(existing.rules, result.context.rules),
      mood: extend(existing.mood, result.context.mood),
    };
    mode = "extended";
  } else {
    merged = result.context;
    mode = "created";
  }

  store.setContext(merged);
  const newStore = useSessionContext.getState();

  return [
    `Context ${mode}: ${newStore.summary}`,
    "",
    `  Style:      ${merged.style || "(not set)"}`,
    `  Palette:    ${merged.palette || "(not set)"}`,
    `  Characters: ${merged.characters || "(not set)"}`,
    `  Setting:    ${merged.setting || "(not set)"}`,
    `  Rules:      ${merged.rules || "(not set)"}`,
    `  Mood:       ${merged.mood || "(not set)"}`,
    "",
    "Refine: /context edit <field> <value> | /context add <field> <value> | /context gen <more detail>",
  ].join("\n");
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

async function saveCards(args: string): Promise<string> {
  const { downloadCard, downloadCards, getSavableCards } = await import("@/lib/utils/download");
  const canvasState = useCanvasStore.getState();
  const arg = args.trim().toLowerCase();

  // /save — save selected cards, or all if none selected
  if (!arg || arg === "selected") {
    const selectedIds = canvasState.selectedCardIds;
    if (selectedIds.size > 0) {
      const selected = canvasState.cards.filter((c) => selectedIds.has(c.id));
      const savable = getSavableCards(selected);
      if (savable.length === 0) return "No savable cards in selection (no media URLs).";
      const { ok, fail } = await downloadCards(savable);
      return fail > 0 ? `Saved ${ok}, failed ${fail}` : `Saved ${ok} cards.`;
    }
    // No selection → save all
    const savable = getSavableCards(canvasState.cards);
    if (savable.length === 0) return "No cards with media to save.";
    const { ok, fail } = await downloadCards(savable);
    return fail > 0 ? `Saved ${ok}/${savable.length} cards (${fail} failed).` : `Saved all ${ok} cards.`;
  }

  // /save all — save everything
  if (arg === "all") {
    const savable = getSavableCards(canvasState.cards);
    if (savable.length === 0) return "No cards with media to save.";
    const { ok, fail } = await downloadCards(savable);
    return fail > 0 ? `Saved ${ok}/${savable.length} cards (${fail} failed).` : `Saved all ${ok} cards.`;
  }

  // /save episode <name> — save all cards in an episode
  if (arg.startsWith("episode")) {
    const epName = args.trim().slice(7).trim();
    try {
      const { useEpisodeStore } = await import("@/lib/episodes/store");
      const epStore = useEpisodeStore.getState();
      const ep = epStore.episodes.find(
        (e) => e.id === epName || e.name.toLowerCase() === epName.toLowerCase()
      );
      if (!ep) return `Episode "${epName}" not found. Use /layout list to see episodes.`;
      const epCards = canvasState.cards.filter((c) => ep.cardIds.includes(c.id));
      const savable = getSavableCards(epCards);
      if (savable.length === 0) return `No savable cards in episode "${ep.name}".`;
      const { ok, fail } = await downloadCards(savable);
      return fail > 0 ? `Saved ${ok}/${savable.length} from "${ep.name}" (${fail} failed).` : `Saved ${ok} cards from "${ep.name}".`;
    } catch {
      return "Episode store not available.";
    }
  }

  // /save <refId> — save a specific card
  const card = canvasState.cards.find(
    (c) => c.refId.toLowerCase() === arg || c.id === arg
  );
  if (card) {
    if (!card.url) return `Card ${card.refId} has no media to save.`;
    const ok = await downloadCard(card);
    return ok ? `Saved ${card.refId}.` : `Failed to save ${card.refId}.`;
  }

  return `Usage: /save — selected or all | /save all | /save <refId> | /save episode <name>`;
}
