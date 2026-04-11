import { create } from "zustand";
import type { LayoutSkill, LayoutPreset } from "./types";
import { getBuiltInSkills } from "./skills";

const STORAGE_KEY = "storyboard_layout_skills";

function loadUserSkills(): LayoutSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserSkills(skills: LayoutSkill[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
}

interface LayoutStoreState {
  userSkills: LayoutSkill[];
  activeSkillId: string | null;

  getAllSkills: () => LayoutSkill[];
  getSkill: (id: string) => LayoutSkill | undefined;
  setActiveSkill: (id: string | null) => void;
  addUserSkill: (skill: LayoutSkill) => void;
  removeUserSkill: (id: string) => void;
  captureLayout: (
    name: string,
    preset: LayoutPreset,
    rawPositions?: Array<{ cardId: string; x: number; y: number }>
  ) => LayoutSkill;
}

export const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  userSkills: loadUserSkills(),
  activeSkillId: null,

  getAllSkills: () => [...getBuiltInSkills(), ...get().userSkills],

  getSkill: (id) => {
    const builtIn = getBuiltInSkills().find((s) => s.id === id);
    if (builtIn) return builtIn;
    return get().userSkills.find((s) => s.id === id);
  },

  setActiveSkill: (id) => set({ activeSkillId: id }),

  addUserSkill: (skill) => {
    set((s) => {
      const updated = [...s.userSkills.filter((u) => u.id !== skill.id), skill];
      saveUserSkills(updated);
      return { userSkills: updated };
    });
  },

  removeUserSkill: (id) => {
    set((s) => {
      const updated = s.userSkills.filter((u) => u.id !== id);
      saveUserSkills(updated);
      return {
        userSkills: updated,
        activeSkillId: s.activeSkillId === id ? null : s.activeSkillId,
      };
    });
  },

  captureLayout: (name, preset, rawPositions) => {
    const id = `user_${name.toLowerCase().replace(/\s+/g, "-")}_${Date.now()}`;
    const skill: LayoutSkill = {
      id,
      name,
      description: "Captured from canvas",
      category: "user",
      preset,
    };
    if (rawPositions && rawPositions.length > 0) {
      const positions = [...rawPositions];
      skill.layoutFn = (ctx) =>
        ctx.cards.map((c) => {
          const saved = positions.find((p) => p.cardId === c.id);
          return saved
            ? { cardId: c.id, x: saved.x, y: saved.y }
            : { cardId: c.id, x: c.x, y: c.y };
        });
    }
    get().addUserSkill(skill);
    return skill;
  },
}));
