/**
 * Performance Engine — sequences scenes over time with prompt traveling.
 *
 * Scope runtime params (confirmed from source code):
 * - prompts (string | PromptItem[]) — YES runtime
 * - noise_scale (0-1) — YES runtime
 * - kv_cache_attention_bias (0.01-1) — YES runtime
 * - reset_cache (bool) — YES runtime, one-shot
 * - transition (PromptTransition) — YES runtime, smooth morphing
 * - vace_ref_images (string[]) — YES runtime, one-shot (cleared after use)
 * - vace_context_scale (0-2) — YES runtime
 *
 * The events loop crash (1MB trickle limit) was from fal runner log events,
 * not from our control messages. Our params are small and safe.
 */

export interface Scene {
  index: number;
  title: string;
  prompt: string;
  preset: string;
  noiseScale?: number;
  duration: number;
  vaceRef?: string;
}

export interface PerformanceState {
  scenes: Scene[];
  currentScene: number;
  isPlaying: boolean;
  isPaused: boolean;
  elapsed: number;
  totalDuration: number;
}

type ControlFn = (params: Record<string, unknown>) => Promise<void>;

const PRESET_PARAMS: Record<string, {
  noise_scale: number;
  kv_cache_attention_bias: number;
  transition_steps: number;
  reset_cache?: boolean;
}> = {
  dreamy:      { noise_scale: 0.7,  kv_cache_attention_bias: 0.3,  transition_steps: 8 },
  cinematic:   { noise_scale: 0.5,  kv_cache_attention_bias: 0.6,  transition_steps: 12 },
  anime:       { noise_scale: 0.6,  kv_cache_attention_bias: 0.4,  transition_steps: 8 },
  abstract:    { noise_scale: 0.95, kv_cache_attention_bias: 0.08, transition_steps: 4, reset_cache: true },
  faithful:    { noise_scale: 0.2,  kv_cache_attention_bias: 0.85, transition_steps: 16 },
  painterly:   { noise_scale: 0.65, kv_cache_attention_bias: 0.4,  transition_steps: 10 },
  psychedelic: { noise_scale: 0.9,  kv_cache_attention_bias: 0.05, transition_steps: 4, reset_cache: true },
};

/** Build the "settle" params for the scene (normal playback). */
function buildControlParams(scene: Scene): Record<string, unknown> {
  const params = PRESET_PARAMS[scene.preset] || PRESET_PARAMS.cinematic;
  const noise = scene.noiseScale ?? params.noise_scale;

  return {
    prompts: scene.prompt,
    noise_scale: noise,
    kv_cache_attention_bias: params.kv_cache_attention_bias,
    ...(params.reset_cache ? { reset_cache: true } : {}),
  };
}

/** Build "flush" params — forces a hard visual break from the previous scene.
 *  High noise + low kv_cache + reset_cache clears the latent state so the
 *  new prompt generates cleanly without bleed from the old scene. */
function buildFlushParams(scene: Scene): Record<string, unknown> {
  return {
    prompts: scene.prompt,
    noise_scale: 0.95,
    kv_cache_attention_bias: 0.05,
    reset_cache: true,
  };
}

/** How long to hold the flush params before settling into normal playback.
 *  This is stolen from the scene's duration — not added on top. */
const FLUSH_HOLD_MS = 800;

export class PerformanceEngine {
  scenes: Scene[] = [];
  currentScene = 0;
  isPlaying = false;
  isPaused = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private startTime = 0;
  private pausedElapsed = 0;
  private controlFn: ControlFn | null = null;
  private onUpdate: ((state: PerformanceState) => void) | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  setScenes(scenes: Scene[]) {
    this.scenes = scenes;
    this.currentScene = 0;
  }

  getState(): PerformanceState {
    let elapsed = 0;
    if (this.isPaused) {
      elapsed = this.pausedElapsed;
    } else if (this.isPlaying) {
      elapsed = (Date.now() - this.startTime) / 1000;
    }
    return {
      scenes: this.scenes,
      currentScene: this.currentScene,
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      elapsed,
      totalDuration: this.scenes.reduce((sum, s) => sum + s.duration, 0),
    };
  }

