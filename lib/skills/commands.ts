import { useSkillStore } from "./store";
// creative-kit routing — CommandRouter available for future full migration
import type { CommandRouter } from "@livepeer/creative-kit";
import { getCachedCapabilities } from "@/lib/sdk/capabilities";
import { useCanvasStore } from "@/lib/canvas/store";
import {
  useSessionContext,
  generateContextFromDescription,
  type CreativeContext,
} from "@/lib/agents/session-context";
import { handleOrganize, handleLayoutCommand } from "@/lib/layout/commands";
import { handleStoryCommand } from "@/lib/story/commands";
import { handleFilmCommand } from "@/lib/film/commands";
import { handleStreamCommand } from "@/lib/stream-cmd/commands";
import { handleProjectCommand } from "@/lib/projects/commands";

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

async function handleQuickStyle(styleName: string, prompt: string, stylePrompt: string): Promise<string> {
  if (!prompt) return `Usage: /${styleName} <description>\nExample: /${styleName} a cute cat sitting on a mushroom`;
  try {
    const { runInference } = await import("@/lib/sdk/client");
    const canvas = useCanvasStore.getState();
    const cardNum = canvas.cards.length + 1;
    const refId = `img-${cardNum}`;
    const card = canvas.addCard({ type: "image", title: `${styleName}: ${prompt.slice(0, 30)}`, refId });
    const result = await runInference({ capability: "flux-dev", prompt: `${stylePrompt}, ${prompt}`, params: { image_size: { width: 1024, height: 1024 } } });
    const r = result as Record<string, unknown>;
    const data = (r.data ?? r) as Record<string, unknown>;
    const images = data.images as Array<{ url: string }> | undefined;
    const url = (r.image_url as string) ?? images?.[0]?.url;
    if (url) { canvas.updateCard(card.id, { url }); return `${styleName} created: ${refId}`; }
    canvas.updateCard(card.id, { error: "No image returned" });
    return `${styleName} generation failed — try a different description.`;
  } catch (e) {
    return `${styleName} failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
}

export async function executeCommand(cmd: ParsedCommand): Promise<string> {
  const store = useSkillStore.getState();
  if (!store.initialized) await store.initRegistry();

  switch (cmd.command) {
    case "help":
      return showHelp();
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
    case "film":
      return handleFilmCommand(cmd.args);
    case "film/load":
      return handleFilmCommand(`load ${cmd.args}`);
    case "stream":
      return handleStreamCommand(cmd.args);
    case "project":
      return handleProjectCommand(cmd.args);
    case "stream/graphs":
      return handleStreamCommand(`graphs ${cmd.args}`);
    case "stream/ptravel":
      return handleStreamCommand(`ptravel ${cmd.args}`);
    case "lego":
      return handleQuickStyle("lego", cmd.args, "Convert to LEGO minifigure style, plastic bricks, yellow skin, brick studs, toy photography, vibrant");
    case "logo":
      return handleQuickStyle("logo", cmd.args, `Professional logo design: ${cmd.args}. Clean vector, centered, simple background, brand identity`);
    case "iso":
      return handleQuickStyle("iso", cmd.args, "Minimalist isometric illustration, clean black lines on white, geometric 3D, SVG-style vector, no shading");
    case "tryon":
      return handleTryonVideo(cmd.args);
    case "3d":
      return handle3D(cmd.args);
    case "podcast":
      return handlePodcast(cmd.args);
    case "music":
      return handleMusic(cmd.args);
    case "sfx":
      return handleMusic(cmd.args, true);
    case "mix":
      return handleMix(cmd.args);
    case "analyze":
      return handleAnalyze(cmd.args);
    case "talk":
      return handleTalk(cmd.args);
    default:
      return `Unknown command: /${cmd.command}. Type /help for all commands.`;
  }
}

function showHelp(): string {
  return [
    "── CREATIVE COMMANDS ──",
    "  /story <concept>            Generate a 6-scene story with style + characters",
    "  /story list                 Show recent stories",
    "  /story apply [id]           Create project + generate images from a story",
    "  /story show <id>            Re-display a saved story",
    "",
    "  /film <concept>             Generate a 4-shot mini-film script with camera",
    "  /film apply [id]            Generate key frames + animate each to video",
    "  /film load <genre>          Load genre skill (animation, action, noir, scifi, documentary)",
    "  /film skills                List available genre skills",
    "",
    "  /stream <concept>           Plan a multi-scene live stream (prompt traveling)",
    "  /stream apply [id]          Start stream, scenes transition automatically",
    "  /stream stop                Stop active stream",
    "  /stream ptravel <desc> #N,#Ds  Prompt-travel on active stream (N scenes, D sec each)",
    "  /stream graphs              List all graph templates (built-in + saved)",
    "  /stream graphs save <name>  Save last stream's graph for reuse",
    "",
    "── PROJECT MANAGEMENT ──",
    "  /project list               Show all projects with status",
    "  /project show [name]        Details of active or named project",
    "  /project switch <name>      Set as active project",
    "  /project add <brief>        Create a new project",
    "  /project replay [name]      Regenerate all scenes from stored prompts",
    "  /project clear              Remove all projects",
    "",
    "── CANVAS & LAYOUT ──",
    "  /organize [style]           Auto-layout canvas (grid, narrative, episode, movie-board)",
    "  /layout list                Show available layout presets",
    "  /layout set <id>            Set default layout preset",
    "  /save [refId]               Save card(s) to file",
    "  /export                     Export entire canvas as JSON",
    "",
    "── STYLE & CONTEXT ──",
    "  /context                    Show current creative context (style, characters, mood)",
    "  /context gen <description>  Generate context from a description",
    "  /context edit               Edit context interactively",
    "  /context add <field> <val>  Add to a context field",
    "  /context clear              Clear creative context",
    "",
    "── QUICK STYLES ──",
    "  /lego <description>         Generate LEGO-style image",
    "  /logo <description>         Generate logo design",
    "  /iso <description>          Generate isometric illustration",
    "  /tryon <person> <garment>   Virtual try-on → animate to runway video",
    "  /3d <description>          Generate 3D model from text (or /3d <card> for image→3D)",
    "  /podcast <topic>           Generate conversational podcast audio",
    "  /podcast daily briefing    Podcast from today's email summary",
    "  /music <description>       Generate music track",
    "  /sfx <desc> --video <card> Generate sound effects for a video",
    "  /mix <video> <audio>       Combine video + audio into one (loops shorter track)",
    "",
    "── TALKING VIDEO ──",
    "  /talk <text> --face <card>  Generate talking video (TTS → lip-sync animation)",
    "  /talk <text> --face img-1 --voice aud-2   Clone voice from audio card",
    "",
    "── ANALYSIS ──",
    "  /analyze <card-name>        Extract style, characters, setting from image/video",
    "",
    "── SKILLS & MODELS ──",
    "  /skills                     List available agent skills",
    "  /skills load <name>         Load a skill into the agent",
    "  /capabilities               Show available AI models on the network",
    "",
    "── OTHER ──",
    "  /help                       This help message",
    "",
    "Tip: right-click any card for Animate, Restyle, Seedance, 3D, and more.",
  ].join("\n");
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

async function handleTryonVideo(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    return "Usage: /tryon <person-card> <garment-card>\nExample: /tryon img-1 img-2\n\nCreates a virtual try-on image, then animates it to a runway video.";
  }
  const [personRef, garmentRef] = parts;
  const cards = useCanvasStore.getState().cards;
  const personCard = cards.find((c) => c.refId === personRef);
  const garmentCard = cards.find((c) => c.refId === garmentRef);

  if (!personCard?.url) return `Person card "${personRef}" not found or has no image.`;
  if (!garmentCard?.url) return `Garment card "${garmentRef}" not found or has no image.`;

  const { runInference } = await import("@/lib/sdk/client");
  const { getCachedCapabilities } = await import("@/lib/sdk/capabilities");
  const { buildAttemptChain, extractFalError, isRecoverableFailure } = await import("@/lib/tools/compound-tools");

  // Step 1: fashn-tryon
  const tryonResult = await runInference({
    capability: "fashn-tryon",
    prompt: "virtual try-on",
    params: { model_image: personCard.url, garment_image: garmentCard.url, category: "auto" },
  });
  const tr = tryonResult as Record<string, unknown>;
  const td = (tr.data ?? tr) as Record<string, unknown>;
  const tImages = td.images as Array<{ url: string }> | undefined;
  const tryonUrl = (tr.image_url as string) ?? tImages?.[0]?.url ?? (td.image as { url: string })?.url;
  if (!tryonUrl) return `Try-on failed: ${extractFalError(td) || "No image returned"}`;

  const canvas = useCanvasStore.getState();
  const tryonCard = canvas.addCard({ type: "image", title: `Try-On: ${personCard.title}`, refId: `tryon-${Date.now()}` });
  canvas.updateCard(tryonCard.id, { url: tryonUrl, capability: "fashn-tryon" });

  // Step 2: animate → video
  const liveCapNames = new Set((getCachedCapabilities() || []).map((c: { name: string }) => c.name));
  const chain = buildAttemptChain("seedance-i2v", liveCapNames);

  for (const cap of chain) {
    try {
      const capParams: Record<string, unknown> = {
        image_url: tryonUrl,
        ...(cap.startsWith("seedance") ? { duration: "10", generate_audio: true } : {}),
      };
      const vResult = await runInference({
        capability: cap,
        prompt: "Model walks confidently, slight turn showing outfit, natural movement, fashion runway",
        params: capParams,
      });
      const vr = vResult as Record<string, unknown>;
      const vd = (vr.data ?? vr) as Record<string, unknown>;
      const videoUrl = (vr.video_url as string) ?? (vd.video as { url: string })?.url;
      const vError = extractFalError(vd);
      if (videoUrl && !vError) {
        const vidCard = canvas.addCard({ type: "video", title: `Video Try-On`, refId: `vid-tryon-${Date.now()}` });
        canvas.updateCard(vidCard.id, { url: videoUrl, capability: cap });
        return `Video try-on complete — ${cap}. Check the canvas.`;
      }
      if (!isRecoverableFailure(vError || "")) break;
    } catch (e) {
      if (!isRecoverableFailure(e instanceof Error ? e.message : "")) break;
    }
  }
  return "Try-on image created, but video animation failed. Right-click the try-on card to animate manually.";
}

async function handleAnalyze(args: string): Promise<string> {
  const refId = args.trim();
  if (!refId) return "Usage: /analyze <card-name>\nExample: /analyze img-1\n\nExtracts style, characters, setting, mood from an image or video frame.";

  const cards = useCanvasStore.getState().cards;
  const card = cards.find((c) => c.refId === refId);
  if (!card) return `Card "${refId}" not found.`;
  if (!card.url) return `Card "${refId}" has no media.`;

  const { analyzeImage } = await import("@/lib/tools/image-analysis");
  const result = await analyzeImage(card.url);
  if (!result.ok) return `Analysis failed: ${result.error}`;

  const a = result.analysis;
  const lines = [
    `${card.title} — Analysis`,
    "",
    `Style: ${a.style}`,
    `Palette: ${a.palette}`,
    `Characters: ${a.characters}`,
    `Setting: ${a.setting}`,
    `Mood: ${a.mood}`,
    "",
    a.description,
    "",
    `(${result.tokens.input + result.tokens.output} tokens)`,
  ];

  // Auto-apply as creative context if none exists
  const { useSessionContext } = await import("@/lib/agents/session-context");
  if (!useSessionContext.getState().context) {
    useSessionContext.getState().setContext({
      style: a.style, palette: a.palette, characters: a.characters,
      setting: a.setting, mood: a.mood, rules: "",
    });
    lines.push("", "Applied as creative context — future generations will match this style.");
  }

  return lines.join("\n");
}

/**
 * /talk <text> --face <card> [--voice <card>]
 * Generate a talking video: TTS with optional voice clone → talking-head animation.
 */
async function handleTalk(args: string): Promise<string> {
  if (!args.trim()) {
    return [
      "Usage: /talk <speech text> --face <card> [--voice <card>]",
      "",
      "Examples:",
      '  /talk Hello, welcome to our demo --face img-1',
      '  /talk "Amazing product" --face img-2 --voice aud-1',
      "",
      "Pipeline: text → chatterbox-tts (voice clone) → talking-head (lip-sync video)",
      "Right-click an image card → 'Talking Video' for the UI version.",
    ].join("\n");
  }

  // Parse --face and --voice flags
  const faceMatch = args.match(/--face\s+(\S+)/i);
  const voiceMatch = args.match(/--voice\s+(\S+)/i);
  const speechText = args
    .replace(/--face\s+\S+/i, "")
    .replace(/--voice\s+\S+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  if (!speechText) return "No speech text provided. Usage: /talk <text> --face <card>";
  if (!faceMatch) return "Missing --face <card>. Usage: /talk <text> --face img-1";

  const cards = useCanvasStore.getState().cards;
  const faceCard = cards.find((c) => c.refId === faceMatch[1]);
  if (!faceCard?.url) return `Face card "${faceMatch[1]}" not found or has no image.`;

  const voiceCard = voiceMatch ? cards.find((c) => c.refId === voiceMatch[1]) : null;
  if (voiceMatch && !voiceCard?.url) return `Voice card "${voiceMatch[1]}" not found or has no audio.`;

  const { runInference } = await import("@/lib/sdk/client");
  const { extractFalError } = await import("@/lib/tools/compound-tools");
  const canvas = useCanvasStore.getState();
  const { useChatStore } = await import("@/lib/chat/store");
  const say = (msg: string) => useChatStore.getState().addMessage(msg, "system");

  say("Step 1/2: Generating speech…");
  const ttsParams: Record<string, unknown> = { text: speechText };
  if (voiceCard?.url) ttsParams.audio_url = voiceCard.url;

  const ttsResult = await runInference({ capability: "chatterbox-tts", prompt: speechText, params: ttsParams });
  const tr = ttsResult as Record<string, unknown>;
  const td = (tr.data ?? tr) as Record<string, unknown>;
  const audioUrl = (tr.audio_url as string) ?? (td.audio as { url: string })?.url ?? (td.audio_file as { url: string })?.url;
  if (!audioUrl) return `Speech failed: ${extractFalError(td) || "No audio returned"}`;

  const audioCard = canvas.addCard({ type: "audio", title: `Speech: ${speechText.slice(0, 25)}`, refId: `aud-talk-${Date.now()}` });
  canvas.updateCard(audioCard.id, { url: audioUrl, capability: "chatterbox-tts" });

  say("Step 2/2: Animating talking head…");
  const thResult = await runInference({ capability: "talking-head", prompt: "talking head animation", params: { image_url: faceCard.url, audio_url: audioUrl } });
  const vr = thResult as Record<string, unknown>;
  const vd = (vr.data ?? vr) as Record<string, unknown>;
  const videoUrl = (vr.video_url as string) ?? (vd.video as { url: string })?.url;

  if (videoUrl) {
    const vidCard = canvas.addCard({ type: "video", title: `Talking: ${faceCard.title}`, refId: `vid-talk-${Date.now()}` });
    canvas.updateCard(vidCard.id, { url: videoUrl, capability: "talking-head" });
    return "Talking video complete — check the canvas.";
  }
  return `Talking head failed: ${extractFalError(vd) || "No video returned"}. Audio is on the canvas.`;
}

/**
 * /3d <text> — text-to-3D
 * /3d <card-ref> — image-to-3D from a canvas card
 * /3d <card-ref> fast — use P1 (fast/low-poly) instead of H3.1
 */
async function handle3D(args: string): Promise<string> {
  if (!args.trim()) {
    return [
      "Usage:",
      "  /3d <description>           Text → 3D model (H3.1 high quality)",
      "  /3d <description> fast      Text → 3D model (P1 fast, ~2s)",
      "  /3d <card-name>             Image → 3D model from canvas card",
      "  /3d <card-name> fast        Image → 3D (P1 fast)",
      "",
      "Examples:",
      "  /3d a red sports car with shiny paint",
      "  /3d img-1",
      "  /3d img-3 fast",
    ].join("\n");
  }

  const parts = args.trim().split(/\s+/);
  const isFast = parts[parts.length - 1].toLowerCase() === "fast";
  const query = isFast ? parts.slice(0, -1).join(" ") : args.trim();

  // Check if query is a card reference
  const cards = useCanvasStore.getState().cards;
  const sourceCard = cards.find((c) => c.refId === query.trim());

  const { runInference } = await import("@/lib/sdk/client");
  const { extractFalError } = await import("@/lib/tools/compound-tools");
  const canvas = useCanvasStore.getState();
  const { useChatStore } = await import("@/lib/chat/store");
  const say = (msg: string) => useChatStore.getState().addMessage(msg, "system");

  let capability: string;
  const params: Record<string, unknown> = { texture: true };

  if (sourceCard?.url) {
    // Image → 3D
    capability = isFast ? "tripo-p1-i3d" : "tripo-i3d";
    params.image_url = sourceCard.url;
    say(`Creating 3D model from "${sourceCard.title}"${isFast ? " (fast mode)" : ""}…`);
  } else {
    // Text → 3D
    capability = isFast ? "tripo-p1-t3d" : "tripo-t3d";
    say(`Creating 3D model: "${query.slice(0, 40)}"${isFast ? " (fast mode)" : ""}…`);
  }

  try {
    const result = await runInference({ capability, prompt: query, params });
    const r = result as Record<string, unknown>;
    const data = (r.data ?? r) as Record<string, unknown>;
    const renderedImage = data.rendered_image as { url: string } | undefined;
    const modelMesh = data.model_mesh as { url: string } | undefined;
    const modelUrls = data.model_urls as { glb?: string; pbr_model?: string } | undefined;
    const previewUrl = renderedImage?.url;
    const glbUrl = modelMesh?.url || modelUrls?.glb;
    const falError = extractFalError(data);

    if (falError) return `3D generation failed: ${falError}`;
    if (!previewUrl && !glbUrl) return "3D generation returned no output.";

    // Create a card with the preview image
    const refId = `3d-${Date.now()}`;
    const card = canvas.addCard({ type: "image", title: `3D: ${query.slice(0, 30)}`, refId });
    canvas.updateCard(card.id, {
      url: previewUrl || glbUrl || "",
      capability,
      metadata: { glbUrl, pbrUrl: modelUrls?.pbr_model },
    });

    if (sourceCard) {
      canvas.addEdge(sourceCard.refId, refId, { capability, action: "3d" });
    }

    const lines = [`3D model created: ${refId} (${capability})`];
    if (glbUrl) lines.push(`GLB: ${glbUrl}`);
    return lines.join("\n");
  } catch (e) {
    return `3D failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
}

/**
 * /podcast <topic> [--style solo|duo|interview]
 * /podcast daily briefing — fetch emails, summarize, then generate podcast
 */
async function handlePodcast(args: string): Promise<string> {
  if (!args.trim()) {
    return [
      "Usage:",
      "  /podcast <topic>                 Two-host podcast about a topic",
      "  /podcast <topic> --style solo    Single narrator",
      "  /podcast <topic> --style interview  Interview format",
      "  /podcast daily briefing          Podcast from today's emails",
      "",
      "Examples:",
      "  /podcast the future of AI in creative tools",
      "  /podcast daily briefing --style duo",
    ].join("\n");
  }

  const { useChatStore } = await import("@/lib/chat/store");
  const { runInference } = await import("@/lib/sdk/client");
  const { extractFalError } = await import("@/lib/tools/compound-tools");
  const canvas = useCanvasStore.getState();
  const say = (msg: string) => useChatStore.getState().addMessage(msg, "system");

  // Parse --style flag
  const styleMatch = args.match(/--style\s+(solo|duo|interview)/i);
  const style = (styleMatch?.[1]?.toLowerCase() || "duo") as "solo" | "duo" | "interview";
  const topic = args.replace(/--style\s+\w+/i, "").trim();

  // Daily briefing mode — fetch emails first
  let briefingContext = "";
  const isDailyBriefing = /daily\s*(briefing|summary|email)/i.test(topic);
  if (isDailyBriefing) {
    say("Fetching emails for daily briefing podcast…");
    try {
      const { getConnectedServers } = await import("@/lib/mcp/store");
      const { discoverToolsViaProxy, executeToolCallViaProxy, parseMcpToolName } = await import("@/lib/mcp/client");
      const servers = getConnectedServers();
      const gmail = servers.find((s) => s.name.toLowerCase().includes("gmail") || s.id === "gmail-local");
      if (gmail) {
        const tools = await discoverToolsViaProxy(gmail);
        const listTool = tools.find((t) => t.name.includes("gmail_list")) || tools.find((t) => t.name.includes("gmail_search"));
        if (listTool) {
          const parsed = parseMcpToolName(listTool.name);
          if (parsed) {
            const result = await executeToolCallViaProxy(gmail.url, gmail.token || "", parsed.originalName, { max_results: 8 });
            const content = result.content?.[0];
            if (content && "text" in content) {
              const emails = JSON.parse((content as { text: string }).text).emails || [];
              briefingContext = emails.slice(0, 5).map((e: { from?: string; subject?: string; snippet?: string }, i: number) =>
                `${i + 1}. From: ${e.from || "?"} — ${e.subject || "?"}: ${(e.snippet || "").slice(0, 150)}`
              ).join("\n");
              say(`Found ${emails.length} emails — generating podcast script…`);
            }
          }
        }
      }
      if (!briefingContext) say("No Gmail connected — generating podcast from topic instead.");
    } catch (e) {
      say(`Email fetch failed: ${(e as Error).message} — using topic only.`);
    }
  }

  // Step 1: Generate podcast script via Gemini
  say(`Writing ${style} podcast script…`);
  const scriptPrompt = buildScriptPrompt(topic, style, briefingContext);

  let script: Array<{ host: string; text: string }>;
  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: scriptPrompt }] }],
      }),
    });
    if (!resp.ok) return `Script generation failed: ${resp.status}`;
    const payload = await resp.json();
    const rawText = payload.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    script = parseScript(rawText, style);
    if (script.length === 0) return "Script generation returned no usable segments.";
    say(`Script ready — ${script.length} segments. Generating audio…`);
  } catch (e) {
    return `Script failed: ${(e as Error).message}`;
  }

  // Step 2: Merge script into one text per host, generate combined audio
  // This produces 1 card (solo) or 2 cards (duo/interview) instead of N per-segment cards.
  const voiceA = "chatterbox-tts";
  const voiceB = "gemini-tts";

  if (style === "solo") {
    // Solo: one combined narration
    const fullText = script.map((s) => s.text).join(" \n\n ");
    say(`Generating narration (${fullText.split(/\s+/).length} words)…`);
    try {
      const result = await runInference({ capability: voiceB, prompt: fullText, params: { text: fullText } });
      const r = result as Record<string, unknown>;
      const data = (r.data ?? r) as Record<string, unknown>;
      const audioUrl = (r.audio_url as string) ?? (data.audio as { url: string })?.url ?? (data.audio_file as { url: string })?.url;
      if (audioUrl) {
        const refId = `podcast-${Date.now()}`;
        canvas.addCard({ type: "audio", title: `Podcast: ${topic.slice(0, 30)}`, refId });
        canvas.updateCard(canvas.cards[canvas.cards.length - 1].id, { url: audioUrl, capability: voiceB });
        return `Podcast ready: ${refId}. One audio track on the canvas.`;
      }
    } catch (e) { return `Narration failed: ${(e as Error).message}`; }
    return "Podcast generation failed.";
  }

  // Duo/interview: merge all lines into a conversation script, generate per-host
  const hostALines = script.filter((s) => s.host === "A" || s.host === "Host" || s.host === "Interviewer").map((s) => s.text);
  const hostBLines = script.filter((s) => s.host === "B" || s.host === "Guest").map((s) => s.text);
  const audioCards: string[] = [];

  // Generate full conversation as interleaved segments — 2-3 combined chunks
  // Each chunk contains multiple exchanges to keep it natural
  const chunkSize = Math.ceil(script.length / 3);
  for (let chunk = 0; chunk < 3; chunk++) {
    const start = chunk * chunkSize;
    const end = Math.min(start + chunkSize, script.length);
    const chunkSegments = script.slice(start, end);
    if (chunkSegments.length === 0) continue;

    // Combine into conversation text for one TTS call
    const combinedText = chunkSegments.map((s) => {
      const label = s.host === "A" ? "" : ""; // No labels — just natural speech flow
      return `${label}${s.text}`;
    }).join(" ... ");

    // Alternate voices per chunk for variety
    const cap = chunk % 2 === 0 ? voiceA : voiceB;
    const chunkLabel = `Part ${chunk + 1}`;
    say(`Generating ${chunkLabel} (${combinedText.split(/\s+/).length} words)…`);

    try {
      const result = await runInference({ capability: cap, prompt: combinedText, params: { text: combinedText } });
      const r = result as Record<string, unknown>;
      const data = (r.data ?? r) as Record<string, unknown>;
      const audioUrl = (r.audio_url as string) ?? (data.audio as { url: string })?.url ?? (data.audio_file as { url: string })?.url;
      if (audioUrl) {
        const refId = `podcast-${chunk + 1}-${Date.now()}`;
        const card = canvas.addCard({ type: "audio", title: `Podcast ${chunkLabel}: ${topic.slice(0, 20)}`, refId });
        canvas.updateCard(card.id, { url: audioUrl, capability: cap });
        if (audioCards.length > 0) canvas.addEdge(audioCards[audioCards.length - 1], refId, { action: "podcast" });
        audioCards.push(refId);
      }
    } catch (e) {
      say(`${chunkLabel} failed: ${(e as Error).message?.slice(0, 80)}`);
    }
  }

  if (audioCards.length === 0) return "Podcast generation failed — no audio created.";
  return `Podcast complete! ${audioCards.length} audio track${audioCards.length > 1 ? "s" : ""} on the canvas.`;
}

