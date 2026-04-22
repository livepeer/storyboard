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

function buildControlParams(scene: Scene, prevScene?: Scene): Record<string, unknown> {
  const params = PRESET_PARAMS[scene.preset] || PRESET_PARAMS.cinematic;
  const noise = scene.noiseScale ?? params.noise_scale;

  const control: Record<string, unknown> = {
    noise_scale: noise,
    kv_cache_attention_bias: params.kv_cache_attention_bias,
  };

  // Always send prompts directly — simple and reliable
  control.prompts = scene.prompt;

  if (params.reset_cache) {
    control.reset_cache = true;
  }

  return control;
}

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

    const first = this.scenes[0];
    await controlFn(buildControlParams(first));
    this.notify();
    this.scheduleFutureScenes();
    this.progressTimer = setInterval(() => this.notify(), 1000);
  }

  stop() {
    this.isPlaying = false;
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
      const prev = this.scenes[i - 1];
      const idx = i;
      const delay = sceneStartMs - elapsedMs;
      if (delay > 0) {
        const fn = this.controlFn;
        this.timers.push(setTimeout(async () => {
          if (!this.isPlaying) return;
          this.currentScene = idx;
          await fn(buildControlParams(scene, prev));
          this.notify();
        }, delay));
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
      const prev = this.scenes[i - 1];
      const idx = i;
      const fn = this.controlFn;
      this.timers.push(setTimeout(async () => {
        if (!this.isPlaying) return;
        this.currentScene = idx;
        await fn(buildControlParams(scene, prev));
        this.notify();
      }, elapsed * 1000));
    }
    const total = this.scenes.reduce((s, sc) => s + sc.duration, 0);
    this.timers.push(setTimeout(() => { this.isPlaying = false; this.notify(); }, total * 1000));
  }

  private notify() { this.onUpdate?.(this.getState()); }
}