  async play(controlFn: ControlFn, onUpdate?: (state: PerformanceState) => void) {
    if (this.scenes.length === 0) return;
    this.stop();

    this.controlFn = controlFn;
    this.onUpdate = onUpdate || null;
    this.isPlaying = true;
    this.isPaused = false;
    this.currentScene = 0;
    this.startTime = Date.now();
    this.pausedElapsed = 0;

    const first = this.scenes[0];
    // Flush first, then settle into normal params after a brief hold
    await controlFn(buildFlushParams(first));
    setTimeout(() => {
      if (this.isPlaying && this.currentScene === 0) {
        controlFn(buildControlParams(first));
      }
    }, FLUSH_HOLD_MS);
    this.notify();
    this.scheduleFutureScenes();
    this.progressTimer = setInterval(() => this.notify(), 1000);
  }

  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this.pausedElapsed = (Date.now() - this.startTime) / 1000;
    this.clearFutureTimers();
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
    this.notify();
  }

  resume() {
    if (!this.isPlaying || !this.isPaused || !this.controlFn) return;
    this.isPaused = false;
    // Shift startTime so elapsed picks up where we left off
    this.startTime = Date.now() - this.pausedElapsed * 1000;
    // Re-send current scene's control params to resume the stream content
    const current = this.scenes[this.currentScene];
    if (current) {
      this.controlFn(buildControlParams(current));
    }
    this.rescheduleFuture();
    this.progressTimer = setInterval(() => this.notify(), 1000);
    this.notify();
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.pausedElapsed = 0;
    this.clearFutureTimers();
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
    this.notify();
  }

  addScene(scene: Omit<Scene, "index">, atIdx?: number) {
    const insertAt = atIdx ?? this.scenes.length;
    if (this.isPlaying && insertAt <= this.currentScene) return;
    this.scenes.splice(insertAt, 0, { ...scene, index: insertAt });
    this.reindex();
    if (this.isPlaying) this.rescheduleFuture();
    this.notify();
  }

  removeScene(idx: number) {
    if (this.isPlaying && idx <= this.currentScene) return;
    this.scenes.splice(idx, 1);
    this.reindex();
    if (this.isPlaying) this.rescheduleFuture();
    this.notify();
  }

  editScene(idx: number, updates: Partial<Scene>) {
    if (this.isPlaying && idx <= this.currentScene) return;
    if (!this.scenes[idx]) return;
    Object.assign(this.scenes[idx], updates);
    if (this.isPlaying) this.rescheduleFuture();
    this.notify();
  }

  reorderScenes(fromIdx: number, toIdx: number) {
    if (this.isPlaying && (fromIdx <= this.currentScene || toIdx <= this.currentScene)) return;
    const scene = this.scenes.splice(fromIdx, 1)[0];
    this.scenes.splice(toIdx, 0, scene);
    this.reindex();
    if (this.isPlaying) this.rescheduleFuture();
    this.notify();
  }

  private reindex() { this.scenes.forEach((s, i) => { s.index = i; }); }
  private clearFutureTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

  private rescheduleFuture() {
    this.clearFutureTimers();
    if (!this.controlFn || !this.isPlaying) return;
    const elapsedMs = Date.now() - this.startTime;
    let sceneStartMs = 0;
    for (let i = 0; i <= this.currentScene; i++) sceneStartMs += (this.scenes[i]?.duration ?? 0) * 1000;
    for (let i = this.currentScene + 1; i < this.scenes.length; i++) {
      const scene = this.scenes[i];
      const idx = i;
      const delay = sceneStartMs - elapsedMs;
      if (delay > 0) {
        const fn = this.controlFn;
        // Step 1: Flush — hard break from old scene
        this.timers.push(setTimeout(async () => {
          if (!this.isPlaying) return;
          this.currentScene = idx;
          await fn(buildFlushParams(scene));
          this.notify();
        }, delay));
        // Step 2: Settle — restore normal params after flush hold
        this.timers.push(setTimeout(async () => {
          if (!this.isPlaying || this.currentScene !== idx) return;
          await fn(buildControlParams(scene));
        }, delay + FLUSH_HOLD_MS));
      }
      sceneStartMs += scene.duration * 1000;
    }
    const endDelay = sceneStartMs - elapsedMs;
    if (endDelay > 0) this.timers.push(setTimeout(() => { this.isPlaying = false; this.notify(); }, endDelay));
  }

  private scheduleFutureScenes() {
    if (!this.controlFn) return;
    let elapsed = 0;
    for (let i = 1; i < this.scenes.length; i++) {
      elapsed += this.scenes[i - 1].duration;
      const scene = this.scenes[i];
      const idx = i;
      const fn = this.controlFn;
      // Step 1: Flush — hard break from previous scene
      this.timers.push(setTimeout(async () => {
        if (!this.isPlaying) return;
        this.currentScene = idx;
        await fn(buildFlushParams(scene));
        this.notify();
      }, elapsed * 1000));
      // Step 2: Settle — normal params after flush hold
      this.timers.push(setTimeout(async () => {
        if (!this.isPlaying || this.currentScene !== idx) return;
        await fn(buildControlParams(scene));
      }, elapsed * 1000 + FLUSH_HOLD_MS));
    }
    const total = this.scenes.reduce((s, sc) => s + sc.duration, 0);
    this.timers.push(setTimeout(() => { this.isPlaying = false; this.notify(); }, total * 1000));
  }

  private notify() { this.onUpdate?.(this.getState()); }
}
