import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MissionProgress, SavedCreation } from "../missions/types";

interface ProgressStore {
  progress: MissionProgress[];
  totalStars: number;

  startMission: (missionId: string) => void;
  advanceStep: (missionId: string) => void;
  completeMission: (missionId: string, stars: number) => void;
  addArtifact: (missionId: string, artifactRefId: string) => void;
  saveCreation: (missionId: string, creation: SavedCreation) => void;
  getAllSavedCreations: () => Array<SavedCreation & { missionId: string }>;
  getProgress: (missionId: string) => MissionProgress | undefined;
  isMissionUnlocked: (missionId: string, unlockAfter?: string[]) => boolean;
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      progress: [],
      totalStars: 0,

      startMission: (missionId) => {
        const now = Date.now();
        set((state) => {
          const existing = state.progress.find((p) => p.missionId === missionId);
          let newProgress: MissionProgress[];
          if (existing) {
            // Reset progress for redo — keep best stars and saved creations
            newProgress = state.progress.map((p) =>
              p.missionId === missionId
                ? { ...p, currentStep: 0, completed: false, artifacts: [], startedAt: now, completedAt: undefined }
                : p
            );
          } else {
            newProgress = [
              ...state.progress,
              {
                missionId,
                currentStep: 0,
                completed: false,
                stars: 0,
                artifacts: [],
                startedAt: now,
              },
            ];
          }
          return { progress: newProgress };
        });
      },

      advanceStep: (missionId) => {
        set((state) => ({
          progress: state.progress.map((p) =>
            p.missionId === missionId ? { ...p, currentStep: p.currentStep + 1 } : p
          ),
        }));
      },

      completeMission: (missionId, stars) => {
        set((state) => {
          const newProgress = state.progress.map((p) => {
            if (p.missionId !== missionId) return p;
            return {
              ...p,
              completed: true,
              stars: Math.max(p.stars, stars),
              completedAt: Date.now(),
            };
          });
          const totalStars = newProgress.reduce((sum, p) => sum + p.stars, 0);
          return { progress: newProgress, totalStars };
        });
      },

      addArtifact: (missionId, artifactRefId) => {
        set((state) => ({
          progress: state.progress.map((p) =>
            p.missionId === missionId
              ? { ...p, artifacts: [...p.artifacts, artifactRefId] }
              : p
          ),
        }));
      },

      saveCreation: (missionId, creation) => {
        set((state) => ({
          progress: state.progress.map((p) =>
            p.missionId === missionId
              ? { ...p, savedCreations: [...(p.savedCreations || []), creation] }
              : p
          ),
        }));
      },

      getAllSavedCreations: () => {
        return get().progress.flatMap((p) =>
          (p.savedCreations || []).map((c) => ({ ...c, missionId: p.missionId }))
        );
      },

      getProgress: (missionId) => {
        return get().progress.find((p) => p.missionId === missionId);
      },

      isMissionUnlocked: (missionId, unlockAfter) => {
        if (!unlockAfter || unlockAfter.length === 0) return true;
        const { progress } = get();
        return unlockAfter.every((prerequisiteId) =>
          progress.some((p) => p.missionId === prerequisiteId && p.completed)
        );
      },
    }),
    {
      name: "creative-lab:progress",
    }
  )
);
