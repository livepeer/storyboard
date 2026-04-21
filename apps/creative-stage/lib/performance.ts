/**
 * Performance Engine — sequences scenes over time with prompt traveling.
 *
 * Each scene transition sends full Scope control params:
 * - prompts + transition (slerp interpolation over N steps)
 * - noise_scale (creativity) — higher during transformation scenes
 * - kv_cache_attention_bias — lower during morphs (responsive), higher during stable shots (consistent)
 * - denoising_step_list — fewer steps during rapid morphs for speed
 * - reset_cache on dramatic transitions to break temporal persistence
 *
 * Supports live editing of future scenes during playback.
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

/** Preset → full Scope param set optimized for morphing */
const PRESET_PARAMS: Record<string, {
  noise_scale: number;
  kv_cache_attention_bias: number;
  denoising_step_list: number[];
  transition_steps: number;
  reset_cache?: boolean;
}> = {
  dreamy:      { noise_scale: 0.7,  kv_cache_attention_bias: 0.3,  denoising_step_list: [1000, 500], transition_steps: 12 },
  cinematic:   { noise_scale: 0.5,  kv_cache_attention_bias: 0.6,  denoising_step_list: [1000, 750, 500, 250], transition_steps: 16 },
  anime:       { noise_scale: 0.6,  kv_cache_attention_bias: 0.4,  denoising_step_list: [1000, 750, 500], transition_steps: 12 },
  abstract:    { noise_scale: 0.95, kv_cache_attention_bias: 0.08, denoising_step_list: [1000, 500], transition_steps: 8, reset_cache: true },
  faithful:    { noise_scale: 0.2,  kv_cache_attention_bias: 0.85, denoising_step_list: [1000, 750, 500, 250], transition_steps: 20 },
  painterly:   { noise_scale: 0.65, kv_cache_attention_bias: 0.4,  denoising_step_list: [1000, 750, 500], transition_steps: 14 },
  psychedelic: { noise_scale: 0.9,  kv_cache_attention_bias: 0.05, denoising_step_list: [1000, 500], transition_steps: 6, reset_cache: true },
};

function buildControlParams(scene: Scene, prevScene?: Scene): Record<string, unknown> {
  const params = PRESET_PARAMS[scene.preset] || PRESET_PARAMS.cinematic;
  const noise = scene.noiseScale ?? params.noise_scale;

  const control: Record<string, unknown> = {
    prompts: scene.prompt,
    noise_scale: noise,
    kv_cache_attention_bias: params.kv_cache_attention_bias,
    denoising_step_list: params.denoising_step_list,
  };

  // Use slerp transition for smooth morphing between scenes
  if (prevScene) {
    control.transition = {
      target_prompts: [{ text: scene.prompt, weight: 1.0 }],
      num_steps: params.transition_steps,
      temporal_interpolation_method: "slerp",
    };
  }

  // Reset cache on dramatic preset changes for clean break
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

    // Apply first scene with full Scope params (no transition — it's the starting state)
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
    const newScene: Scene = { ...scene, index: insertAt };
    this.scenes.splice(insertAt, 0, newScene);
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

  private reindex() {
    this.scenes.forEach((s, i) => { s.index = i; });
  }

  private clearFutureTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private rescheduleFuture() {
    this.clearFutureTimers();
    if (!this.controlFn || !this.isPlaying) return;

    const now = Date.now();
    const elapsedMs = now - this.startTime;
    let sceneStartMs = 0;
    for (let i = 0; i <= this.currentScene; i++) {
      sceneStartMs += (this.scenes[i]?.duration ?? 0) * 1000;
    }

    for (let i = this.currentScene + 1; i < this.scenes.length; i++) {
      const scene = this.scenes[i];
      const prevScene = this.scenes[i - 1];
      const sceneIdx = i;
      const delayMs = sceneStartMs - elapsedMs;

      if (delayMs > 0) {
        const controlFn = this.controlFn;
        const timer = setTimeout(async () => {
          if (!this.isPlaying) return;
          this.currentScene = sceneIdx;
          await controlFn(buildControlParams(scene, prevScene));
          this.notify();
        }, delayMs);
        this.timers.push(timer);
      }
      sceneStartMs += scene.duration * 1000;
    }

    const endDelayMs = sceneStartMs - elapsedMs;
    if (endDelayMs > 0) {
      this.timers.push(setTimeout(() => {
        this.isPlaying = false;
        this.notify();
      }, endDelayMs));
    }
  }

  private scheduleFutureScenes() {
    if (!this.controlFn) return;

    let elapsed = 0;
    for (let i = 1; i < this.scenes.length; i++) {
      elapsed += this.scenes[i - 1].duration;
      const scene = this.scenes[i];
      const prevScene = this.scenes[i - 1];
      const sceneIdx = i;
      const controlFn = this.controlFn;

      const timer = setTimeout(async () => {
        if (!this.isPlaying) return;
        this.currentScene = sceneIdx;
        await controlFn(buildControlParams(scene, prevScene));
        this.notify();
      }, elapsed * 1000);

      this.timers.push(timer);
    }

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
