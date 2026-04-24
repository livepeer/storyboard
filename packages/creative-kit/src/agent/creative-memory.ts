/**
 * Adaptive Creative Memory — learns user preferences from usage patterns.
 *
 * Tracks what the user keeps, deletes, regenerates, and explicitly rates.
 * Over time, builds a preference profile that auto-applies to new projects.
 *
 * Signals:
 * - User keeps an image → +1 to that style/model
 * - User deletes an image → -1 to that style/model
 * - User regenerates → -0.5 to old, neutral to new
 * - User says "I like this" → +2 to that style
 * - User says "make it darker" → +1 to "dark mood"
 * - User edits context to change style → strong signal for new style
 */

export interface CreativePreference {
  category: "style" | "model" | "mood" | "palette" | "composition";
  value: string;
  score: number;       // -10 to +10, higher = more preferred
  usageCount: number;
  lastUsed: number;
}

export interface CreativeMemoryState {
  preferences: CreativePreference[];
  /** Total number of signals recorded */
  totalSignals: number;
  /** When the memory was last updated */
  lastUpdated: number;
}

const STORAGE_KEY = "creative_memory";
const MAX_PREFERENCES = 100;
const DECAY_RATE = 0.95; // older preferences decay slightly

function load(): CreativeMemoryState {
  if (typeof window === "undefined") return { preferences: [], totalSignals: 0, lastUpdated: 0 };
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || { preferences: [], totalSignals: 0, lastUpdated: 0 };
  } catch { return { preferences: [], totalSignals: 0, lastUpdated: 0 }; }
}

function save(state: CreativeMemoryState): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* quota */ }
}

let _state: CreativeMemoryState | null = null;

function getState(): CreativeMemoryState {
  if (!_state) _state = load();
  return _state;
}

function findOrCreate(category: CreativePreference["category"], value: string): CreativePreference {
  const state = getState();
  const lower = value.toLowerCase().trim();
  let pref = state.preferences.find((p) => p.category === category && p.value.toLowerCase() === lower);
  if (!pref) {
    pref = { category, value: lower, score: 0, usageCount: 0, lastUsed: 0 };
    state.preferences.push(pref);
    // Cap size
    if (state.preferences.length > MAX_PREFERENCES) {
      state.preferences.sort((a, b) => b.score - a.score);
      state.preferences = state.preferences.slice(0, MAX_PREFERENCES);
    }
  }
  return pref;
}

/**
 * Record a positive signal (user kept/liked this).
 */
export function recordPositive(category: CreativePreference["category"], value: string, weight = 1): void {
  const pref = findOrCreate(category, value);
  pref.score = Math.min(10, pref.score + weight);
  pref.usageCount++;
  pref.lastUsed = Date.now();
  getState().totalSignals++;
  getState().lastUpdated = Date.now();
  save(getState());
}

/**
 * Record a negative signal (user deleted/regenerated this).
 */
export function recordNegative(category: CreativePreference["category"], value: string, weight = 1): void {
  const pref = findOrCreate(category, value);
  pref.score = Math.max(-10, pref.score - weight);
  pref.usageCount++;
  pref.lastUsed = Date.now();
  getState().totalSignals++;
  getState().lastUpdated = Date.now();
  save(getState());
}

/**
 * Get the user's top preferences for a category.
 * Returns sorted by score (highest first).
 */
export function getTopPreferences(category: CreativePreference["category"], limit = 5): CreativePreference[] {
  const state = getState();
  return state.preferences
    .filter((p) => p.category === category && p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get a preference hint for the model router.
 * Returns the preferred model for a given action, or null.
 */
export function getPreferredModel(): string | null {
  const models = getTopPreferences("model", 1);
  return models.length > 0 ? models[0].value : null;
}

/**
 * Get a style hint to suggest to the user.
 * Returns the top style preference, or null.
 */
export function getPreferredStyle(): string | null {
  const styles = getTopPreferences("style", 1);
  return styles.length > 0 ? styles[0].value : null;
}

/**
 * Build a preference-aware prompt prefix.
 * If the user has strong preferences, inject them subtly.
 */
export function buildPreferencePrefix(): string {
  const styles = getTopPreferences("style", 2);
  const moods = getTopPreferences("mood", 1);
  const palettes = getTopPreferences("palette", 1);

  const parts: string[] = [];
  if (styles.length > 0 && styles[0].score >= 3) {
    parts.push(styles[0].value);
  }
  if (moods.length > 0 && moods[0].score >= 3) {
    parts.push(moods[0].value);
  }
  if (palettes.length > 0 && palettes[0].score >= 3) {
    parts.push(palettes[0].value);
  }

  return parts.length > 0 ? parts.join(", ") + ", " : "";
}

/**
 * Apply decay to all preferences (call periodically).
 * Older, less-used preferences fade over time.
 */
export function applyDecay(): void {
  const state = getState();
  const now = Date.now();
  for (const pref of state.preferences) {
    const ageHours = (now - pref.lastUsed) / (1000 * 60 * 60);
    if (ageHours > 24) {
      pref.score *= DECAY_RATE;
      // Remove very low scores
      if (Math.abs(pref.score) < 0.1) pref.score = 0;
    }
  }
  // Remove zero-score preferences
  state.preferences = state.preferences.filter((p) => p.score !== 0 || p.usageCount > 0);
  save(state);
}

/**
 * Get all preferences (for UI display / debugging).
 */
export function getAllPreferences(): CreativeMemoryState {
  return { ...getState() };
}

/**
 * Clear all preferences.
 */
export function clearMemory(): void {
  _state = { preferences: [], totalSignals: 0, lastUpdated: 0 };
  save(_state);
}
