/**
 * Smart Model Router — selects the best model based on speed, style match, and capacity.
 *
 * Priority: speed (60%) > style match (30%) > capacity (10%)
 *
 * Each model has a profile with speed score, style tags, and capacity weight.
 * The router scores every available model against the request and picks the winner.
 */

export interface ModelProfile {
  id: string;
  /** Speed score 0-10. Higher = faster. */
  speed: number;
  /** What this model is best at. Matched against prompt/style keywords. */
  styles: string[];
  /** Capacity weight 0-10. Higher = more available. */
  capacity: number;
  /** Media type this model produces. */
  type: "image" | "video" | "audio";
  /** Action this model handles. */
  actions: string[];
}

export interface RouteRequest {
  action: string;
  prompt: string;
  styleHint?: string;
  userText?: string;
  /** Only consider models in this set (live capabilities). */
  availableModels?: Set<string>;
}

export interface RouteResult {
  model: string;
  type: "image" | "video" | "audio";
  score: number;
  reason: string;
}

/** Built-in model profiles. Speed is king — flux-dev gets 9/10. */
const MODEL_PROFILES: ModelProfile[] = [
  // ─── Image Generation ───
  { id: "flux-dev",         speed: 9,  capacity: 9, type: "image", actions: ["generate"],
    styles: ["cinematic", "anime", "ghibli", "fantasy", "sci-fi", "noir", "general", "creative", "artistic", "realistic", "default"] },
  { id: "flux-schnell",     speed: 10, capacity: 8, type: "image", actions: ["generate"],
    styles: ["fast", "draft", "quick", "preview", "sketch"] },
  { id: "gpt-image",        speed: 5,  capacity: 6, type: "image", actions: ["generate"],
    styles: ["logo", "text", "infographic", "diagram", "typography", "product", "cartoon", "comic", "manga", "children", "pixel-art", "lego"] },
  { id: "recraft-v4",       speed: 6,  capacity: 6, type: "image", actions: ["generate"],
    styles: ["illustration", "editorial", "graphic-design", "icon", "brand", "poster", "concept-art", "vector"] },
  { id: "seedream-5-lite",  speed: 7,  capacity: 6, type: "image", actions: ["generate"],
    styles: ["photorealistic", "photo", "portrait", "dslr", "architecture", "studio", "hyperrealistic"] },
  { id: "gemini-image",     speed: 6,  capacity: 7, type: "image", actions: ["generate"],
    styles: ["watercolor", "oil-paint", "impressionist", "abstract-art", "gouache", "pastel", "acrylic", "painterly"] },
  { id: "nano-banana",      speed: 10, capacity: 8, type: "image", actions: ["generate"],
    styles: ["fast", "tiny", "thumbnail"] },

  // ─── Image Edit ───
  { id: "kontext-edit",     speed: 7,  capacity: 7, type: "image", actions: ["restyle"],
    styles: ["edit", "restyle", "transform"] },
  { id: "gpt-image-edit",   speed: 5,  capacity: 6, type: "image", actions: ["restyle"],
    styles: ["text-edit", "product-edit", "logo-edit"] },

  // ─── Video I2V ───
  { id: "seedance-i2v",     speed: 6,  capacity: 5, type: "video", actions: ["animate"],
    styles: ["cinematic", "motion", "animate", "film", "audio"] },
  { id: "seedance-i2v-fast",speed: 8,  capacity: 5, type: "video", actions: ["animate"],
    styles: ["fast", "quick", "preview"] },
  { id: "kling-o3-i2v",     speed: 4,  capacity: 4, type: "video", actions: ["animate"],
    styles: ["4k", "ultra", "premium", "cinema", "highest-quality"] },
  { id: "kling-v3-i2v",     speed: 5,  capacity: 4, type: "video", actions: ["animate"],
    styles: ["4k", "high-quality"] },
  { id: "veo-i2v",          speed: 6,  capacity: 5, type: "video", actions: ["animate"],
    styles: ["cinematic", "smooth"] },
  { id: "ltx-i2v",          speed: 7,  capacity: 6, type: "video", actions: ["animate"],
    styles: ["fast", "general"] },

  // ─── Video T2V ───
  { id: "kling-o3-t2v",     speed: 4,  capacity: 4, type: "video", actions: ["generate"],
    styles: ["4k", "ultra", "premium", "cinema"] },
  { id: "veo-t2v",          speed: 5,  capacity: 5, type: "video", actions: ["generate"],
    styles: ["cinematic", "general"] },
  { id: "ltx-t2v",          speed: 7,  capacity: 6, type: "video", actions: ["generate"],
    styles: ["fast", "general"] },

  // ─── TTS ───
  { id: "chatterbox-tts",   speed: 8,  capacity: 7, type: "audio", actions: ["tts"],
    styles: ["voice", "clone", "speech"] },
  { id: "gemini-tts",       speed: 7,  capacity: 7, type: "audio", actions: ["tts"],
    styles: ["voice", "persona", "character"] },
];

