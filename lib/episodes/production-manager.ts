/**
 * Episode Production Manager — orchestrates high-quality video production.
 *
 * Three phases:
 *   1. PLAN: analyze cards, build prompts, LLM review for quality/consistency
 *   2. PRODUCE: animate clips with state tracking, generate transitions
 *   3. ASSEMBLE: stitch clips + transitions + soundtrack into final video
 *
 * Each phase is observable — the manager emits status updates and maintains
 * per-clip state so the UI can show production progress.
 */

import { useEpisodeStore } from "./store";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import type { Card } from "@/lib/canvas/types";

// ── Types ──

export type ClipStatus = "pending" | "analyzing" | "animating" | "done" | "failed" | "transition";

export interface ClipState {
  index: number;
  sourceCard: Card;
  /** Motion prompt (built from analysis + skill) */
  prompt: string;
  /** Content type (establishing, character, action, etc.) */
  contentType: string;
  /** Duration in seconds */
  duration: number;
  /** Video URL after animation */
  videoUrl?: string;
  /** Transition video URL (morph from this clip to next) */
  transitionUrl?: string;
  status: ClipStatus;
  error?: string;
}

export interface ProductionState {
  episodeId: string;
  episodeName: string;
  /** Overall cohesion prompt (from LLM analysis) */
  cohesionPrompt: string;
  /** Soundtrack description (for music generation) */
  soundtrackPrompt: string;
  /** Soundtrack URL */
  soundtrackUrl?: string;
  /** Per-clip states */
  clips: ClipState[];
  /** Final assembled video URL */
  finalVideoUrl?: string;
  /** Phase */
  phase: "planning" | "reviewing" | "producing" | "assembling" | "done" | "failed";
  model: string;
}

export interface ProductionOptions {
  episodeId: string;
  model?: string;
  style?: string;
  /** Generate transitions between clips (veo-transition) */
  withTransitions?: boolean;
  /** Generate soundtrack */
  withSoundtrack?: boolean;
  /** Skip LLM review step (faster, lower quality) */
  skipReview?: boolean;
}

// ── Helpers ──

function detectContentType(card: Card): string {
  const prompt = (card.prompt || card.title || "").toLowerCase();
  if (/title|text|logo|brand|intro|outro/.test(prompt)) return "title";
  if (/landscape|panorama|wide|establishing|aerial|skyline/.test(prompt)) return "establishing";
  if (/person|portrait|face|character|woman|man|girl|boy/.test(prompt)) return "character";
  if (/action|fight|run|chase|explod|battle|fast/.test(prompt)) return "action";
  if (/detail|close.up|macro|texture/.test(prompt)) return "detail";
  if (/emotion|dramatic|climax|epic|breathtaking/.test(prompt)) return "emotional";
  return "establishing";
}

function getDuration(contentType: string): number {
  return { title: 5, establishing: 10, character: 8, action: 7, detail: 6, emotional: 12 }[contentType] || 10;
}

function getMotionStyle(contentType: string): string {
  return {
    title: "subtle zoom in, elegant reveal",
    establishing: "slow cinematic pan, sweeping camera",
    character: "gentle push in, shallow depth of field",
    action: "dynamic tracking shot, energetic movement",
    detail: "slow drift, rack focus",
    emotional: "slow dolly in, dramatic atmosphere",
  }[contentType] || "slow cinematic movement";
}

function selectModel(style?: string): string {
  if (style === "fast") return "seedance-i2v-fast";
  return "seedance-i2v";
}

// ── Production Manager ──

/**
 * Run the full production pipeline for an episode.
 *
 * Returns the production state (observable via onUpdate callback).
 */
