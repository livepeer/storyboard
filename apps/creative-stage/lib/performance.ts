/**
 * Performance Engine — sequences scenes over time with prompt traveling.
 * Each scene has a prompt, preset, duration. Transitions happen via
 * SDK /stream/{id}/control calls (seamless morph, no restart).
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

    // Schedule transitions for subsequent scenes
    let elapsed = 0;
    for (let i = 1; i < this.scenes.length; i++) {
      elapsed += this.scenes[i - 1].duration;
      const scene = this.scenes[i];
      const sceneIdx = i;

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

    // Progress updates every second
    this.progressTimer = setInterval(() => this.notify(), 1000);
  }

  stop() {
    this.isPlaying = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
    this.notify();
  }

  reorderScenes(fromIdx: number, toIdx: number) {
    const scene = this.scenes.splice(fromIdx, 1)[0];
    this.scenes.splice(toIdx, 0, scene);
    // Re-index
    this.scenes.forEach((s, i) => { s.index = i; });
    this.notify();
  }

  private notify() {
    this.onUpdate?.(this.getState());
  }
}
