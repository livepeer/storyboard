/**
 * Live capabilities registry — single source of truth for available models.
 *
 * Fetched once from the SDK's /capabilities endpoint. All tool schemas,
 * system prompts, and execution-time validation read from this cache.
 * When new models are registered on the BYOC, they appear automatically.
 */

import { sdkFetch } from "./client";

export interface LiveCapability {
  name: string;
  model_id: string;
  capacity: number;
  source?: string;
}

let cache: LiveCapability[] | null = null;
let fetchPromise: Promise<LiveCapability[]> | null = null;

/**
 * Fetch and cache the live capability list from the SDK.
 * Called once on app init; subsequent calls return the cache.
 */
export async function fetchCapabilities(): Promise<LiveCapability[]> {
  if (cache) return cache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = sdkFetch<LiveCapability[]>("/capabilities", undefined, 10_000)
    .then((caps) => {
      cache = caps;
      fetchPromise = null;
      return caps;
    })
    .catch(() => {
      fetchPromise = null;
      // Return empty — tools will use fallback defaults
      return [];
    });

  return fetchPromise;
}

/** Get cached capabilities (synchronous — returns [] if not yet fetched). */
export function getCachedCapabilities(): LiveCapability[] {
  return cache || [];
}

/** Get the set of valid capability names. */
export function getValidCapabilityNames(): Set<string> {
  return new Set((cache || []).map((c) => c.name));
}

/** Check if a capability name is valid. */
export function isValidCapability(name: string): boolean {
  const validSet = cache && cache.length > 0
    ? new Set(cache.map((c) => c.name))
    : FALLBACK_CAPABILITIES;
  return validSet.has(name);
}

/**
 * Resolve a possibly-invalid capability name to a valid one.
 * Uses fuzzy matching: if "flux-pro" is requested but doesn't exist,
 * finds the closest match (e.g. "flux-dev").
 * Returns null if no reasonable match found.
 */
// Hardcoded fallback — used when cache hasn't loaded yet.
// This MUST be kept as a safety net. The live list overrides when available.
const FALLBACK_CAPABILITIES = new Set([
  "flux-dev", "flux-schnell", "recraft-v4", "gemini-image", "gemini-text",
  "gpt-image", "gpt-image-edit",
  "ltx-i2v", "ltx-t2v", "kontext-edit",
  "topaz-upscale", "bg-remove", "chatterbox-tts", "nano-banana",
  "seedream-5-lite", "seedance-i2v", "seedance-i2v-fast",
  "tripo-i3d", "tripo-t3d", "tripo-p1-i3d", "tripo-p1-t3d", "tripo-mv3d",
  "kling-v3-t2v", "kling-v3-i2v", "kling-o3-t2v", "kling-o3-i2v", "kling-o3-ref2v",
  // Happy Horse 1.0 (Alibaba) — native 1080p + synced audio
  // Verify fal model IDs when live: curl https://fal.ai/models/alibaba/happy-horse/text-to-video
  "happy-horse-t2v", "happy-horse-i2v",
]);

export function resolveCapability(
  requested: string,
  action?: string
): string | null {
  const validSet = cache && cache.length > 0
    ? new Set(cache.map((c) => c.name))
    : FALLBACK_CAPABILITIES;

  if (validSet.has(requested)) return requested; // exact match

  // Fuzzy match: find capability whose name shares the longest prefix
  const lower = requested.toLowerCase();

  // Action-based defaults (most reliable fallback)
  const ACTION_DEFAULTS: Record<string, string> = {
    generate: "flux-dev",
    restyle: "kontext-edit",
    animate: "ltx-i2v",
    upscale: "topaz-upscale",
    remove_bg: "bg-remove",
    tts: "chatterbox-tts",
  };

  // Try prefix match — pick the LONGEST prefix match (e.g. "ltx-t2v-23" → "ltx-t2v" not "ltx-i2v")
  let bestMatch: string | null = null;
  let bestLen = 0;
  for (const name of validSet) {
    const prefix = commonPrefix(lower, name.toLowerCase());
    if (prefix.length >= 4 && prefix.length > bestLen) {
      bestLen = prefix.length;
      bestMatch = name;
    }
  }
  if (bestMatch) return bestMatch;

  // Try keyword match (e.g. "kling-i2v" contains "i2v" → "ltx-i2v")
  const keywords: Record<string, string[]> = {
    "happy-horse": ["happy-horse-i2v", "happy-horse-t2v"],
    "horse": ["happy-horse-i2v", "happy-horse-t2v"],
    "seedance": ["seedance-i2v", "seedance-i2v-fast"],
    "seedream": ["seedream-5-lite"],
    "kling": ["kling-o3-i2v", "kling-o3-t2v", "kling-v3-i2v"],
    "4k": ["kling-o3-i2v", "kling-o3-t2v"],
    "i2v": ["happy-horse-i2v", "seedance-i2v", "kling-o3-i2v", "ltx-i2v"],
    "t2v": ["happy-horse-t2v", "kling-o3-t2v", "ltx-t2v"],
    "tts": ["chatterbox-tts"],
    "upscale": ["topaz-upscale"],
    "edit": ["gpt-image-edit", "kontext-edit"],
    "recraft": ["recraft-v4"],
    "flux": ["flux-dev"],
    "gemini": ["gemini-image"],
    "gpt": ["gpt-image"],
    "openai": ["gpt-image"],
    "product": ["gpt-image"],
    "briefing": ["gpt-image"],
    "text-in-image": ["gpt-image"],
    "image": ["flux-dev"],
    "video": ["seedance-i2v", "ltx-i2v"],
    "audio": ["chatterbox-tts"],
  };
  for (const [kw, targets] of Object.entries(keywords)) {
    if (lower.includes(kw)) {
      const match = targets.find((t) => validSet.has(t));
      if (match) return match;
    }
  }

  // Fall back to action-based default
  if (action && ACTION_DEFAULTS[action]) {
    const def = ACTION_DEFAULTS[action];
    if (validSet.has(def)) return def;
  }

  // Final fallback
  return validSet.has("flux-dev") ? "flux-dev" : [...validSet][0] || null;
}

function commonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/**
 * Build a human-readable capability summary for the system prompt.
 * Grouped by type (image, video, audio, utility).
 */
export function buildCapabilitySummary(): string {
  const caps = cache && cache.length > 0 ? cache : null;
  if (!caps) return "";

  const groups: Record<string, string[]> = {
    image: [],
    video: [],
    audio: [],
    utility: [],
  };

  for (const cap of caps) {
    const id = cap.model_id.toLowerCase();
    if (id.includes("video") || id.includes("i2v") || id.includes("t2v") || id.includes("ltx")) {
      groups.video.push(cap.name);
    } else if (id.includes("tts") || id.includes("audio")) {
      groups.audio.push(cap.name);
    } else if (id.includes("upscale") || id.includes("bg-remove")) {
      groups.utility.push(cap.name);
    } else {
      groups.image.push(cap.name);
    }
  }

  const lines: string[] = [];
  if (groups.image.length) lines.push(`Images: ${groups.image.join(", ")}`);
  if (groups.video.length) lines.push(`Video: ${groups.video.join(", ")}`);
  if (groups.audio.length) lines.push(`Audio: ${groups.audio.join(", ")}`);
  if (groups.utility.length) lines.push(`Utility: ${groups.utility.join(", ")}`);
  return lines.join("\n");
}

/** Force refresh — call after SDK URL changes in settings. */
export function invalidateCapabilities() {
  cache = null;
  fetchPromise = null;
}
