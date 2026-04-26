/**
 * Episode Animator — turns an episode of images into a cohesive video.
 *
 * Pipeline: Gather → Analyze → Prompt → Animate → Stitch → Upload
 *
 * Controlled by a skill file (public/skills/episode-director.md) that
 * defines motion prompt rules, model selection, duration, transitions.
 * Swap the skill → change the production style.
 */

import { useEpisodeStore } from "./store";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import type { Card } from "@/lib/canvas/types";

export interface AnimateEpisodeOptions {
  episodeId: string;
  /** "per-clip" = animate each card separately then stitch. "multi-keyframe" = future. */
  approach?: "per-clip" | "multi-keyframe";
  /** Model override (default: from skill analysis) */
  model?: string;
  /** Music card ID to mix into final video */
  musicCardId?: string;
  /** "cinematic" | "fast" | custom skill name */
  style?: string;
}

export interface AnimateEpisodeResult {
  videoUrl: string;
  duration: number;
  clipCount: number;
  model: string;
  cardId: string;
}

/** Detect content type from a card for duration selection. */
function detectContentType(card: Card): string {
  const prompt = (card.prompt || card.title || "").toLowerCase();
  if (/title|text|logo|brand|intro|outro/.test(prompt)) return "title";
  if (/landscape|panorama|wide|establishing|aerial|skyline/.test(prompt)) return "establishing";
  if (/person|portrait|face|character|woman|man|girl|boy/.test(prompt)) return "character";
  if (/action|fight|run|chase|explod|battle|fast/.test(prompt)) return "action";
  if (/detail|close.up|macro|texture/.test(prompt)) return "detail";
  if (/emotion|dramatic|climax|epic|breathtaking/.test(prompt)) return "emotional";
  return "establishing"; // default
}

/** Get duration for a content type (from skill rules). */
function getDuration(contentType: string): number {
  const map: Record<string, number> = {
    title: 5, establishing: 10, character: 8,
    action: 7, detail: 6, emotional: 12,
  };
  return map[contentType] || 10;
}

/** Build motion prompt for a card. */
function buildMotionPrompt(card: Card, cohesionPrefix: string, contentType: string): string {
  const motionMap: Record<string, string> = {
    title: "subtle zoom in, elegant reveal",
    establishing: "slow cinematic pan, sweeping camera movement",
    character: "gentle push in, shallow depth of field, subtle movement",
    action: "dynamic tracking shot, energetic camera movement",
    detail: "slow drift, rack focus, intimate perspective",
    emotional: "slow dolly in, dramatic atmosphere, lingering moment",
  };

  const motion = motionMap[contentType] || "slow cinematic movement";
  const cardContext = card.prompt ? card.prompt.split(",").slice(0, 2).join(",").trim() : "";

  // Keep under 25 words: cohesion prefix + motion + brief context
  return `${cohesionPrefix}, ${motion}${cardContext ? `, ${cardContext}` : ""}`.slice(0, 200);
}

/** Select model based on style. */
function selectModel(style?: string): string {
  if (style === "fast") return "seedance-i2v-fast";
  if (style === "cinematic" || style === "premium") return "seedance-i2v";
  return "seedance-i2v"; // default
}

/**
 * Animate an entire episode into one cohesive video.
 *
 * Steps:
 * 1. Gather image cards from episode in order
 * 2. Analyze first card for overall style (cohesion prefix)
 * 3. Build per-card motion prompts
 * 4. Animate all cards in parallel
 * 5. Stitch clips into final video with transitions
 * 6. Upload to GCS for persistence
 * 7. Add final video card to canvas, linked to episode
 */
