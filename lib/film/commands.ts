import { useFilmStore } from "./store";
import { generateFilm } from "./generator";
import { FILM_SKILLS, setActiveFilmSkill, getActiveFilmSkill, detectFilmSkill } from "./film-prompt";
import type { Film } from "./types";
import { createTracker } from "@/lib/utils/execution-tracker";
import { setActiveWork } from "@/lib/agents/conversation-context";

export const FILM_CARD_MARKER = "@@film@@";
export const FILM_CARD_END = "@@/film@@";

export function renderFilmEnvelope(film: Film): string {
  return `${FILM_CARD_MARKER}${JSON.stringify(film)}${FILM_CARD_END}`;
}

export function isFilmEnvelope(text: string): boolean {
  return text.startsWith(FILM_CARD_MARKER) && text.includes(FILM_CARD_END);
}

export function parseFilmEnvelope(text: string): Film | null {
  if (!isFilmEnvelope(text)) return null;
  try {
    return JSON.parse(text.slice(FILM_CARD_MARKER.length, text.indexOf(FILM_CARD_END))) as Film;
  } catch { return null; }
}

export async function handleFilmCommand(args: string): Promise<string> {
  const trimmed = args.trim();
  const [sub, ...rest] = trimmed.split(/\s+/);
  const restArgs = rest.join(" ").trim();
  const lower = sub?.toLowerCase() ?? "";

  if (!trimmed) return filmHelp();
  if (lower === "list") return filmList();
  if (lower === "show") return filmShow(restArgs);
  if (lower === "apply") return filmApply(restArgs);
  if (lower === "load") return filmLoad(restArgs);
  if (lower === "skills") return filmSkillsList();
  if (lower === "remove" || lower === "delete") {
    const film = useFilmStore.getState().getById(restArgs);
    if (!film) return `No film with id "${restArgs}"`;
    useFilmStore.getState().remove(film.id);
    return `Removed "${film.title}".`;
  }

  return filmGenerate(trimmed);
}

function filmHelp(): string {
  return [
    "Usage:",
    "  /film <concept>         — generate a 4-shot mini-film from a short idea",
    "  /film list              — show your recent films",
    "  /film show <id>         — re-display a saved film",
    "  /film apply [id]        — apply: generate images → animate each to video",
    "  /film/load hifi         — use HiFi pipeline (GPT Image 2 → Seedance 2.0)",
    "  /film/load auto         — reset to auto-detect mode",
    "  /film skills            — list available film styles",
    "  /film remove <id>       — delete a film",
    "",
    "After /film generates shots, type \"apply them\" or click Apply.",
    "HiFi mode auto-activates for cartoon/anime/illustration styles.",
  ].join("\n");
}

function filmLoad(skillId: string): string {
  if (!skillId) {
    const current = getActiveFilmSkill();
    const lines = ["Film skills available:"];
    for (const [id, s] of Object.entries(FILM_SKILLS)) {
      const active = id === current ? " ← active" : "";
      lines.push(`  /film/load ${id.padEnd(14)} ${s.name}${active}`);
    }
    lines.push("");
    lines.push(current ? `Current: ${current}. Use /film/load <name> to switch.` : "No skill loaded — agent auto-detects from your prompt.");
    return lines.join("\n");
  }
  const lower = skillId.toLowerCase();
  if (lower === "none" || lower === "auto" || lower === "reset") {
    setActiveFilmSkill(null);
    return "Film skill cleared — agent will auto-detect from prompt keywords.";
  }
  const skill = FILM_SKILLS[lower];
  if (!skill) {
    return `Unknown film skill "${skillId}". Available: ${Object.keys(FILM_SKILLS).join(", ")}`;
  }
  setActiveFilmSkill(lower);
  return `Loaded film skill: **${skill.name}**\nStyle: ${skill.styleHint}\n\nNext /film command will use this style. Use /film/load auto to reset.`;
}

function filmSkillsList(): string {
  return filmLoad("");
}