/** Weights for scoring. Speed is most important. */
const WEIGHTS = { speed: 0.60, style: 0.30, capacity: 0.10 };

/** Score how well a model's styles match the request text. Returns 0-10. */
function scoreStyleMatch(profile: ModelProfile, text: string): number {
  if (!text) {
    // No text — prefer models tagged "default"
    return profile.styles.includes("default") ? 7 : 5;
  }
  const lower = text.toLowerCase();
  let matches = 0;
  for (const style of profile.styles) {
    if (style === "default") continue; // don't match the literal word "default"
    const pattern = style.replace(/-/g, "[- ]?");
    if (new RegExp(`\\b${pattern}\\b`, "i").test(lower)) {
      matches++;
    }
  }
  if (matches === 0) {
    // No specific match — "default" models get a small bonus
    return profile.styles.includes("default") ? 5 : 3;
  }
  return Math.min(10, 5 + matches * 2); // 1 match = 7, 2 = 9, 3+ = 10
}

/**
 * Route a request to the best model.
 * Returns the highest-scoring model that's available and handles the action.
 */
export function routeModel(req: RouteRequest): RouteResult {
  const text = `${req.prompt} ${req.styleHint || ""} ${req.userText || ""}`;
  const available = req.availableModels;

  // Filter to models that handle this action and are available
  const candidates = MODEL_PROFILES.filter((p) => {
    if (!p.actions.includes(req.action)) return false;
    if (available && available.size > 0 && !available.has(p.id)) return false;
    return true;
  });

  if (candidates.length === 0) {
    // Fallback: return flux-dev for generate, seedance for animate
    const fallback = req.action === "animate" ? "seedance-i2v"
      : req.action === "tts" ? "chatterbox-tts"
      : "flux-dev";
    return { model: fallback, type: "image", score: 0, reason: "no candidates — fallback" };
  }

  // Score each candidate
  const scored = candidates.map((p) => {
    const styleScore = scoreStyleMatch(p, text);
    const total = p.speed * WEIGHTS.speed + styleScore * WEIGHTS.style + p.capacity * WEIGHTS.capacity;
    return { profile: p, score: total, styleScore };
  });

  // Sort by score (descending)
  scored.sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const reason = `speed=${winner.profile.speed} style=${winner.styleScore} cap=${winner.profile.capacity} → ${winner.score.toFixed(1)}`;

  return {
    model: winner.profile.id,
    type: winner.profile.type,
    score: winner.score,
    reason,
  };
}

// ─── Self-Learning: Track actual generation speed ─────────────────────────

interface ModelStats {
  totalMs: number;
  count: number;
  avgMs: number;
  lastMs: number;
}

const stats = new Map<string, ModelStats>();

/**
 * Record the actual generation time for a model.
 * Call this after every successful inference.
 * The router uses rolling avg to adjust speed scores.
 */
export function recordModelLatency(modelId: string, elapsedMs: number): void {
  const existing = stats.get(modelId) || { totalMs: 0, count: 0, avgMs: 0, lastMs: 0 };
  existing.totalMs += elapsedMs;
  existing.count++;
  existing.avgMs = existing.totalMs / existing.count;
  existing.lastMs = elapsedMs;
  stats.set(modelId, existing);

  // Update speed score based on measured avg latency.
  // Faster models get higher speed scores.
  // Baseline: 3s = speed 9, 6s = 7, 10s = 5, 20s = 3, 40s+ = 1
  const profile = MODEL_PROFILES.find((p) => p.id === modelId);
  if (profile && existing.count >= 2) { // need at least 2 samples
    const avgSec = existing.avgMs / 1000;
    const learned = Math.max(1, Math.min(10, 10 - Math.log2(avgSec)));
    // Blend: 70% learned, 30% original (don't fully abandon profile defaults)
    profile.speed = Math.round((learned * 0.7 + profile.speed * 0.3) * 10) / 10;
  }
}

/** Get stats for all tracked models (for UI/debugging). */
export function getModelStats(): Map<string, ModelStats & { currentSpeed: number }> {
  const result = new Map<string, ModelStats & { currentSpeed: number }>();
  for (const [id, s] of stats) {
    const profile = MODEL_PROFILES.find((p) => p.id === id);
    result.set(id, { ...s, currentSpeed: profile?.speed ?? 0 });
  }
  return result;
}

/** Get all model profiles (for UI/debugging). */
export function getModelProfiles(): ModelProfile[] {
  return [...MODEL_PROFILES];
}

/** Add or update a model profile at runtime. */
export function registerModelProfile(profile: ModelProfile): void {
  const idx = MODEL_PROFILES.findIndex((p) => p.id === profile.id);
  if (idx >= 0) MODEL_PROFILES[idx] = profile;
  else MODEL_PROFILES.push(profile);
}