function buildScriptPrompt(topic: string, style: "solo" | "duo" | "interview", briefingContext: string): string {
  const emailBlock = briefingContext
    ? `\n\nHere are today's emails to discuss:\n${briefingContext}\n\nBase the conversation on these emails — summarize key points, highlight urgent items, add casual commentary.`
    : "";

  if (style === "solo") {
    return `Write a solo podcast narration about: "${topic}"${emailBlock}

Rules:
- 4-6 paragraphs, each 2-3 sentences
- Natural speaking style — not formal essay
- Vary pace: some paragraphs are reflective, some energetic
- Include occasional rhetorical questions
- Under 500 words total

Output STRICT format — one paragraph per line, no labels:
First paragraph here.
Second paragraph here.
Third paragraph here.`;
  }

  if (style === "interview") {
    return `Write a podcast interview script about: "${topic}"${emailBlock}

Rules:
- Interviewer asks curious, probing questions
- Guest gives insightful, specific answers with examples
- 8-10 exchanges total
- Natural conversation — not scripted-sounding
- Include follow-up questions based on answers
- Under 600 words total

Output STRICT format — alternating A: and B: labels:
A: Opening question here?
B: Answer here with specific detail.
A: Follow-up question?
B: Deeper answer.`;
  }

  // duo (default)
  return `Write a two-host podcast conversation about: "${topic}"${emailBlock}

Rules:
- Two hosts (A and B) having a natural conversation
- They build on each other's points, sometimes lightly disagree
- Include reactions: "Oh interesting!", "Right, exactly", "Wait, really?"
- 8-12 exchanges total
- Each line is 1-3 sentences (keeps TTS natural)
- Under 600 words total
- Casual, engaging, like friends talking

Output STRICT format — alternating A: and B: labels:
A: Hey, so today we're talking about...
B: Yeah, this is fascinating because...
A: Oh interesting, I didn't know that.
B: Right? And there's more...`;
}

