/**
 * Performance Engine — sequences scenes over time with prompt traveling.
 * Each scene has a prompt, preset, duration. Transitions happen via
 * SDK /stream/{id}/control calls (seamless morph, no restart).
 *
 * Supports live editing: add, remove, reorder, or edit any scene
 * that hasn't been reached yet — even during playback. The engine
 * reschedules all future timers when the timeline changes.
 */

export interface Scene {
  index: number;
  title: string;
  prompt: string;
  preset: string;
  noiseScale?: number;
  duration: number; // seconds
}

export interface PerformanceState {
  scenes: Scene[];
  currentScene: number;
  isPlaying: boolean;
  elapsed: number;
  totalDuration: number;
}

type ControlFn = (params: Record<string, unknown>) => Promise<void>;

export class PerformanceEngine {
  scenes: Scene[] = [];
  currentScene = 0;
  isPlaying = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private startTime = 0;
  private controlFn: ControlFn | null = null;
  private onUpdate: ((state: PerformanceState) => void) | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  setScenes(scenes: Scene[]) {
    this.scenes = scenes;
    this.currentScene = 0;
  }

  getState(): PerformanceState {
    return {
      scenes: this.scenes,
      currentScene: this.currentScene,
      isPlaying: this.isPlaying,
      elapsed: this.isPlaying ? (Date.now() - this.startTime) / 1000 : 0,
      totalDuration: this.scenes.reduce((sum, s) => sum + s.duration, 0),
    };
  }

  async play(controlFn: ControlFn, onUpdate?: (state: PerformanceState) => void) {
    if (this.scenes.length === 0) return;
    this.stop();

    this.controlFn = controlFn;
    this.onUpdate = onUpdate || null;
    this.isPlaying = true;
    this.currentScene = 0;
    this.startTime = Date.now();

    // Apply first scene immediately
    const first = this.scenes[0];
    await controlFn({
      prompts: first.prompt,
      noise_scale: first.noiseScale ?? 0.5,
    });
    this.notify();

    // Schedule future scenes
    this.scheduleFutureScenes();

    // Progress updates every second
    this.progressTimer = setInterval(() => this.notify(), 1000);
  }

  stop() {
    this.isPlaying = false;
    this.clearFutureTimers();
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
    this.notify();
  }

  /** Add a scene at a position. If during playback, only allowed after currentScene. */
  addScene(scene: Omit<Scene, "index">, atIdx?: number) {
    const insertAt = atIdx ?? this.scenes.length;
    // During playback, can only insert after current scene
    if (this.isPlaying && insertAt <= this.currentScene) return;

    const newScene: Scene = { ...scene, index: insertAt };
    this.scenes.splice(insertAt, 0, newScene);
    this.reindex();

    if (this.isPlaying) this.rescheduleFuture();
    this.notify();
  }

  /** Remove a scene. During playback, only future scenes (after currentScene). */
  removeScene(idx: number) {
    if (this.isPlaying && idx <= this.currentScene) return;
    this.scenes.splice(idx, 1);
    this.reindex();

    if (this.isPlaying) this.rescheduleFuture();
    this.notify();
  }

  /** Edit a scene's properties. During playback, only future scenes. */
  editScene(idx: number, updates: Partial<Scene>) {
    if (this.isPlaying && idx <= this.currentScene) return;
    if (!this.scenes[idx]) return;
    Object.assign(this.scenes[idx], updates);

    if (this.isPlaying) this.rescheduleFuture();
    this.notify();
  }

  /** Reorder: move scene from one position to another. During playback, both must be future. */
  reorderScenes(fromIdx: number, toIdx: number) {
    if (this.isPlaying && (fromIdx <= this.currentScene || toIdx <= this.currentScene)) return;

    const scene = this.scenes.splice(fromIdx, 1)[0];
    this.scenes.splice(toIdx, 0, scene);
    this.reindex();

    if (this.isPlaying) this.rescheduleFuture();
    this.notify();
  }

  // ─── Internals ───

  private reindex() {
    this.scenes.forEach((s, i) => { s.index = i; });
  }

  private clearFutureTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  /** Cancel all future timers and reschedule from current position. */
  private rescheduleFuture() {
    this.clearFutureTimers();
    if (!this.controlFn || !this.isPlaying) return;

    const now = Date.now();
    const elapsedMs = now - this.startTime;

    // Calculate when each future scene should start (absolute from startTime)
    let sceneStartMs = 0;
    for (let i = 0; i <= this.currentScene; i++) {
      sceneStartMs += (this.scenes[i]?.duration ?? 0) * 1000;
    }

    for (let i = this.currentScene + 1; i < this.scenes.length; i++) {
      const scene = this.scenes[i];
      const sceneIdx = i;
      const delayMs = sceneStartMs - elapsedMs;

      if (delayMs > 0) {
        const controlFn = this.controlFn;
        const timer = setTimeout(async () => {
          if (!this.isPlaying) return;
          this.currentScene = sceneIdx;
          await controlFn({
            prompts: scene.prompt,
            noise_scale: scene.noiseScale ?? 0.5,
          });
          this.notify();
        }, delayMs);
        this.timers.push(timer);
      }

      sceneStartMs += scene.duration * 1000;
    }

    // Schedule end
    const endDelayMs = sceneStartMs - elapsedMs;
    if (endDelayMs > 0) {
      this.timers.push(setTimeout(() => {
        this.isPlaying = false;
        this.notify();
      }, endDelayMs));
    }
  }

  /** Schedule transitions for all scenes after the first (used at play start). */
  private scheduleFutureScenes() {
    if (!this.controlFn) return;

    let elapsed = 0;
    for (let i = 1; i < this.scenes.length; i++) {
      elapsed += this.scenes[i - 1].duration;
      const scene = this.scenes[i];
      const sceneIdx = i;
      const controlFn = this.controlFn;

      const timer = setTimeout(async () => {
        if (!this.isPlaying) return;
        this.currentScene = sceneIdx;
        await controlFn({
          prompts: scene.prompt,
          noise_scale: scene.noiseScale ?? 0.5,
        });
        this.notify();
      }, elapsed * 1000);

      this.timers.push(timer);
    }

    // Schedule end
    const totalDur = this.scenes.reduce((sum, s) => sum + s.duration, 0);
    this.timers.push(setTimeout(() => {
      this.isPlaying = false;
      this.notify();
    }, totalDur * 1000));
  }

  private notify() {
    this.onUpdate?.(this.getState());
  }
}