function filmList(): string {
  const items = useFilmStore.getState().listRecent(10);
  if (items.length === 0) return "No films yet. Try `/film <your idea>`.";
  const lines = ["Your films:"];
  for (const f of items) {
    const icon = f.status === "applied" ? "✓" : "→";
    lines.push(`  ${icon} ${f.ageLabel.padStart(4)} ${f.id.slice(0, 18)}  ${f.title} (${f.shotCount} shots)`);
  }
  return lines.join("\n");
}

function filmShow(id: string): string {
  if (!id) return "Usage: /film show <id>";
  const film = useFilmStore.getState().getById(id);
  if (!film) return `No film with id "${id}"`;
  useFilmStore.getState().setPending(film.id);
  return renderFilmEnvelope(film);
}

async function filmGenerate(prompt: string): Promise<string> {
  const tracker = createTracker("/film");
  const result = await generateFilm(prompt);
  if (!result.ok) return `Film director: ${result.error}`;
  if (result.tokens) tracker.trackLLM(result.tokens.input, result.tokens.output);
  tracker.announce();
  const film = useFilmStore.getState().addFilm(result.film);
  setActiveWork("film", film.id, film.title,
    `${film.shots.length}-shot film: ${film.style}. Character: ${film.characterLock}`);
  return renderFilmEnvelope(film);
}

/** Detect whether to use the hifi pipeline (GPT Image 2 → Seedance 2.0). */
function isHifiMode(film: Film): boolean {
  const skill = getActiveFilmSkill();
  if (skill === "hifi") return true;
  // Auto-detect from film prompt or style
  const detected = detectFilmSkill(film.originalPrompt);
  if (detected === "hifi") return true;
  // Also detect from style keywords
  const style = film.style.toLowerCase();
  return /\b(cartoon|anime|illustration|comic|children|pixar|ghibli|cel.shad|manga)\b/.test(style);
}