function parseScript(raw: string, style: "solo" | "duo" | "interview"): Array<{ host: string; text: string }> {
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);

  if (style === "solo") {
    // Each non-empty line is a paragraph
    return lines
      .filter((l) => !l.startsWith("```") && !l.startsWith("#"))
      .slice(0, 8)
      .map((text) => ({ host: "Host", text }));
  }

  // duo / interview — parse A: and B: labels
  const segments: Array<{ host: string; text: string }> = [];
  for (const line of lines) {
    const match = line.match(/^([AB]):\s*(.+)/i);
    if (match) {
      segments.push({ host: match[1].toUpperCase(), text: match[2] });
    } else if (line.match(/^(Host\s*[AB12]|Interviewer|Guest):\s*/i)) {
      const m = line.match(/^[^:]+:\s*(.+)/);
      if (m) {
        const isA = /^(Host\s*[A1]|Interviewer)/i.test(line);
        segments.push({ host: isA ? "A" : "B", text: m[1] });
      }
    }
  }

  // Fallback: if no labels found, alternate lines
  if (segments.length === 0) {
    return lines.slice(0, 12).map((text, i) => ({ host: i % 2 === 0 ? "A" : "B", text }));
  }

  return segments.slice(0, 14);
}

/**
 * /music <description> — generate a music track
 * /sfx <description> — generate a sound effect
 */
