/**
 * Performance Engine — sequences scenes over time with prompt traveling.
 *
 * Scene transitions use Scope's native transition system:
 * 1. Transition phase: slerp interpolation from old prompt → new prompt
 *    over N steps (controls the "grow into" morphing effect)
 * 2. Ramp phase: gradually shift noise_scale and kv_cache from
 *    transition values → scene's target values
 * 3. Settle phase: scene plays at its target params
 *
 * Scope runtime params used:
 * - prompts (string) — the target scene prompt
 * - noise_scale (0-1) — creativity level
 * - kv_cache_attention_bias (0.01-1) — temporal consistency
 * - reset_cache (bool) — one-shot cache flush
 * - transition — slerp/lerp interpolation to new prompt over N steps
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

/**
 * Build transition params — morphs from the previous scene into the new one.
 * Raises noise and lowers kv_cache to give the pipeline room to transform.
 * Does NOT use the `transition` field (it can lock the pipeline into
 * re-interpolating forever). Instead, relies on prompt change + noise/kv_cache
 * shift to create a natural "grow into" effect.
 */
function buildTransitionParams(
  scene: Scene,
  prevScene: Scene | undefined,
): Record<string, unknown> {
  const params = PRESET_PARAMS[scene.preset] || PRESET_PARAMS.cinematic;
  const prevParams = prevScene
    ? (PRESET_PARAMS[prevScene.preset] || PRESET_PARAMS.cinematic)
    : params;

  // During transition: boost noise and lower kv_cache to enable morphing.
  // The prompt changes while kv_cache is low → Scope naturally morphs between
  // the old cached latent and the new prompt direction.
  const transitionNoise = Math.min(
    Math.max(prevParams.noise_scale, params.noise_scale) + 0.15,
    0.95,
  );
  const transitionKvCache = Math.max(
    Math.min(prevParams.kv_cache_attention_bias, params.kv_cache_attention_bias) * 0.4,
    0.05,
  );

  return {
    prompts: scene.prompt,
    noise_scale: transitionNoise,
    kv_cache_attention_bias: transitionKvCache,
  };
}

/** Build the "settle" params — scene plays at its target values. */
function buildSettleParams(scene: Scene): Record<string, unknown> {
  const params = PRESET_PARAMS[scene.preset] || PRESET_PARAMS.cinematic;
  const noise = scene.noiseScale ?? params.noise_scale;

  return {
    prompts: scene.prompt,
    noise_scale: noise,
    kv_cache_attention_bias: params.kv_cache_attention_bias,
  };
}

/**
 * How long to hold transition params before settling.
 * ~2.5s at ~8-12fps = 20-30 frames of morphing before locking in.
 */
const TRANSITION_HOLD_MS = 2500;

/**
 * For the very first scene, do a brief reset to establish the prompt cleanly.
 */
const FIRST_SCENE_RESET_MS = 600;

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
    // First scene: brief reset to establish prompt, then settle
    await this.controlFn!({
      prompts: first.prompt,
      noise_scale: 0.8,
      kv_cache_attention_bias: 0.1,
      reset_cache: true,
    });
    setTimeout(() => {
      if (this.isPlaying && this.currentScene === 0 && this.controlFn) {
        this.controlFn(buildSettleParams(first));
      }
    }, FIRST_SCENE_RESET_MS);
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
    this.startTime = Date.now() - this.pausedElapsed * 1000;
    const current = this.scenes[this.currentScene];
    if (current && this.controlFn) {
      this.controlFn(buildSettleParams(current));
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

  /**
   * Schedule transitions for all future scenes.
   * Each scene gets a 3-step sequence:
   *   T+0: Transition — slerp morph + boosted noise + lowered kv_cache
   *   T+HOLD: Settle — target preset params
   *   T+duration: Next scene transition starts
   */
  private scheduleFutureScenes() {
    if (!this.controlFn) return;
    let elapsed = 0;
    for (let i = 1; i < this.scenes.length; i++) {
      elapsed += this.scenes[i - 1].duration;
      const scene = this.scenes[i];
      const prev = this.scenes[i - 1];
      const idx = i;

      // Step 1: Start transition — slerp morph into new scene
      this.timers.push(setTimeout(async () => {
        if (!this.isPlaying || !this.controlFn) return;
        this.currentScene = idx;
        await this.controlFn(buildTransitionParams(scene, prev));
        this.notify();
      }, elapsed * 1000));

      // Step 2: Settle — lock in target params after morph completes
      this.timers.push(setTimeout(async () => {
        if (!this.isPlaying || this.currentScene !== idx || !this.controlFn) return;
        await this.controlFn(buildSettleParams(scene));
      }, elapsed * 1000 + TRANSITION_HOLD_MS));
    }
    const total = this.scenes.reduce((s, sc) => s + sc.duration, 0);
    this.timers.push(setTimeout(() => { this.isPlaying = false; this.notify(); }, total * 1000));
  }

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
        this.timers.push(setTimeout(async () => {
          if (!this.isPlaying || !this.controlFn) return;
          this.currentScene = idx;
          await this.controlFn(buildTransitionParams(scene, prev));
          this.notify();
        }, delay));
        this.timers.push(setTimeout(async () => {
          if (!this.isPlaying || this.currentScene !== idx || !this.controlFn) return;
          await this.controlFn(buildSettleParams(scene));
        }, delay + TRANSITION_HOLD_MS));
      }
      sceneStartMs += scene.duration * 1000;
    }
    const endDelay = sceneStartMs - elapsedMs;
    if (endDelay > 0) this.timers.push(setTimeout(() => { this.isPlaying = false; this.notify(); }, endDelay));
  }

  private notify() { this.onUpdate?.(this.getState()); }
}
