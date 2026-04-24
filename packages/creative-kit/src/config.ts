/**
 * Centralized configuration — all magic numbers in one place.
 *
 * Override at runtime via configure(). All modules read from here
 * instead of hardcoding thresholds.
 */

export interface CreativeKitConfig {
  // ─── Request Queue ───
  /** Max concurrent requests (default: 1 = serial) */
  maxConcurrentRequests: number;

  // ─── Memory ───
  /** Active request stale timeout in ms (default: 30 min) */
  staleThresholdMs: number;
  /** Max words in conversation digest (default: 200) */
  digestMaxWords: number;
  /** Max recent actions tracked (default: 5) */
  maxRecentActions: number;

  // ─── Projects ───
  /** Scenes per batch in project_generate (default: 5) */
  batchSize: number;
  /** Max batch iterations before giving up (default: 10) */
  maxBatches: number;
  /** Max canvas cards shown in system prompt (default: 15) */
  maxCanvasCardsInPrompt: number;

  // ─── Confirmation Gates ───
  /** Scene count threshold before asking (default: 6) */
  confirmationSceneThreshold: number;
  /** Whether confirmation gates are enabled (default: true) */
  confirmationEnabled: boolean;

  // ─── Model Router ───
  /** Whether self-learning speed is enabled (default: true) */
  selfLearningEnabled: boolean;
  /** Speed weight in router scoring (default: 0.60) */
  routerSpeedWeight: number;
  /** Style weight in router scoring (default: 0.30) */
  routerStyleWeight: number;
  /** Capacity weight in router scoring (default: 0.10) */
  routerCapacityWeight: number;

  // ─── Model Lock ───
  /** Lock model per action across multi-step generations (default: true) */
  modelLockEnabled: boolean;

  // ─── Creative Memory ───
  /** Max stored preferences (default: 100) */
  maxPreferences: number;
  /** Score threshold for auto-applying preferences (default: 3) */
  preferenceAutoApplyThreshold: number;
  /** Decay rate for old preferences (default: 0.95) */
  preferenceDecayRate: number;

  // ─── Live Streaming ───
  /** Transition hold time in ms for scene morphing (default: 2500) */
  transitionHoldMs: number;
  /** First scene reset time in ms (default: 600) */
  firstSceneResetMs: number;
  /** Max wait for stream warm-up in seconds (default: 180) */
  streamWarmupMaxWaitSec: number;

  // ─── Export ───
  /** Default scene duration for export (default: 4s) */
  exportDefaultDuration: number;
  /** Default transition duration for video export (default: 1s) */
  exportTransitionDuration: number;
}

const DEFAULTS: CreativeKitConfig = {
  maxConcurrentRequests: 1,
  staleThresholdMs: 30 * 60 * 1000,
  digestMaxWords: 200,
  maxRecentActions: 5,
  batchSize: 5,
  maxBatches: 10,
  maxCanvasCardsInPrompt: 15,
  confirmationSceneThreshold: 6,
  confirmationEnabled: true,
  selfLearningEnabled: true,
  routerSpeedWeight: 0.60,
  routerStyleWeight: 0.30,
  routerCapacityWeight: 0.10,
  modelLockEnabled: true,
  maxPreferences: 100,
  preferenceAutoApplyThreshold: 3,
  preferenceDecayRate: 0.95,
  transitionHoldMs: 2500,
  firstSceneResetMs: 600,
  streamWarmupMaxWaitSec: 180,
  exportDefaultDuration: 4,
  exportTransitionDuration: 1,
};

let _config: CreativeKitConfig = { ...DEFAULTS };

/** Get the current config. */
export function getConfig(): Readonly<CreativeKitConfig> {
  return _config;
}

/** Override config values. Merges with existing. */
export function configure(patch: Partial<CreativeKitConfig>): void {
  _config = { ..._config, ...patch };
}

/** Reset config to defaults. */
export function resetConfig(): void {
  _config = { ...DEFAULTS };
}

/** Get defaults (for display/comparison). */
export function getDefaults(): Readonly<CreativeKitConfig> {
  return { ...DEFAULTS };
}
