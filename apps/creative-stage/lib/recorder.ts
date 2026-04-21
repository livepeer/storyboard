/**
 * Stage Recorder — captures the live Scope stream + optional audio into
 * a downloadable WebM file. Uses MediaRecorder on a combined stream of
 * the ScopePlayer canvas + audio element.
 */

export interface RecorderState {
  isRecording: boolean;
  duration: number; // seconds
  blobUrl: string | null;
}

export class StageRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private onUpdate: ((state: RecorderState) => void) | null = null;

  isRecording = false;
  duration = 0;
  blobUrl: string | null = null;

  /**
   * Start recording.
   * @param canvas — the ScopePlayer's canvas element (captureStream)
   * @param audioEl — optional <audio> element playing background music
   */
  start(canvas: HTMLCanvasElement, audioEl?: HTMLAudioElement, onUpdate?: (state: RecorderState) => void) {
    if (this.isRecording) this.stop();

    this.onUpdate = onUpdate || null;
    this.chunks = [];
    this.blobUrl = null;

    // Capture canvas video stream at 30fps
    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];

    // Add audio track if available
    if (audioEl) {
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(audioEl);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination); // keep playing through speakers
        tracks.push(...dest.stream.getAudioTracks());
      } catch {
        // Audio source already created — skip
      }
    }

    const combined = new MediaStream(tracks);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    this.recorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: 4_000_000,
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mimeType });
      this.blobUrl = URL.createObjectURL(blob);
      this.isRecording = false;
      this.notify();
    };

    this.recorder.start(250); // chunk every 250ms
    this.isRecording = true;
    this.startTime = Date.now();
    this.duration = 0;

    this.progressTimer = setInterval(() => {
      this.duration = (Date.now() - this.startTime) / 1000;
      this.notify();
    }, 500);

    this.notify();
  }

  stop(): string | null {
    if (!this.recorder || this.recorder.state === "inactive") return null;

    this.recorder.stop();
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
    this.duration = (Date.now() - this.startTime) / 1000;
    this.isRecording = false;
    // blobUrl set in onstop callback
    return null; // async — blobUrl available after onstop fires
  }

  getState(): RecorderState {
    return {
      isRecording: this.isRecording,
      duration: this.duration,
      blobUrl: this.blobUrl,
    };
  }

  /** Download the recorded file */
  download(filename = "creative-stage-recording.webm") {
    if (!this.blobUrl) return;
    const a = document.createElement("a");
    a.href = this.blobUrl;
    a.download = filename;
    a.click();
  }

  private notify() {
    this.onUpdate?.(this.getState());
  }
}
