/**
 * Media Mixer — combine a video and audio track into a single MP4.
 *
 * Uses browser APIs: HTMLVideoElement + HTMLAudioElement + MediaRecorder + Canvas.
 * The video loops if shorter than the audio. The audio loops if shorter than the video.
 * Output duration = max(video, audio) capped at maxDuration.
 *
 * Returns a blob URL of the mixed MP4.
 */

export interface MixOptions {
  videoUrl: string;
  audioUrl: string;
  /** Max output duration in seconds. Default: 60 */
  maxDuration?: number;
  /** Output width. Default: from video */
  width?: number;
  /** Output height. Default: from video */
  height?: number;
  /** Progress callback (0-1) */
  onProgress?: (pct: number) => void;
}

export async function mixVideoAudio(opts: MixOptions): Promise<string> {
  const maxDuration = opts.maxDuration ?? 60;

  // Load video
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.src = opts.videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video"));
  });

  // Load audio
  const audio = document.createElement("audio");
  audio.crossOrigin = "anonymous";
  audio.src = opts.audioUrl;

  await new Promise<void>((resolve, reject) => {
    audio.onloadedmetadata = () => resolve();
    audio.onerror = () => reject(new Error("Failed to load audio"));
  });

  const w = opts.width ?? video.videoWidth ?? 640;
  const h = opts.height ?? video.videoHeight ?? 480;
  const videoDur = video.duration || 10;
  const audioDur = audio.duration || 10;
  const totalDur = Math.min(Math.max(videoDur, audioDur), maxDuration);

  // Canvas for video frames
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Create media streams
  const canvasStream = canvas.captureStream(30); // 30fps

  // Create AudioContext to capture audio stream
  const audioCtx = new AudioContext();
  const audioSource = audioCtx.createMediaElementSource(audio);
  const audioDest = audioCtx.createMediaStreamDestination();
  audioSource.connect(audioDest);
  audioSource.connect(audioCtx.destination); // also play locally for sync

  // Combine video (canvas) + audio streams
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  // Record
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(combined, {
    mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm",
    videoBitsPerSecond: 2_500_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<string>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(URL.createObjectURL(blob));
    };
    recorder.onerror = () => reject(new Error("Recording failed"));

    // Start playback + recording
    recorder.start(100); // collect data every 100ms
    video.currentTime = 0;
    audio.currentTime = 0;
    video.play();
    audio.play();

    const startTime = performance.now();

    // Render loop: draw video frames to canvas
    function drawFrame() {
      const elapsed = (performance.now() - startTime) / 1000;

      if (elapsed >= totalDur) {
        // Done — stop everything
        video.pause();
        audio.pause();
        recorder.stop();
        audioCtx.close();
        opts.onProgress?.(1);
        return;
      }

      // Loop video if it's shorter
      if (video.ended || video.currentTime >= videoDur - 0.1) {
        video.currentTime = 0;
        video.play();
      }

      // Loop audio if it's shorter
      if (audio.ended || audio.currentTime >= audioDur - 0.1) {
        audio.currentTime = 0;
        audio.play();
      }

      ctx.drawImage(video, 0, 0, w, h);
      opts.onProgress?.(elapsed / totalDur);
      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  });
}
