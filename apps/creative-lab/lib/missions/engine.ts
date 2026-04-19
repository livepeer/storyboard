import { getMission } from "./catalog";
import type { MissionStep } from "./types";
import { useProgressStore } from "../stores/progress-store";

export function startMission(missionId: string): void {
  const mission = getMission(missionId);
  if (!mission) {
    throw new Error(`Mission not found: ${missionId}`);
  }

  const { isMissionUnlocked, startMission: storeStartMission } = useProgressStore.getState();

  if (!isMissionUnlocked(missionId, mission.unlockAfter)) {
    throw new Error(`Mission "${missionId}" is locked. Complete prerequisites first.`);
  }

  storeStartMission(missionId);
}

export function getCurrentStep(missionId: string): MissionStep | null {
  const mission = getMission(missionId);
  if (!mission) return null;

  const { getProgress } = useProgressStore.getState();
  const progress = getProgress(missionId);
  if (!progress) return null;

  const step = mission.steps[progress.currentStep];
  return step ?? null;
}

export function advanceToNextStep(missionId: string): MissionStep | null {
  const mission = getMission(missionId);
  if (!mission) return null;

  const { advanceStep, completeMission, getProgress } = useProgressStore.getState();
  const progress = getProgress(missionId);
  if (!progress) return null;

  const nextStepIndex = progress.currentStep + 1;

  if (nextStepIndex >= mission.steps.length) {
    // Mission complete — award max stars
    completeMission(missionId, mission.maxStars);
    return null;
  }

  advanceStep(missionId);
  return mission.steps[nextStepIndex];
}
