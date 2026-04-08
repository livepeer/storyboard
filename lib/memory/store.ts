/**
 * Memory store — persists user preferences and style DNA across sessions.
 * Stored in localStorage, loaded into system prompt context (~100 tokens).
 */

const MEMORY_KEY = "storyboard_memory";

export interface StyleDNA {
  name: string;
  description: string;
  prompt_prefix: string;
  model_hint?: string;
  /** URL of the reference image that defined this style */
  reference_url?: string;
  created_at: number;
}

export interface QualityRating {
  ref_id: string;
  capability: string;
  prompt: string;
  rating: number; // 1-5
  timestamp: number;
}

export interface MemoryState {
  style_dna: StyleDNA[];
  ratings: QualityRating[];
  preferences: Record<string, string>;
}

function defaultState(): MemoryState {
  return { style_dna: [], ratings: [], preferences: {} };
}

function load(): MemoryState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
  } catch {
    return defaultState();
  }
}

function save(state: MemoryState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MEMORY_KEY, JSON.stringify(state));
}

// --- Style DNA ---

export function addStyleDNA(style: Omit<StyleDNA, "created_at">): StyleDNA {
  const state = load();
  const entry: StyleDNA = { ...style, created_at: Date.now() };
  // Replace existing with same name
  state.style_dna = state.style_dna.filter((s) => s.name !== style.name);
  state.style_dna.push(entry);
  // Keep max 10 styles
  if (state.style_dna.length > 10) state.style_dna.shift();
  save(state);
  return entry;
}

export function getStyleDNA(): StyleDNA[] {
  return load().style_dna;
}

export function getActiveStyle(): StyleDNA | null {
  const state = load();
  const activeName = state.preferences["active_style"];
  if (!activeName) return null;
  return state.style_dna.find((s) => s.name === activeName) || null;
}

export function setActiveStyle(name: string | null) {
  const state = load();
  if (name) {
    state.preferences["active_style"] = name;
  } else {
    delete state.preferences["active_style"];
  }
  save(state);
}

// --- Quality Ratings ---

export function addRating(rating: Omit<QualityRating, "timestamp">): QualityRating {
  const state = load();
  const entry: QualityRating = { ...rating, timestamp: Date.now() };
  state.ratings.push(entry);
  // Keep max 100 ratings
  if (state.ratings.length > 100) state.ratings.splice(0, state.ratings.length - 100);
  save(state);
  return entry;
}

export function getRatings(): QualityRating[] {
  return load().ratings;
}

// --- Preferences ---

export function setPreference(key: string, value: string) {
  const state = load();
  state.preferences[key] = value;
  save(state);
}

export function getPreference(key: string): string | undefined {
  return load().preferences[key];
}

// --- Memory Summary (for system prompt injection, ~100 tokens) ---

export function getMemorySummary(): string {
  const state = load();
  const parts: string[] = [];

  // Active style
  const activeStyle = getActiveStyle();
  if (activeStyle) {
    parts.push(`Active style: "${activeStyle.name}" — ${activeStyle.description}. Prefix: "${activeStyle.prompt_prefix}"`);
  }

  // Available styles
  if (state.style_dna.length > 0) {
    const names = state.style_dna.map((s) => s.name).join(", ");
    parts.push(`Saved styles: ${names}`);
  }

  // Top model preferences from ratings
  if (state.ratings.length >= 3) {
    const capCounts: Record<string, { total: number; sum: number }> = {};
    for (const r of state.ratings) {
      if (!capCounts[r.capability]) capCounts[r.capability] = { total: 0, sum: 0 };
      capCounts[r.capability].total++;
      capCounts[r.capability].sum += r.rating;
    }
    const best = Object.entries(capCounts)
      .filter(([, v]) => v.total >= 2)
      .sort((a, b) => b[1].sum / b[1].total - a[1].sum / a[1].total)
      .slice(0, 2);
    if (best.length > 0) {
      const prefs = best.map(
        ([cap, v]) => `${cap}: ${(v.sum / v.total).toFixed(1)}/5`
      );
      parts.push(`Preferred models: ${prefs.join(", ")}`);
    }
  }

  // Custom preferences
  const skip = new Set(["active_style"]);
  for (const [k, v] of Object.entries(state.preferences)) {
    if (!skip.has(k)) parts.push(`${k}: ${v}`);
  }

  return parts.length > 0 ? parts.join(". ") + "." : "";
}

export function clearMemory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MEMORY_KEY);
}
