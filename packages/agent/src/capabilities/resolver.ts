/**
 * Capability resolver — fuzzy-match invalid model names to valid ones.
 *
 * Ported from storyboard-a3/lib/sdk/capabilities.ts.
 * Resolution chain: exact match → prefix match → keyword match → action default → flux-dev.
 *
 * No storyboard-specific imports (no zustand, no sdkFetch).
 * Pass in the live capability set from the hosting environment.
 */

// Hardcoded fallback — used when the live list hasn't loaded yet.
export const FALLBACK_CAPABILITIES = new Set([
  "flux-dev",
  "flux-schnell",
  "recraft-v4",
  "gemini-image",
  "gemini-text",
  "ltx-i2v",
  "ltx-t2v",
  "kontext-edit",
  "topaz-upscale",
  "bg-remove",
  "chatterbox-tts",
  "nano-banana",
]);

// Action-based defaults (most reliable fallback after fuzzy matching fails).
const ACTION_DEFAULTS: Record<string, string> = {
  generate: "flux-dev",
  restyle: "kontext-edit",
  animate: "ltx-i2v",
  upscale: "topaz-upscale",
  remove_bg: "bg-remove",
  tts: "chatterbox-tts",
};

// Keyword → capability mapping (e.g. "kling-i2v" contains "i2v" → "ltx-i2v").
const KEYWORDS: Record<string, string[]> = {
  i2v: ["ltx-i2v"],
  t2v: ["ltx-t2v"],
  tts: ["chatterbox-tts"],
  upscale: ["topaz-upscale"],
  edit: ["kontext-edit"],
  recraft: ["recraft-v4"],
  flux: ["flux-dev"],
  gemini: ["gemini-image"],
  image: ["flux-dev"],
  video: ["ltx-i2v"],
  audio: ["chatterbox-tts"],
};

function commonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/**
 * Resolve a possibly-invalid capability name to a valid one.
 *
 * @param requested - The model name the caller asked for (may be invalid).
 * @param action    - Optional action hint (e.g. "animate") for action-based fallback.
 * @param validSet  - Optional live capability set. Falls back to FALLBACK_CAPABILITIES.
 * @returns A valid capability name, or null if none found.
 */
export function resolveCapability(
  requested: string,
  action?: string,
  validSet?: ReadonlySet<string>
): string | null {
  const caps = validSet ?? FALLBACK_CAPABILITIES;

  // Exact match.
  if (caps.has(requested)) return requested;

  const lower = requested.toLowerCase();

  // Prefix match — pick the longest common prefix (min 4 chars).
  let bestMatch: string | null = null;
  let bestLen = 0;
  for (const name of caps) {
    const prefix = commonPrefix(lower, name.toLowerCase());
    if (prefix.length >= 4 && prefix.length > bestLen) {
      bestLen = prefix.length;
      bestMatch = name;
    }
  }
  if (bestMatch) return bestMatch;

  // Keyword match.
  for (const [kw, targets] of Object.entries(KEYWORDS)) {
    if (lower.includes(kw)) {
      const match = targets.find((t) => caps.has(t));
      if (match) return match;
    }
  }

  // Action-based default.
  if (action && ACTION_DEFAULTS[action]) {
    const def = ACTION_DEFAULTS[action];
    if (caps.has(def)) return def;
  }

  // Final fallback.
  return caps.has("flux-dev") ? "flux-dev" : ([...caps][0] ?? null);
}
