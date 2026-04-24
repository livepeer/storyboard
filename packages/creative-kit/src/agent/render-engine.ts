/**
 * Render Engine — stitch canvas cards into a single downloadable video
 * with transitions (cut / crossfade / fade-black) and optional music.
 *
 * Browser-only: uses HTMLCanvasElement, MediaRecorder, Image, HTMLVideoElement.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RenderCard {
  refId: string;
  url: string;
  type: "image" | "video" | "audio";
  duration?: number;
}

export interface RenderOptions {
  cards: RenderCard[];
  musicSource?: string;
  transition: "cut" | "crossfade" | "fade-black";
  transitionDuration?: number;
  imageHoldDuration?: number;
  width?: number;
  height?: number;
  onProgress?: (pct: number) => void;
}

export interface RenderManifestEntry {
  url: string;
  type: "image" | "video";
  duration: number;
}

export interface RenderResult {
  url: string;
  duration: number;
  size: number;
  fileName: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_IMAGE_HOLD = 4;
const DEFAULT_VIDEO_DURATION = 5;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const FPS = 30;
const DEFAULT_TRANSITION_DURATION = 0.5;

/* ------------------------------------------------------------------ */
/*  buildRenderManifest — pure, testable                               */
/* ------------------------------------------------------------------ */

export function buildRenderManifest(opts: RenderOptions): RenderManifestEntry[] {
  const imageHold = opts.imageHoldDuration ?? DEFAULT_IMAGE_HOLD;

  const entries: RenderManifestEntry[] = [];
  for (const card of opts.cards) {
    if (card.type === "audio") continue; // audio-only cards are not visual
    entries.push({
      url: card.url,
      type: card.type as "image" | "video",
      duration:
        card.type === "image"
          ? imageHold
          : card.duration ?? DEFAULT_VIDEO_DURATION,
    });
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/*  Helpers (browser-only)                                             */
/* ------------------------------------------------------------------ */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (_e) => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "auto";
    vid.onloadeddata = () => resolve(vid);
    vid.onerror = (_e) => reject(new Error(`Failed to load video: ${url}`));
    vid.src = url;
  });
}

type LoadedMedia = { type: "image"; el: HTMLImageElement } | { type: "video"; el: HTMLVideoElement };

function drawMediaToCanvas(
  ctx: CanvasRenderingContext2D,
  media: LoadedMedia,
  w: number,
  h: number,
) {
  const src = media.el;
  const sw = media.type === "image" ? (src as HTMLImageElement).naturalWidth : (src as HTMLVideoElement).videoWidth;
  const sh = media.type === "image" ? (src as HTMLImageElement).naturalHeight : (src as HTMLVideoElement).videoHeight;

  // Cover-fit: scale to fill canvas, center-crop
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(src, dx, dy, dw, dh);
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) return "video/webm;codecs=vp9,opus";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) return "video/webm;codecs=vp8,opus";
  return "video/webm";
}

/* ------------------------------------------------------------------ */
/*  renderProject — full browser-side render                           */
/* ------------------------------------------------------------------ */

