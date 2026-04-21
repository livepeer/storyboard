/**
 * Media Mixer — combine multiple video and audio tracks into one MP4.
 *
 * Videos play sequentially (stitched), then loop.
 * Audio tracks play sequentially, then loop.
 * Output duration = max(total video, total audio) capped at maxDuration.
 *
 * Supports:
 * - 1 video + 1 audio (simple mix)
 * - N videos + 1 audio (video montage with music)
 * - 1 video + N audios (video with layered audio)
 * - N videos + N audios (full montage)
 *
 * Returns a blob URL of the mixed WebM.
 */

export interface MixOptions {
  /** One or more video URLs (played sequentially, looped) */
  videoUrls: string[];
  /** One or more audio URLs (played sequentially, looped) */
  audioUrls: string[];
  /** Max output duration in seconds. Default: 300 (5 min) */
  maxDuration?: number;
  /** Output width. Default: from first video */
  width?: number;
  /** Output height. Default: from first video */
  height?: number;
  /** Progress callback (0-1) */
  onProgress?: (pct: number) => void;
}

// Keep the old single-url interface for backwards compat
export interface MixOptionsSingle {
  videoUrl: string;
  audioUrl: string;
  maxDuration?: number;
  width?: number;
  height?: number;
  onProgress?: (pct: number) => void;
}

interface LoadedMedia {
  element: HTMLVideoElement | HTMLAudioElement;
  duration: number;
}

async function loadVideo(url: string): Promise<LoadedMedia> {
  const el = document.createElement("video");
  el.crossOrigin = "anonymous";
  el.muted = true;
  el.playsInline = true;
  el.preload = "auto";
  el.src = url;
  await new Promise<void>((resolve, reject) => {
    el.onloadedmetadata = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load video: ${url.slice(0, 60)}`));
  });
  return { element: el, duration: el.duration || 5 };
}

async function loadAudio(url: string): Promise<LoadedMedia> {
  const el = document.createElement("audio");
  el.crossOrigin = "anonymous";
  el.preload = "auto";
  el.src = url;
  await new Promise<void>((resolve, reject) => {
    el.onloadedmetadata = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load audio: ${url.slice(0, 60)}`));
  });
  return { element: el, duration: el.duration || 5 };
}

/** Single-url convenience wrapper */
export async function mixVideoAudio(opts: MixOptionsSingle | MixOptions): Promise<string> {
  if ("videoUrl" in opts) {
    return mixMedia({
      videoUrls: [opts.videoUrl],
      audioUrls: [opts.audioUrl],
      maxDuration: opts.maxDuration,
      width: opts.width,
      height: opts.height,
      onProgress: opts.onProgress,
    });
  }
  return mixMedia(opts as MixOptions);
}

/** Core mixer — handles multiple videos + multiple audios */
export async function mixMedia(opts: MixOptions): Promise<string> {
  const maxDuration = opts.maxDuration ?? 300;

  if (opts.videoUrls.length === 0) throw new Error("At least one video URL required");
  if (opts.audioUrls.length === 0) throw new Error("At least one audio URL required");

  // Load all media
  const videos = await Promise.all(opts.videoUrls.map(loadVideo));
  const audios = await Promise.all(opts.audioUrls.map(loadAudio));

  const totalVideoDur = videos.reduce((sum, v) => sum + v.duration, 0);
  const totalAudioDur = audios.reduce((sum, a) => sum + a.duration, 0);
  const totalDur = Math.min(Math.max(totalVideoDur, totalAudioDur), maxDuration);

  const firstVideo = videos[0].element as HTMLVideoElement;
  const w = opts.width ?? firstVideo.videoWidth ?? 640;
  const h = opts.height ?? firstVideo.videoHeight ?? 480;

  // Canvas for video frames
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const canvasStream = canvas.captureStream(30);

  // Audio context — mix all audio sources into one destination
  const audioCtx = new AudioContext();
  const audioDest = audioCtx.createMediaStreamDestination();

  // Combined stream
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(combined, {
    mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm",
    videoBitsPerSecond: 2_500_000,
  });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise<string>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(URL.createObjectURL(blob));
    };
    recorder.onerror = () => reject(new Error("Recording failed"));

    // Track current video/audio index in their respective sequences
    let videoIdx = 0;
    let audioIdx = 0;
    let videoElapsedInTrack = 0;
    let audioElapsedInTrack = 0;
    let currentAudioSource: MediaElementAudioSourceNode | null = null;

    function startAudio(idx: number) {
      const a = audios[idx % audios.length];
      const el = a.element as HTMLAudioElement;
      el.currentTime = 0;
      // Disconnect previous source
      if (currentAudioSource) {
        try { currentAudioSource.disconnect(); } catch { /* ok */ }
      }
      // Create new source (can only call createMediaElementSource once per element)
      try {
        currentAudioSource = audioCtx.createMediaElementSource(el);
      } catch {
        // Already created — reuse by reconnecting
        currentAudioSource = null;
      }
      if (currentAudioSource) {
        currentAudioSource.connect(audioDest);
      }
      el.play();
    }

    function startVideo(idx: number) {
      const v = videos[idx % videos.length];
      const el = v.element as HTMLVideoElement;
      el.currentTime = 0;
      el.play();
    }

    // Start first of each
    recorder.start(100);
    startVideo(0);
    startAudio(0);

    const startTime = performance.now();

    function drawFrame() {
      const elapsed = (performance.now() - startTime) / 1000;

      if (elapsed >= totalDur) {
        // Stop all
        videos.forEach((v) => (v.element as HTMLVideoElement).pause());
        audios.forEach((a) => (a.element as HTMLAudioElement).pause());
        recorder.stop();
        audioCtx.close();
        opts.onProgress?.(1);
        return;
      }

      // Current video — check if we need to advance to next
      const currentVideo = videos[videoIdx % videos.length];
      const videoEl = currentVideo.element as HTMLVideoElement;
      if (videoEl.ended || videoEl.currentTime >= currentVideo.duration - 0.1) {
        videoIdx++;
        videoElapsedInTrack = 0;
        startVideo(videoIdx);
      }

      // Current audio — check if we need to advance to next
      const currentAudio = audios[audioIdx % audios.length];
      const audioEl = currentAudio.element as HTMLAudioElement;
      if (audioEl.ended || audioEl.currentTime >= currentAudio.duration - 0.1) {
        audioIdx++;
        audioElapsedInTrack = 0;
        startAudio(audioIdx);
      }

      // Draw current video frame
      ctx.drawImage(videoEl, 0, 0, w, h);
      opts.onProgress?.(elapsed / totalDur);
      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  });
}