async function filmApply(idOrEmpty: string): Promise<string> {
  const tracker = createTracker("/film apply");
  const store = useFilmStore.getState();
  const film = idOrEmpty ? store.getById(idOrEmpty) : store.getPending();
  if (!film) return idOrEmpty ? `No film "${idOrEmpty}".` : "No pending film. Try /film <idea> first.";

  const hifi = isHifiMode(film);
  const pipelineLabel = hifi ? "HiFi (GPT Image → Seedance)" : "Standard (flux-dev → Seedance)";

  // 1. Set CreativeContext
  try {
    const { useSessionContext } = await import("@/lib/agents/session-context");
    useSessionContext.getState().setContext(film.context);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("storyboard:creative-context-autoseeded", "1");
    }
  } catch { /* non-fatal */ }

  // 2. Generate key frames
  //    HiFi mode: use gpt-image for each shot (better text, character consistency)
  //    Standard:  use project_create + project_generate (flux-dev batch)
  const keyFrameCards: Array<{ refId: string; url: string }> = [];

  if (hifi) {
    // HiFi pipeline: GPT Image 2 per shot — sequential for consistency
    const { runInference } = await import("@/lib/sdk/client");
    const { useCanvasStore } = await import("@/lib/canvas/store");
    const canvas = useCanvasStore.getState();

    for (const shot of film.shots) {
      const prompt = `${film.characterLock}, ${shot.description}, ${film.style}, single frame, no text overlay, composition ready for animation`.slice(0, 500);
      const refId = `hifi-${film.id.slice(0, 8)}-${shot.index}`;
      const card = canvas.addCard({ type: "image", title: shot.title, refId });

      try {
        tracker.trackTool("gpt-image", true);
        const result = await runInference({
          capability: "gpt-image",
          prompt,
          params: { size: "1024x1024" },
        });
        const r = result as Record<string, unknown>;
        const data = (r.data ?? r) as Record<string, unknown>;
        const images = data.images as Array<{ url: string }> | undefined;
        const url = (r.image_url as string) ?? images?.[0]?.url ?? (data.url as string);
        if (url) {
          canvas.updateCard(card.id, { url, capability: "gpt-image" });
          keyFrameCards.push({ refId: card.refId, url });
        } else {
          canvas.updateCard(card.id, { error: "GPT Image returned no URL" });
        }
      } catch (e) {
        canvas.updateCard(card.id, { error: `GPT Image failed: ${(e as Error).message?.slice(0, 80)}` });
      }
    }
  } else {
    // Standard pipeline: project_create + project_generate (flux-dev batch)
    const scenes = film.shots.map((s) => ({
      index: s.index - 1,
      title: s.title.slice(0, 50),
      prompt: `${film.characterLock}, ${s.description}, ${film.style}`.slice(0, 400),
      action: "generate" as const,
    }));

    try {
      const { listTools } = await import("@/lib/tools/registry");
      const tools = listTools();
      const createTool = tools.find((t) => t.name === "project_create");
      const genTool = tools.find((t) => t.name === "project_generate");
      if (!createTool || !genTool) return "Apply failed: project tools not registered.";

      tracker.trackTool("project_create", true);
      const createResult = await createTool.execute({
        brief: `Film: ${film.title} — ${film.style}`,
        scenes,
        style_guide: {
          visual_style: film.style,
          prompt_prefix: `${film.style}, ${film.characterLock}, `,
          mood: film.context.mood,
        },
      });
      if (!createResult.success) return `Apply failed: ${createResult.error}`;
      const projectId = (createResult.data as Record<string, unknown>)?.project_id as string;
      if (!projectId) return "Apply failed: no project ID returned.";

      tracker.trackTool("project_generate", true);
      await genTool.execute({ project_id: projectId });

      // Collect generated card URLs for animation step
      const { useProjectStore } = await import("@/lib/projects/store");
      const { useCanvasStore } = await import("@/lib/canvas/store");
      const proj = useProjectStore.getState().getProject(projectId);
      if (proj) {
        const canvasState = useCanvasStore.getState();
        for (const scene of proj.scenes) {
          const card = canvasState.cards.find((c) => c.refId === scene.cardRefId);
          if (card?.url) keyFrameCards.push({ refId: card.refId, url: card.url });
        }
      }
    } catch (e) {
      return `Apply failed: ${e instanceof Error ? e.message : "unknown"}`;
    }
  }

  // 3. Animate each key frame to video via Seedance 2.0.
  //    Seedance produces up to 15s clips with synchronized audio.
  let animatedCount = 0;
  try {
    const { listTools } = await import("@/lib/tools/registry");
    const createMediaTool = listTools().find((t) => t.name === "create_media");
    if (createMediaTool) {
      for (let si = 0; si < keyFrameCards.length && si < film.shots.length; si++) {
        const kf = keyFrameCards[si];
        if (!kf.url) continue;
        const shot = film.shots[si];
        const motionPrompt = hifi
          ? `${shot.camera}, subtle cinematic motion, ${film.style}`.slice(0, 200)
          : `${shot.camera}, ${shot.description}, ${film.style}`.slice(0, 300);
        try {
          await createMediaTool.execute({
            steps: [{
              action: "animate",
              source_url: kf.url,
              prompt: motionPrompt,
              duration: shot.duration || 10,
            }],
          });
          animatedCount++;
        } catch { /* individual animation failure — continue */ }
      }
    }
  } catch { /* animation phase failure — key frames still created */ }

  // 4. Organize
  try {
    const { listTools } = await import("@/lib/tools/registry");
    const orgTool = listTools().find((t) => t.name === "canvas_organize");
    if (orgTool) await orgTool.execute({ mode: "narrative" });
  } catch { /* non-fatal */ }

  useFilmStore.getState().markApplied(film.id);
  useFilmStore.getState().setPending(null);
  tracker.announce();

  const shotSummary = film.shots.map((s) => `${s.index}. **${s.title}** [${s.camera}]`).join("\n");
  return `🎬 "${film.title}" applied (${pipelineLabel}) — ${keyFrameCards.length} key frames + ${animatedCount} video clips on the canvas.\n\n${shotSummary}`;
}

// Natural-language apply detection
const APPLY_PHRASES = [
  /^\s*(apply|yes|do it|go|proceed|let'?s go|ship it|looks good|i like (it|them)|perfect)\s*[.!]*\s*$/i,
];

export function isFilmApplyIntent(text: string): boolean {
  if (text.length > 60) return false;
  if (!useFilmStore.getState().getPending()) return false;
  return APPLY_PHRASES.some((re) => re.test(text.trim()));
}

export async function applyPendingFilm(): Promise<string> {
  return filmApply("");
}
