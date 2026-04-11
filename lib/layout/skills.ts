import type { LayoutSkill } from "./types";

const BUILT_IN_SKILLS: LayoutSkill[] = [
  {
    id: "basic", name: "Basic Grid",
    description: "Clean L\u2192R grid, 6 per row, batch-grouped",
    category: "built-in",
    preset: { cols: 6, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 0, startCorner: "top-left" },
  },
  {
    id: "narrative", name: "Narrative Flow",
    description: "Story sequence, one row per prompt batch",
    category: "built-in",
    preset: { cols: 8, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 40, startCorner: "top-left" },
  },
  {
    id: "episode", name: "Episode Groups",
    description: "Clustered by episode, narrative within each",
    category: "built-in",
    preset: { cols: 6, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "episode", rowSeparator: 60, startCorner: "top-left" },
  },
  {
    id: "graphic-novel", name: "Graphic Novel",
    description: "Dense 3-col panel layout, zigzag flow",
    category: "built-in",
    preset: { cols: 3, gap: 8, cardScale: 1.3, flow: "zigzag", groupBy: "batch", rowSeparator: 24, startCorner: "top-left" },
  },
  {
    id: "ads-board", name: "Ads Moodboard",
    description: "Spacious center-out brainstorm layout",
    category: "built-in",
    preset: { cols: 4, gap: 32, cardScale: 1.0, flow: "center-out", groupBy: "none", rowSeparator: 0, startCorner: "center" },
  },
  {
    id: "movie-board", name: "Movie Storyboard",
    description: "Cinematic 5-col wide flow with scene breaks",
    category: "built-in",
    preset: { cols: 5, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 48, startCorner: "top-left" },
  },
  {
    id: "balanced", name: "Balanced Flow",
    description: "Even spacing, ideas and flow balanced",
    category: "built-in",
    preset: { cols: 4, gap: 28, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 32, startCorner: "top-left" },
  },
  {
    id: "freeform", name: "Freeform",
    description: "Manual mode \u2014 no auto-layout, keeps current positions",
    category: "built-in",
    // No preset — engine returns current positions unchanged
  },
];

export function getBuiltInSkills(): LayoutSkill[] {
  return BUILT_IN_SKILLS;
}

export function getBuiltInSkill(id: string): LayoutSkill | undefined {
  return BUILT_IN_SKILLS.find((s) => s.id === id);
}