/**
 * /music <description> — generate music via minimax-music/v2
 * Requires: prompt (style description) + lyrics_prompt (song lyrics/structure)
 * If user provides just a description, we auto-generate lyrics structure.
 *
 * /sfx <description> --video <card> — generate sound effects for a video via mmaudio-v2
 * Requires: video_url + prompt
 */
async function handleMusic(args: string, isSfx = false): Promise<string> {
  if (!args.trim()) {
    return isSfx
      ? [
          "Usage: /sfx <description> --video <card>",
          "",
          "Generates audio/sound effects for an existing video card.",
          "Example: /sfx thunderstorm with rain --video vid-1",
        ].join("\n")
      : [
          "Usage: /music <style description>",
          "       /music <style> --lyrics <lyrics text>",
          "",
          "Examples:",
          "  /music upbeat electronic, energetic, 120bpm",
          "  /music lo-fi chill hip hop, rainy day vibes",
          '  /music pop ballad --lyrics [Verse] Walking through the rain [Chorus] You light up my world',
        ].join("\n");
  }

  const { runInference } = await import("@/lib/sdk/client");
  const { extractFalError } = await import("@/lib/tools/compound-tools");
  const { useChatStore } = await import("@/lib/chat/store");
  const canvas = useCanvasStore.getState();
  const say = (msg: string) => useChatStore.getState().addMessage(msg, "system");

  if (isSfx) {
    // SFX: requires video_url
    const videoMatch = args.match(/--video\s+(\S+)/i);
    if (!videoMatch) return "Usage: /sfx <description> --video <card>\nmmaudio requires a video input.";
    const videoRef = videoMatch[1];
    const videoCard = canvas.cards.find((c) => c.refId === videoRef);
    if (!videoCard?.url) return `Video card "${videoRef}" not found or has no URL.`;
    const prompt = args.replace(/--video\s+\S+/i, "").trim();
    if (!prompt) return "Provide a description of the sound (e.g., /sfx ocean waves crashing --video vid-1)";

    say(`Generating sound effects for "${videoRef}": "${prompt.slice(0, 40)}"…`);
    try {
      const result = await runInference({
        capability: "sfx",
        prompt,
        params: { prompt, video_url: videoCard.url },
      });
      const r = result as Record<string, unknown>;
      const data = (r.data ?? r) as Record<string, unknown>;
      const audioUrl = (r.audio_url as string) ?? (data.audio as { url: string })?.url ?? (data.audio_file as { url: string })?.url;
      const falError = extractFalError(data);
      if (falError) return `/sfx failed: ${falError}`;
      if (!audioUrl) return "/sfx returned no audio.";

      const refId = `sfx-${Date.now()}`;
      const card = canvas.addCard({ type: "audio", title: `SFX: ${prompt.slice(0, 25)}`, refId });
      canvas.updateCard(card.id, { url: audioUrl, capability: "sfx" });
      canvas.addEdge(videoRef, refId, { action: "sfx" });
      return `Sound effect created: ${refId} (linked to ${videoRef})`;
    } catch (e) {
      return `/sfx failed: ${e instanceof Error ? e.message : "unknown"}`;
    }
  }

  // Music: minimax-music/v2 requires prompt + lyrics_prompt
  const lyricsMatch = args.match(/--lyrics\s+([\s\S]+)/i);
  const stylePrompt = args.replace(/--lyrics\s+[\s\S]+/i, "").trim();
  // Auto-generate lyrics structure if not provided
  const lyrics = lyricsMatch?.[1]?.trim()
    || `[Intro]\n[Verse]\n${stylePrompt}\n[Chorus]\n${stylePrompt}\n[Outro]`;

  say(`Generating music: "${stylePrompt.slice(0, 40)}"…`);
  try {
    const result = await runInference({
      capability: "music",
      prompt: stylePrompt,
      params: { prompt: stylePrompt, lyrics_prompt: lyrics },
    });
    const r = result as Record<string, unknown>;
    const data = (r.data ?? r) as Record<string, unknown>;
    const audioUrl = (r.audio_url as string)
      ?? (data.audio as { url: string })?.url
      ?? (data.audio_file as { url: string })?.url;
    const falError = extractFalError(data);
    if (falError) return `/music failed: ${falError}`;
    if (!audioUrl) return "/music returned no audio.";

    const refId = `music-${Date.now()}`;
    const card = canvas.addCard({ type: "audio", title: `Music: ${stylePrompt.slice(0, 25)}`, refId });
    canvas.updateCard(card.id, { url: audioUrl, capability: "music" });
    return `Music created: ${refId}`;
  } catch (e) {
    return `/music failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
}

/**
 * /mix <video-card> <audio-card> — combine video + audio into one track.
 * Video loops if shorter than audio. Audio loops if shorter than video.
 */
async function handleMix(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    return [
      "Usage: /mix <video-card> <audio-card>",
      "",
      "Combines a video and audio card into one video with sound.",
      "The shorter track loops to match the longer one.",
      "",
      "Example: /mix vid-1 music-1",
      "         /mix vid-2 aud-talk-3",
    ].join("\n");
  }

  const [videoRef, audioRef] = parts;
  const canvas = useCanvasStore.getState();
  const videoCard = canvas.cards.find((c) => c.refId === videoRef);
  const audioCard = canvas.cards.find((c) => c.refId === audioRef);

  if (!videoCard?.url) return `Video card "${videoRef}" not found or has no URL.`;
  if (!audioCard?.url) return `Audio card "${audioRef}" not found or has no URL.`;

  const { useChatStore } = await import("@/lib/chat/store");
  const say = (msg: string) => useChatStore.getState().addMessage(msg, "system");

  say(`Mixing "${videoRef}" + "${audioRef}"… (this takes a few seconds)`);

  try {
    const { mixVideoAudio } = await import("@livepeer/creative-kit");
    const blobUrl = await mixVideoAudio({
      videoUrl: videoCard.url,
      audioUrl: audioCard.url,
      maxDuration: 60,
      onProgress: (pct) => {
        if (Math.round(pct * 100) % 25 === 0 && pct > 0 && pct < 1) {
          say(`Mixing… ${Math.round(pct * 100)}%`);
        }
      },
    });

    const refId = `mix-${Date.now()}`;
    const card = canvas.addCard({ type: "video", title: `Mix: ${videoRef} + ${audioRef}`, refId });
    canvas.updateCard(card.id, { url: blobUrl });
    canvas.addEdge(videoRef, refId, { action: "mix" });
    canvas.addEdge(audioRef, refId, { action: "mix" });

    return `Mixed video created: ${refId}. Video + audio combined into one track.`;
  } catch (e) {
    return `/mix failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
}