export async function animateEpisode(opts: AnimateEpisodeOptions): Promise<AnimateEpisodeResult | null> {
  const say = useChatStore.getState().addMessage;
  const update = useChatStore.getState().updateMessage;

  const store = useEpisodeStore.getState();
  const episode = store.getEpisode(opts.episodeId);
  if (!episode) { say("Episode not found.", "system"); return null; }

  const canvas = useCanvasStore.getState();
  const imageCards = episode.cardIds
    .map((id) => canvas.cards.find((c) => c.id === id))
    .filter((c): c is Card => !!c && c.type === "image" && !!c.url);

  if (imageCards.length === 0) { say("No images in this episode to animate.", "system"); return null; }

  const model = opts.model || selectModel(opts.style);
  const progressMsg = say(`Animating "${episode.name}" — ${imageCards.length} cards with ${model}...`, "system");

  // Step 1: Analyze first card for cohesion prefix
  let cohesionPrefix = "cinematic, dramatic lighting";
  try {
    const { analyzeImage } = await import("@/lib/tools/image-analysis");
    const analysis = await analyzeImage(imageCards[0].url!);
    if (analysis.ok) {
      cohesionPrefix = [
        analysis.analysis.style,
        analysis.analysis.palette ? `palette: ${analysis.analysis.palette}` : "",
        analysis.analysis.mood || "",
      ].filter(Boolean).join(", ");
      update(progressMsg.id, `Analyzing "${episode.name}" — style: ${analysis.analysis.style}`);
    }
  } catch {
    // Use default cohesion prefix
  }

  // Step 2: Build animation steps
  const steps = imageCards.map((card) => {
    const contentType = detectContentType(card);
    const duration = getDuration(contentType);
    const prompt = buildMotionPrompt(card, cohesionPrefix, contentType);
    return {
      action: "animate" as const,
      source_url: card.url!,
      prompt,
      duration,
      model_override: model,
    };
  });

  update(progressMsg.id, `Animating "${episode.name}" — ${steps.length} clips in parallel...`);

  // Step 3: Animate all in parallel via create_media
  let clipUrls: string[] = [];
  try {
    const { executeTool } = await import("@/lib/tools/registry");
    const result = await executeTool("create_media", { steps });
    const data = result?.data as { results?: Array<{ url?: string }> } | undefined;
    clipUrls = (data?.results || []).map((r) => r.url).filter((u): u is string => !!u);
  } catch (e) {
    update(progressMsg.id, `Animation failed: ${(e as Error).message?.slice(0, 80)}`);
    return null;
  }

  if (clipUrls.length === 0) {
    update(progressMsg.id, `No clips generated. Check model availability.`);
    return null;
  }

  update(progressMsg.id, `Stitching ${clipUrls.length} clips into final video...`);

  // Step 4: Stitch clips into one video
  let finalUrl: string;
  let totalDuration: number;
  try {
    const { renderProject } = await import("@livepeer/creative-kit");
    const musicUrl = opts.musicCardId
      ? canvas.cards.find((c) => c.id === opts.musicCardId)?.url
      : undefined;

    const renderCards = clipUrls.map((url, i) => ({
      refId: `clip-${i}`, url, type: "video" as const,
    }));

    const renderResult = await renderProject({
      cards: renderCards,
      musicSource: musicUrl,
      transition: "crossfade",
      transitionDuration: 0.5,
      onProgress: (pct) => {
        update(progressMsg.id, `Stitching... ${Math.round(pct * 100)}%`);
      },
    });

    finalUrl = renderResult.url;
    totalDuration = renderResult.duration;

    // Upload to GCS for persistence
    try {
      const blob = await fetch(finalUrl).then((r) => r.blob());
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((r) => { reader.onload = () => r(reader.result as string); reader.readAsDataURL(blob); });
      const resp = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl, fileName: `${episode.name}-video.webm` }) });
      if (resp.ok) { const d = await resp.json(); if (d.url) finalUrl = d.url; }
    } catch { /* keep blob URL */ }
  } catch (e) {
    update(progressMsg.id, `Stitching failed: ${(e as Error).message?.slice(0, 80)}`);
    return null;
  }

  // Step 5: Add final video card to canvas
  const refId = `ep-video-${Date.now()}`;
  const videoCard = useCanvasStore.getState().addCard({
    type: "video",
    title: `${episode.name} — ${clipUrls.length} clips (${totalDuration.toFixed(0)}s)`,
    refId,
    url: finalUrl,
  });

  // Link to source cards
  for (const card of imageCards) {
    useCanvasStore.getState().addEdge(card.refId, refId, { action: "episode-animate" });
  }

  update(progressMsg.id,
    `"${episode.name}" animated — ${clipUrls.length} clips, ${totalDuration.toFixed(1)}s video. Card: ${refId}`
  );

  // Auto-download
  const a = document.createElement("a"); a.href = finalUrl; a.download = `${episode.name}-video.webm`; a.click();

  return {
    videoUrl: finalUrl,
    duration: totalDuration,
    clipCount: clipUrls.length,
    model,
    cardId: videoCard.id,
  };
}
