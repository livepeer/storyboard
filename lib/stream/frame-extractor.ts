/**
 * Frame extractor — unified frame source for LV2V publishing.
 *
 * Supports webcam, image, video element, and URL sources.
 * All sources produce JPEG blobs at a configurable FPS for
 * the trickle publish endpoint.
 */

export type FrameSourceType = "webcam" | "image" | "video" | "url";

export interface FrameExtractorConfig {
  type: FrameSourceType;
  /** URL for image/video/url sources */
  url?: string;
  /** MediaStream for webcam source */
  stream?: MediaStream;
  /** Target FPS (default 10) */
  fps?: number;
  /** JPEG quality 0-1 (default 0.8) */
  quality?: number;
}

/**
 * FrameExtractor captures frames from various sources as JPEG blobs.
 *
 * Usage:
 *   const extractor = new FrameExtractor({ type: "video", url: "https://..." });
 *   await extractor.init();
 *   extractor.start((blob) => publishFrame(blob));
 *   // later:
 *   extractor.stop();
 */
export class FrameExtractor {
  private config: FrameExtractorConfig;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private imgEl: HTMLImageElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(config: FrameExtractorConfig) {
    this.config = { fps: 10, quality: 0.8, ...config };
  }

  /** Initialize the source. Must be called before start(). */
  async init(): Promise<void> {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");

    switch (this.config.type) {
      case "webcam":
        await this.initWebcam();
        break;
      case "image":
        await this.initImage();
        break;
      case "video":
      case "url":
        await this.initVideo();
        break;
    }
  }

  private async initWebcam(): Promise<void> {
    const stream = this.config.stream || await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
    });
    this.videoEl = document.createElement("video");
    this.videoEl.srcObject = stream;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    await this.videoEl.play();
    this.canvas!.width = this.videoEl.videoWidth || 640;
    this.canvas!.height = this.videoEl.videoHeight || 480;
  }

  private async initImage(): Promise<void> {
    if (!this.config.url) throw new Error("Image source requires url");
    this.imgEl = new Image();
    this.imgEl.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      this.imgEl!.onload = () => resolve();
      this.imgEl!.onerror = () => reject(new Error(`Failed to load image: ${this.config.url}`));
      this.imgEl!.src = this.config.url!;
    });
    this.canvas!.width = this.imgEl.naturalWidth;
    this.canvas!.height = this.imgEl.naturalHeight;
  }

  private async initVideo(): Promise<void> {
    if (!this.config.url) throw new Error("Video source requires url");
    this.videoEl = document.createElement("video");
    this.videoEl.crossOrigin = "anonymous";
    this.videoEl.src = this.config.url;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    this.videoEl.loop = true;
    await new Promise<void>((resolve, reject) => {
      this.videoEl!.onloadeddata = () => resolve();
      this.videoEl!.onerror = () => reject(new Error(`Failed to load video: ${this.config.url}`));
    });
    await this.videoEl.play();
    this.canvas!.width = this.videoEl.videoWidth || 640;
    this.canvas!.height = this.videoEl.videoHeight || 480;
  }

  /**
   * Start extracting frames. Calls onFrame with a JPEG blob at the
   * configured FPS. Returns immediately.
   */
  start(onFrame: (blob: Blob) => void): void {
    this.stopped = false;
    const intervalMs = 1000 / (this.config.fps || 10);

    this.timer = setInterval(() => {
      if (this.stopped) return;
      const blob = this.captureFrame();
      if (blob) onFrame(blob);
    }, intervalMs);
  }

  /** Capture a single frame as a JPEG blob (synchronous via toDataURL). */
  captureFrame(): Blob | null {
    if (!this.canvas || !this.ctx) return null;

    try {
      if (this.config.type === "image" && this.imgEl) {
        this.ctx.drawImage(this.imgEl, 0, 0);
      } else if (this.videoEl) {
        if (this.videoEl.readyState < 2) return null; // not ready
        this.ctx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height);
      } else {
        return null;
      }

      // Synchronous approach: toDataURL → convert to blob
      const dataUrl = this.canvas.toDataURL("image/jpeg", this.config.quality);
      return dataUrlToBlob(dataUrl);
    } catch {
      return null; // CORS or other errors
    }
  }

  /** Stop extracting frames and release resources. */
  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Stop webcam tracks
    if (this.config.type === "webcam" && this.videoEl?.srcObject) {
      const stream = this.videoEl.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
    }
    // Pause video
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.src = "";
    }
    this.videoEl = null;
    this.imgEl = null;
    this.canvas = null;
    this.ctx = null;
  }

  /** Get source dimensions */
  getDimensions(): { width: number; height: number } {
    return {
      width: this.canvas?.width || 0,
      height: this.canvas?.height || 0,
    };
  }

  get isActive(): boolean {
    return !this.stopped && this.timer !== null;
  }
}

/** Convert a data URL to a Blob */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(parts[1]);
  const arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) {
    arr[i] = bstr.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}
