let activeStream: MediaStream | null = null;

// Reuse a single canvas for frame capture (matches original storyboard)
let captureCanvas: HTMLCanvasElement | null = null;
let captureCtx: CanvasRenderingContext2D | null = null;

export async function startWebcam(
  videoEl: HTMLVideoElement
): Promise<MediaStream> {
  if (activeStream) return activeStream;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  videoEl.srcObject = stream;
  activeStream = stream;
  return stream;
}

export function stopWebcam() {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
  captureCanvas = null;
  captureCtx = null;
}

/**
 * Capture a JPEG frame from the video element.
 * Uses toBlob (async, native encoder) matching the original storyboard.
 * Returns null if video not ready.
 */
export function captureFrame(videoEl: HTMLVideoElement): Blob | null {
  if (!videoEl.videoWidth) return null;

  // Lazy-init reusable canvas (matching original: one canvas, reused every frame)
  if (!captureCanvas) {
    captureCanvas = document.createElement("canvas");
    captureCtx = captureCanvas.getContext("2d");
  }
  if (!captureCtx) return null;

  // Match original storyboard's size capping: independent max on each dimension
  const w = Math.min(videoEl.videoWidth, 640);
  const h = Math.min(videoEl.videoHeight, 480);
  captureCanvas.width = w;
  captureCanvas.height = h;
  captureCtx.drawImage(videoEl, 0, 0, w, h);

  // Synchronous capture for setInterval compatibility
  // (toBlob is async but we need a sync return for the publish interval)
  const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.8);
  const bin = atob(dataUrl.split(",")[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/jpeg" });
}

/**
 * Async capture using native toBlob (higher quality, used for one-off snapshots).
 */
export function captureFrameAsync(videoEl: HTMLVideoElement): Promise<Blob | null> {
  if (!videoEl.videoWidth) return Promise.resolve(null);
  if (!captureCanvas) {
    captureCanvas = document.createElement("canvas");
    captureCtx = captureCanvas.getContext("2d");
  }
  if (!captureCtx) return Promise.resolve(null);

  const w = Math.min(videoEl.videoWidth, 640);
  const h = Math.min(videoEl.videoHeight, 480);
  captureCanvas.width = w;
  captureCanvas.height = h;
  captureCtx.drawImage(videoEl, 0, 0, w, h);

  return new Promise((resolve) => {
    captureCanvas!.toBlob(
      (blob) => resolve(blob),
      "image/jpeg",
      0.8
    );
  });
}

export function isWebcamActive(): boolean {
  return activeStream !== null;
}
