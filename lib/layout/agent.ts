import type { LayoutContext, CardPosition } from "./types";
import type { Card } from "@/lib/canvas/types";
import { BASE_CARD_W, BASE_CARD_H, BASE_GAP, HEADER_OFFSET } from "./types";
import { runLayout } from "./engine";
import { useLayoutStore } from "./store";
import { getBuiltInSkill } from "./skills";

export function pickStrategy(ctx: LayoutContext, userPref: string | null): string {
  if (userPref) return userPref;
  if (ctx.activeEpisodeId && ctx.episodes.length > 1) return "episode";
  // Prefer narrative (project-grouped) when projects exist — keeps
  // each project's scenes together in scene order on separate rows.
  let hasProjects = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useProjectStore } = require("@/lib/projects/store");
    hasProjects = useProjectStore.getState().projects.length > 0;
  } catch { /* test env or SSR — skip project check */ }
  if (hasProjects || ctx.edges.length > 3) return "narrative";
  return "basic";
}

export function prePlan(
  existingCards: Card[],
  newCount: number,
  skillId: string
): Array<{ x: number; y: number; w: number; h: number }> {
  if (newCount === 0) return [];

  const skill = useLayoutStore.getState().getSkill(skillId) || getBuiltInSkill("basic")!;
  const preset = skill.preset;
  if (!preset) return simpleGrid(existingCards.length, newCount);

  const cardW = Math.round(BASE_CARD_W * preset.cardScale);
  const cardH = Math.round(BASE_CARD_H * preset.cardScale);
  const gap = preset.gap;
  const cols = preset.cols;

  let maxY = 0;
  for (const c of existingCards) {
    const bottom = c.y + c.h;
    if (bottom > maxY) maxY = bottom;
  }
  // Add extra clearance so new cards don't visually overlap with episode bounding boxes
  // (episode labels extend ~20px padding + 32px header around their cards)
  const episodeClearance = 60;
  const startY = existingCards.length === 0
    ? gap + HEADER_OFFSET
    : maxY + gap + Math.max(preset.rowSeparator || 0, episodeClearance);

  const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < newCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: gap + col * (cardW + gap),
      y: startY + row * (cardH + gap),
      w: cardW,
      h: cardH,
    });
  }
  return positions;
}

function simpleGrid(existingCount: number, newCount: number) {
  const cols = 6;
  const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < newCount; i++) {
    const idx = existingCount + i;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    positions.push({
      x: BASE_GAP + col * (BASE_CARD_W + BASE_GAP),
      y: BASE_GAP + HEADER_OFFSET + row * (BASE_CARD_H + BASE_GAP),
      w: BASE_CARD_W,
      h: BASE_CARD_H,
    });
  }
  return positions;
}

export function organizeCanvas(skillId?: string): CardPosition[] {
  const { useCanvasStore } = require("@/lib/canvas/store");
  const { useEpisodeStore } = require("@/lib/episodes/store");
  const canvasState = useCanvasStore.getState();
  const epState = useEpisodeStore.getState();

  const ctx: LayoutContext = {
    cards: canvasState.cards,
    edges: canvasState.edges,
    episodes: epState.episodes,
    activeEpisodeId: epState.activeEpisodeId,
    canvasWidth: 1920,
  };

  const store = useLayoutStore.getState();
  const id = skillId || pickStrategy(ctx, store.activeSkillId);
  const skill = store.getSkill(id) || getBuiltInSkill("basic")!;

  if (skillId) store.setActiveSkill(skillId);

  return runLayout(ctx, skill);
}
