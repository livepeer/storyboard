import { create } from "zustand";
import type { SkillMeta } from "./types";

const USER_SKILLS_KEY = "storyboard_user_skills";

interface SkillState {
  registry: SkillMeta[];
  loaded: string[]; // active skill IDs
  contentCache: Record<string, string>;
  initialized: boolean;

  initRegistry: () => Promise<void>;
  loadSkill: (id: string) => Promise<string | null>;
  unloadSkill: (id: string) => void;
  clearLoaded: () => void;
  loadByCategory: (cat: string) => Promise<void>;
  addUserSkill: (id: string, description: string, promptPrefix: string) => void;
  updateUserSkill: (id: string, patch: Partial<SkillMeta>) => void;
  getActiveStyleOverrides: () => SkillMeta[];
  getLoadedContent: () => string;
}

function loadUserSkills(): SkillMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USER_SKILLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveUserSkills(skills: SkillMeta[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_SKILLS_KEY, JSON.stringify(skills));
}

export const useSkillStore = create<SkillState>((set, get) => ({
  registry: [],
  loaded: [],
  contentCache: {},
  initialized: false,

  initRegistry: async () => {
    if (get().initialized) return;
    try {
      const resp = await fetch("/skills/_registry.json");
      const builtIn: SkillMeta[] = await resp.json();
      const user = loadUserSkills();
      set({ registry: [...builtIn, ...user], initialized: true });
    } catch {
      set({ initialized: true });
    }
  },

  loadSkill: async (id: string) => {
    const { registry, contentCache, loaded } = get();
    const meta = registry.find((s) => s.id === id);
    if (!meta) return null;

    // If style-override, auto-unload other styles
    if (meta.type === "style-override") {
      const otherStyles = loaded.filter((lid) => {
        const m = registry.find((s) => s.id === lid);
        return m?.type === "style-override";
      });
      if (otherStyles.length > 0) {
        set({ loaded: loaded.filter((lid) => !otherStyles.includes(lid)) });
      }
    }

    // Check cache
    if (contentCache[id]) {
      set((s) => ({ loaded: [...new Set([...s.loaded, id])] }));
      return contentCache[id];
    }

    // Fetch
    const path = meta.path || `${id}.md`;
    try {
      const resp = await fetch(`/skills/${path}`);
      if (!resp.ok) return null;
      const content = await resp.text();
      set((s) => ({
        contentCache: { ...s.contentCache, [id]: content },
        loaded: [...new Set([...s.loaded, id])],
      }));
      return content;
    } catch { return null; }
  },

  unloadSkill: (id: string) => {
    set((s) => ({ loaded: s.loaded.filter((l) => l !== id) }));
  },

  clearLoaded: () => {
    set({ loaded: [] });
  },

  loadByCategory: async (cat: string) => {
    const { registry } = get();
    const matching = registry.filter((s) => s.category === cat);
    for (const skill of matching) {
      await get().loadSkill(skill.id);
    }
  },

  addUserSkill: (id: string, description: string, promptPrefix: string) => {
    const meta: SkillMeta = {
      id,
      category: "user",
      type: promptPrefix ? "style-override" : "standard",
      description,
      prompt_prefix: promptPrefix || undefined,
      created_by: "user",
      created_at: Date.now(),
      iterations: 0,
    };
    const content = `# ${id}\n\n${description}\n`;
    const userSkills = loadUserSkills();
    const existing = userSkills.findIndex((s) => s.id === id);
    if (existing >= 0) userSkills[existing] = meta;
    else userSkills.push(meta);
    saveUserSkills(userSkills);

    set((s) => ({
      registry: [...s.registry.filter((r) => r.id !== id), meta],
      contentCache: { ...s.contentCache, [id]: content },
      loaded: [...new Set([...s.loaded, id])],
    }));
  },

  updateUserSkill: (id: string, patch: Partial<SkillMeta>) => {
    const userSkills = loadUserSkills();
    const idx = userSkills.findIndex((s) => s.id === id);
    if (idx < 0) return;
    userSkills[idx] = { ...userSkills[idx], ...patch, iterations: (userSkills[idx].iterations || 0) + 1 };
    saveUserSkills(userSkills);
    set((s) => ({
      registry: s.registry.map((r) => r.id === id ? { ...r, ...patch } : r),
    }));
  },

  getActiveStyleOverrides: () => {
    const { registry, loaded } = get();
    return loaded
      .map((id) => registry.find((s) => s.id === id))
      .filter((s): s is SkillMeta => s?.type === "style-override");
  },

  getLoadedContent: () => {
    const { loaded, contentCache } = get();
    return loaded
      .map((id) => contentCache[id])
      .filter(Boolean)
      .join("\n\n---\n\n");
  },
}));