export async function renderProject(opts: RenderOptions): Promise<RenderResult> {
  const manifest = buildRenderManifest(opts);
  if (manifest.length === 0) {
    throw new Error("No visual cards to render");
  }

  const w = opts.width ?? DEFAULT_WIDTH;
  const h = opts.height ?? DEFAULT_HEIGHT;
  const transitionDur = opts.transition === "cut" ? 0 : (opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION);

  // 1. Pre-load all media
  const loaded: LoadedMedia[] = await Promise.all(
    manifest.map(async (entry) => {
      if (entry.type === "image") {
        return { type: "image" as const, el: await loadImage(entry.url) };
      }
      return { type: "video" as const, el: await loadVideo(entry.url) };
    }),
  );

  // 2. Compute scene timeline
  interface SceneSpan { start: number; end: number; idx: number }
  const scenes: SceneSpan[] = [];
  let cursor = 0;
  for (let i = 0; i < manifest.length; i++) {
    scenes.push({ start: cursor, end: cursor + manifest[i].duration, idx: i });
    cursor += manifest[i].duration;
  }
  const totalDuration = cursor;

  // 3. Set up offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // 4. Capture stream at 30fps
  const canvasStream = canvas.captureStream(FPS);
  const combinedStream = new MediaStream(canvasStream.getVideoTracks());

  // 5. Optional music
  let audioCtx: AudioContext | undefined;
  let audioEl: HTMLAudioElement | undefined;
  if (opts.musicSource) {
    audioCtx = new AudioContext();
    audioEl = new Audio(opts.musicSource);
    audioEl.crossOrigin = "anonymous";
    const source = audioCtx.createMediaElementSource(audioEl);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(audioCtx.destination); // also hear it (optional, can be muted)
    for (const track of dest.stream.getAudioTracks()) {
      combinedStream.addTrack(track);
    }
  }

  // 6. MediaRecorder
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(combinedStream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<RenderResult>((resolve, reject) => {
    recorder.onerror = (e) => reject(e);

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      if (audioCtx) audioCtx.close();
      if (audioEl) { audioEl.pause(); audioEl.src = ""; }
      resolve({
        url,
        duration: totalDuration,
        size: blob.size,
        fileName: `storyboard-render-${Date.now()}.webm`,
      });
    };

    recorder.start(100); // collect data every 100ms
    if (audioEl) audioEl.play().catch(() => { /* autoplay may be blocked */ });

    // Start video sources
    for (const m of loaded) {
      if (m.type === "video") {
        m.el.currentTime = 0;
        m.el.play().catch(() => {});
      }
    }

    const startTime = performance.now();

    const frame = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / totalDuration, 1);
      opts.onProgress?.(Math.round(progress * 100));

      if (elapsed >= totalDuration) {
        recorder.stop();
        // Stop all videos
        for (const m of loaded) {
          if (m.type === "video") {
            m.el.pause();
          }
        }
        return;
      }

      // Determine current scene
      let sceneIdx = scenes.length - 1;
      for (let i = 0; i < scenes.length; i++) {
        if (elapsed < scenes[i].end) {
          sceneIdx = i;
          break;
        }
      }
      const scene = scenes[sceneIdx];
      const sceneElapsed = elapsed - scene.start;
      const sceneDur = manifest[scene.idx].duration;

      ctx.clearRect(0, 0, w, h);

      if (opts.transition === "cut" || transitionDur === 0) {
        // Simple cut — draw current scene
        drawMediaToCanvas(ctx, loaded[scene.idx], w, h);
      } else if (opts.transition === "crossfade") {
        // Crossfade: during the last `transitionDur` seconds of a scene, blend with next
        const timeToEnd = sceneDur - sceneElapsed;
        if (timeToEnd <= transitionDur && sceneIdx < scenes.length - 1) {
          const alpha = 1 - timeToEnd / transitionDur; // 0→1 over transition window
          // Draw current
          ctx.globalAlpha = 1 - alpha;
          drawMediaToCanvas(ctx, loaded[scene.idx], w, h);
          // Draw next
          ctx.globalAlpha = alpha;
          drawMediaToCanvas(ctx, loaded[sceneIdx + 1], w, h);
          ctx.globalAlpha = 1;
        } else {
          drawMediaToCanvas(ctx, loaded[scene.idx], w, h);
        }
      } else if (opts.transition === "fade-black") {
        const halfTrans = transitionDur / 2;
        const timeToEnd = sceneDur - sceneElapsed;
        if (timeToEnd <= transitionDur && sceneIdx < scenes.length - 1) {
          if (timeToEnd > halfTrans) {
            // Fade current to black
            const alpha = (timeToEnd - halfTrans) / halfTrans; // 1→0
            ctx.globalAlpha = alpha;
            drawMediaToCanvas(ctx, loaded[scene.idx], w, h);
            ctx.globalAlpha = 1;
          } else {
            // Fade next from black
            const alpha = 1 - timeToEnd / halfTrans; // 0→1
            ctx.globalAlpha = alpha;
            drawMediaToCanvas(ctx, loaded[sceneIdx + 1], w, h);
            ctx.globalAlpha = 1;
          }
        } else {
          drawMediaToCanvas(ctx, loaded[scene.idx], w, h);
        }
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  });
}
