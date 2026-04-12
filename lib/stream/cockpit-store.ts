import { create } from "zustand";
import type { StreamPreference, PinnedSkill, ToolCall, Bias } from "./cockpit-types";

const STORAGE_KEY = "storyboard_cockpit_skills";
const MAX_HISTORY = 100;

const STOP_WORDS = new Set([
  "the", "and", "with", "for", "make", "let", "put", "use", "this",
  "that", "have", "more", "less", "some", "any", "all",
]);

function extractTriggers(intent: string): string[] {
  return intent
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .filter((w) => !STOP_WORDS.has(w));
}

function loadPinnedSkills(): PinnedSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePinnedSkills(skills: PinnedSkill[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
}

interface CockpitStoreState {
  history: StreamPreference[];
  pinnedSkills: PinnedSkill[];

  recordHistory: (intent: string, applied: ToolCall, outcome: StreamPreference["outcome"]) => void;
  pinAction: (intent: string, action: ToolCall, name?: string) => PinnedSkill;
  unpinSkill: (id: string) => void;
  incrementSkillUses: (id: string) => void;
  findPinnedSkill: (intent: string) => PinnedSkill | null;
  getBiasFor: (intent: string) => Bias;
}

export const useCockpitStore = create<CockpitStoreState>((set, get) => ({
  history: [],
  pinnedSkills: loadPinnedSkills(),

  recordHistory: (intent, applied, outcome) =>
    set((s) => {
      const entry: StreamPreference = { intent, applied, outcome, timestamp: Date.now() };
      const next = [...s.history, entry];
      return { history: next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next };
    }),

  pinAction: (intent, action, name) => {
    const triggers = extractTriggers(intent);
    const skill: PinnedSkill = {
      id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name || (triggers[0] ? triggers.slice(0, 3).join(" ") : action.summary).slice(0, 30),
      triggers,
      action,
      createdAt: Date.now(),
      uses: 0,
    };
    set((s) => {
      const next = [...s.pinnedSkills, skill];
      savePinnedSkills(next);
      return { pinnedSkills: next };
    });
    return skill;
  },

  unpinSkill: (id) =>
    set((s) => {
      const next = s.pinnedSkills.filter((skill) => skill.id !== id);
      savePinnedSkills(next);
      return { pinnedSkills: next };
    }),

  incrementSkillUses: (id) =>
    set((s) => {
      const next = s.pinnedSkills.map((skill) =>
        skill.id === id ? { ...skill, uses: skill.uses + 1 } : skill
      );
      savePinnedSkills(next);
      return { pinnedSkills: next };
    }),

  findPinnedSkill: (intent) => {
    const intentTriggers = extractTriggers(intent);
    if (intentTriggers.length === 0) return null;
    let bestMatch: PinnedSkill | null = null;
    let bestScore = 0;
    for (const skill of get().pinnedSkills) {
      let score = 0;
      for (const trigger of intentTriggers) {
        if (skill.triggers.includes(trigger)) score++;
      }
      if (score > bestScore && score >= 1) {
        bestScore = score;
        bestMatch = skill;
      }
    }
    return bestMatch;
  },

  getBiasFor: (intent) => {
    const intentTriggers = extractTriggers(intent);
    const intentSet = new Set(intentTriggers);
    const matching = get().history.filter((entry) => {
      const entryTriggers = extractTriggers(entry.intent);
      return entryTriggers.some((t) => intentSet.has(t));
    });
    if (matching.length === 0) return { sampleCount: 0 };

    const presetCounts: Record<string, number> = {};
    let noiseSum = 0, noiseCount = 0, kvSum = 0, kvCount = 0;
    for (const entry of matching) {
      const params = entry.applied.params as Record<string, unknown>;
      const preset = params.preset as string | undefined;
      if (preset) presetCounts[preset] = (presetCounts[preset] || 0) + 1;
      const noise = params.noise_scale as number | undefined;
      if (typeof noise === "number") { noiseSum += noise; noiseCount++; }
      const kv = params.kv_cache_attention_bias as number | undefined;
      if (typeof kv === "number") { kvSum += kv; kvCount++; }
    }

    const preferredPreset = Object.entries(presetCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      preferredPreset,
      avgNoiseScale: noiseCount > 0 ? noiseSum / noiseCount : undefined,
      avgKvCache: kvCount > 0 ? kvSum / kvCount : undefined,
      sampleCount: matching.length,
    };
  },
}));
