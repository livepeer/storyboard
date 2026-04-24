/**
 * Confirmation Gates — decides when to pause and ask the user
 * before proceeding with expensive or destructive operations.
 *
 * Returns a ConfirmationRequest if the user should be asked,
 * or null if the operation should proceed silently.
 */

export interface GateCheck {
  action: string;
  details: string[];
  cost?: string;
}

export interface GateConfig {
  /** Minimum number of scenes before asking. Default: 6 */
  sceneThreshold: number;
  /** Capabilities that trigger cost warnings */
  expensiveModels: Set<string>;
  /** Whether to confirm batch regeneration */
  confirmRegenerate: boolean;
  /** Whether gates are enabled at all */
  enabled: boolean;
}

const DEFAULT_CONFIG: GateConfig = {
  sceneThreshold: 6,
  expensiveModels: new Set(["kling-o3-i2v", "kling-o3-t2v", "kling-v3-i2v", "kling-v3-t2v", "krea_realtime_video"]),
  confirmRegenerate: true,
  enabled: true,
};

let _config = { ...DEFAULT_CONFIG };

/** Update gate configuration. */
export function configureGates(patch: Partial<GateConfig>): void {
  _config = { ..._config, ...patch };
}

/** Check if a multi-scene generation needs confirmation. */
export function checkSceneGate(sceneCount: number, model: string, style?: string): GateCheck | null {
  if (!_config.enabled) return null;
  if (sceneCount < _config.sceneThreshold) return null;

  const details = [`${sceneCount} scenes will be generated`];
  if (style) details.push(`Style: ${style}`);
  details.push(`Model: ${model}`);

  let cost: string | undefined;
  if (_config.expensiveModels.has(model)) {
    const perScene = model.includes("kling") ? "$4" : "$2";
    cost = `~${perScene}/scene × ${sceneCount} = ~$${parseInt(perScene.slice(1)) * sceneCount}`;
  }

  return {
    action: `Generate ${sceneCount} scenes`,
    details,
    cost,
  };
}

/** Check if a batch regeneration needs confirmation. */
export function checkRegenerateGate(sceneCount: number, existingCards: number): GateCheck | null {
  if (!_config.enabled || !_config.confirmRegenerate) return null;
  if (sceneCount < 3 && existingCards < 3) return null;

  return {
    action: `Regenerate ${sceneCount} scenes`,
    details: [
      `${existingCards} existing images will be replaced`,
      "New images will be generated with the current style",
    ],
  };
}

/** Check if an expensive model is being used. */
export function checkModelGate(model: string, sceneCount: number): GateCheck | null {
  if (!_config.enabled) return null;
  if (!_config.expensiveModels.has(model)) return null;
  if (sceneCount < 2) return null; // single image is fine

  const modelName = model.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    action: `Using ${modelName}`,
    details: [
      `${modelName} is a premium model (4K quality)`,
      `${sceneCount} items × premium pricing`,
      "Standard models (flux-dev) are 10x cheaper",
    ],
    cost: `~$${sceneCount * 4} estimated`,
  };
}