export async function produceEpisodeVideo(
  opts: ProductionOptions,
  onUpdate?: (state: ProductionState) => void,
): Promise<ProductionState> {
  const say = useChatStore.getState().addMessage;
  const update = useChatStore.getState().updateMessage;

  const store = useEpisodeStore.getState();
  const episode = store.getEpisode(opts.episodeId);
  if (!episode) throw new Error("Episode not found");

  const canvas = useCanvasStore.getState();
  const imageCards = episode.cardIds
    .map((id) => canvas.cards.find((c) => c.id === id))
    .filter((c): c is Card => !!c && c.type === "image" && !!c.url);

  if (imageCards.length === 0) throw new Error("No images in episode");

  const model = opts.model || selectModel(opts.style);

  // Initialize production state
  const state: ProductionState = {
    episodeId: opts.episodeId,
    episodeName: episode.name,
    cohesionPrompt: "",
    soundtrackPrompt: "",
    clips: imageCards.map((card, i) => {
      const ct = detectContentType(card);
      return {
        index: i,
        sourceCard: card,
        prompt: "",
        contentType: ct,
        duration: getDuration(ct),
        status: "pending" as ClipStatus,
      };
    }),
    phase: "planning",
    model,
  };

  const emit = () => onUpdate?.({ ...state, clips: state.clips.map((c) => ({ ...c })) });
  const statusMsg = say(`🎬 Producing "${episode.name}" — ${imageCards.length} clips...`, "system");

  // ═══ PHASE 1: PLAN — analyze + build prompts ═══
  state.phase = "planning";
  emit();

  // Analyze first card for overall style
  let analysisResult: { style: string; palette: string; mood: string; description: string } | null = null;
  try {
    state.clips[0].status = "analyzing";
    emit();
    const { analyzeImage } = await import("@/lib/tools/image-analysis");
    const result = await analyzeImage(imageCards[0].url!);
    if (result.ok) {
      analysisResult = result.analysis;
      state.cohesionPrompt = [
        result.analysis.style,
        result.analysis.palette ? `palette: ${result.analysis.palette}` : "",
        result.analysis.mood || "",
      ].filter(Boolean).join(", ");
    }
    state.clips[0].status = "pending";
  } catch {}

  if (!state.cohesionPrompt) state.cohesionPrompt = "cinematic, dramatic lighting";

  // Build per-clip prompts
  for (const clip of state.clips) {
    const motion = getMotionStyle(clip.contentType);
    const cardContext = clip.sourceCard.prompt?.split(",").slice(0, 2).join(",").trim() || "";
    clip.prompt = `${state.cohesionPrompt}, ${motion}${cardContext ? `, ${cardContext}` : ""}`.slice(0, 200);
  }

  // Build soundtrack prompt from overall mood
  if (opts.withSoundtrack !== false) {
    const mood = analysisResult?.mood || "cinematic";
    const style = analysisResult?.style || "dramatic";
    state.soundtrackPrompt = `${mood} ${style} orchestral soundtrack, emotional, building tension`;
  }

  // ═══ PHASE 1.5: REVIEW — LLM checks prompt quality ═══
  if (!opts.skipReview) {
    state.phase = "reviewing";
    emit();
    update(statusMsg.id, `Reviewing prompts for "${episode.name}"...`);

    try {
      const resp = await fetch("/api/agent/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `Review these motion prompts for a cohesive video. Fix any inconsistencies in style, camera movement, or mood. Return ONLY a JSON array of improved prompts (same length as input).

Cohesion style: ${state.cohesionPrompt}

Prompts:
${state.clips.map((c, i) => `${i + 1}. [${c.contentType}, ${c.duration}s] ${c.prompt}`).join("\n")}

Soundtrack suggestion: ${state.soundtrackPrompt}

Return JSON: {"prompts": ["improved prompt 1", ...], "soundtrack": "improved soundtrack description"}`,
            }],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const review = JSON.parse(jsonMatch[0]) as { prompts?: string[]; soundtrack?: string };
          if (review.prompts && review.prompts.length === state.clips.length) {
            for (let i = 0; i < state.clips.length; i++) {
              state.clips[i].prompt = review.prompts[i].slice(0, 200);
            }
          }
          if (review.soundtrack) state.soundtrackPrompt = review.soundtrack;
        }
      }
    } catch {
      // Review failed — use original prompts (still good)
    }
  }

  emit();
  update(statusMsg.id, `Producing "${episode.name}" — animating ${state.clips.length} clips...`);

  // ═══ PHASE 2: PRODUCE — animate clips + generate transitions ═══
  state.phase = "producing";
  emit();

  // Animate all clips in parallel
  const animSteps = state.clips.map((clip) => ({
    action: "animate" as const,
    source_url: clip.sourceCard.url!,
    prompt: clip.prompt,
    duration: clip.duration,
    model_override: model,
  }));

  try {
    const { executeTool } = await import("@/lib/tools/registry");
    const result = await executeTool("create_media", { steps: animSteps });
    const data = result?.data as { results?: Array<{ url?: string; error?: string }> } | undefined;
    const results = data?.results || [];

    for (let i = 0; i < state.clips.length; i++) {
      const r = results[i];
      if (r?.url) {
        state.clips[i].videoUrl = r.url;
        state.clips[i].status = "done";
      } else {
        state.clips[i].status = "failed";
        state.clips[i].error = r?.error || "No output";
      }
    }
  } catch (e) {
    for (const clip of state.clips) {
      if (clip.status !== "done") clip.status = "failed";
    }
  }

  emit();

  const doneClips = state.clips.filter((c) => c.status === "done" && c.videoUrl);
  if (doneClips.length === 0) {
    state.phase = "failed";
    update(statusMsg.id, `Production failed — no clips generated.`);
    emit();
    return state;
  }

  // Generate transitions between consecutive clips (optional, uses veo-transition)
  if (opts.withTransitions && doneClips.length >= 2) {
    update(statusMsg.id, `Generating ${doneClips.length - 1} transitions...`);
    for (let i = 0; i < doneClips.length - 1; i++) {
      try {
        const { executeTool } = await import("@/lib/tools/registry");
        // veo-transition takes two image URLs and morphs between them
        const r = await executeTool("create_media", {
          steps: [{
            action: "generate",
            prompt: `smooth cinematic transition, morphing, ${state.cohesionPrompt}`,
            model_override: "veo-transition",
            source_url: doneClips[i].sourceCard.url,
          }],
        });
        const tData = r?.data as { results?: Array<{ url?: string }> };
        if (tData?.results?.[0]?.url) {
          doneClips[i].transitionUrl = tData.results[0].url;
        }
      } catch { /* transitions are optional */ }
    }
    emit();
  }

  // Generate soundtrack (optional)
  if (opts.withSoundtrack !== false && state.soundtrackPrompt) {
    update(statusMsg.id, `Generating soundtrack...`);
    try {
      const { runInference } = await import("@/lib/sdk/client");
      const musicResult = await runInference({
        capability: "music",
        prompt: state.soundtrackPrompt,
        params: {
          prompt: state.soundtrackPrompt,
          lyrics_prompt: `[Intro]\n[Verse]\n${state.soundtrackPrompt}\n[Chorus]\n[Outro]`,
        },
      });
      const mr = musicResult as Record<string, unknown>;
      const md = (mr.data ?? mr) as Record<string, unknown>;
      state.soundtrackUrl = (mr.audio_url as string) ?? (md.audio as { url: string })?.url ?? (md.url as string);
    } catch { /* soundtrack is optional */ }
    emit();
  }

  // ═══ PHASE 3: ASSEMBLE — stitch clips + transitions + music ═══
  state.phase = "assembling";
  emit();
  update(statusMsg.id, `Assembling final video...`);

  try {
    // Build the video sequence: clip1 → transition1 → clip2 → transition2 → ...
    const videoUrls: string[] = [];
    for (let i = 0; i < doneClips.length; i++) {
      videoUrls.push(doneClips[i].videoUrl!);
      if (doneClips[i].transitionUrl) videoUrls.push(doneClips[i].transitionUrl!);
    }

    const { mixMedia } = await import("@livepeer/creative-kit");

    if (state.soundtrackUrl) {
      // Mix clips + soundtrack
      state.finalVideoUrl = await mixMedia({
        videoUrls,
        audioUrls: [state.soundtrackUrl],
        onProgress: (pct) => update(statusMsg.id, `Assembling... ${Math.round(pct * 100)}%`),
      });
    } else {
      // Stitch with embedded audio
      const { default: stitchFn } = await import("./animate").then((m) => ({ default: (m as any).stitchVideosWithAudio || stitchVideosFallback }));
      state.finalVideoUrl = await stitchVideosFallback(videoUrls, (pct) => {
        update(statusMsg.id, `Assembling... ${Math.round(pct * 100)}%`);
      });
    }

    // Upload to GCS
    try {
      const blob = await fetch(state.finalVideoUrl).then((r) => r.blob());
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((r) => { reader.onload = () => r(reader.result as string); reader.readAsDataURL(blob); });
      const resp = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl, fileName: `${episode.name}-produced.webm` }) });
      if (resp.ok) { const d = await resp.json(); if (d.url) state.finalVideoUrl = d.url; }
    } catch {}

    // Add to canvas
    const refId = `ep-prod-${Date.now()}`;
    useCanvasStore.getState().addCard({
      type: "video",
      title: `${episode.name} — ${doneClips.length} clips${state.soundtrackUrl ? " + music" : ""}`,
      refId,
      url: state.finalVideoUrl,
    });

    // Link source cards
    for (const clip of doneClips) {
      useCanvasStore.getState().addEdge(clip.sourceCard.refId, refId, { action: "episode-produce" });
    }

    state.phase = "done";
    const dur = state.clips.reduce((s, c) => s + c.duration, 0);
    update(statusMsg.id,
      `"${episode.name}" produced — ${doneClips.length} clips` +
      `${state.soundtrackUrl ? " + soundtrack" : ""}` +
      `${opts.withTransitions ? " + transitions" : ""}` +
      ` (${dur}s). Card: ${refId}`
    );

    // Auto-download
    if (state.finalVideoUrl) { const a = document.createElement("a"); a.href = state.finalVideoUrl; a.download = `${episode.name}-produced.webm`; a.click(); }
  } catch (e) {
    state.phase = "failed";
    update(statusMsg.id, `Assembly failed: ${(e as Error).message?.slice(0, 80)}`);
  }

  emit();
  return state;
}

/** Fallback stitch — sequential video playback + audio capture. */
async function stitchVideosFallback(
  videoUrls: string[],
  onProgress?: (pct: number) => void,
): Promise<string> {
  const videos: HTMLVideoElement[] = [];
  for (const url of videoUrls) {
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.playsInline = true;
    vid.preload = "auto";
    vid.src = url;
    await new Promise<void>((resolve, reject) => {
      vid.onloadeddata = () => resolve();
      vid.onerror = () => reject(new Error(`Load failed: ${url.slice(0, 60)}`));
    });
    videos.push(vid);
  }

  const w = videos[0].videoWidth || 1280;
  const h = videos[0].videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const canvasStream = canvas.captureStream(30);
  const audioCtx = new AudioContext();
  const audioDest = audioCtx.createMediaStreamDestination();
  const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(combined, {
    mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm",
    videoBitsPerSecond: 4_000_000,
  });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise<string>((resolve, reject) => {
    recorder.onstop = () => { resolve(URL.createObjectURL(new Blob(chunks, { type: "video/webm" }))); audioCtx.close(); };
    recorder.onerror = () => reject(new Error("Record failed"));
    recorder.start(100);

    let idx = 0;
    const total = videos.reduce((s, v) => s + (v.duration || 5), 0);
    let src: MediaElementAudioSourceNode | null = null;

    function next() {
      if (idx >= videos.length) { recorder.stop(); onProgress?.(1); return; }
      const vid = videos[idx];
      if (src) try { src.disconnect(); } catch {}
      try { src = audioCtx.createMediaElementSource(vid); src.connect(audioDest); } catch { src = null; }
      vid.currentTime = 0; vid.play();
      const draw = () => {
        if (vid.ended || vid.paused) return;
        ctx.drawImage(vid, 0, 0, w, h);
        const played = videos.slice(0, idx).reduce((s, v) => s + (v.duration || 5), 0) + vid.currentTime;
        onProgress?.(played / total);
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
      vid.onended = () => { idx++; next(); };
    }
    next();
  });
}
