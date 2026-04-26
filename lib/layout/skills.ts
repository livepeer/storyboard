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
    description: "Story sequence, one row per project with scene ordering",
    category: "built-in",
    preset: { cols: 8, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "project", rowSeparator: 40, startCorner: "top-left" },
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
    description: "Cinematic 5-col wide flow with project scene ordering",
    category: "built-in",
    preset: { cols: 5, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "project", rowSeparator: 48, startCorner: "top-left" },
  },
  {
    id: "balanced", name: "Balanced Flow",
    description: "Even spacing, ideas and flow balanced",
    category: "built-in",
    preset: { cols: 4, gap: 28, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 32, startCorner: "top-left" },
  },
  {
    id: "pipeline", name: "Pipeline Flow",
    description: "Follow edge connections to show content evolution — each chain is a column, root at top",
    category: "built-in",
    layoutFn: (ctx) => {
      // Build adjacency from edges
      const children = new Map<string, string[]>();
      const hasParent = new Set<string>();
      for (const e of ctx.edges) {
        if (!children.has(e.fromRefId)) children.set(e.fromRefId, []);
        children.get(e.fromRefId)!.push(e.toRefId);
        hasParent.add(e.toRefId);
      }
      // Find roots (no incoming edges)
      const roots = ctx.cards.filter((c) => !hasParent.has(c.refId));
      const orphans = ctx.cards.filter((c) => !hasParent.has(c.refId) && !children.has(c.refId));
      const chainRoots = roots.filter((c) => children.has(c.refId));

      const byRefId = new Map(ctx.cards.map((c) => [c.refId, c]));
      const positions: Array<{ cardId: string; x: number; y: number; w: number; h: number }> = [];
      const placed = new Set<string>();

      const COL_W = 360;
      const ROW_H = 320;
      const GAP = 24;
      let col = 0;

      // Layout each chain as a column
      for (const root of chainRoots) {
        let row = 0;
        const queue = [root.refId];
        const visited = new Set<string>();
        while (queue.length > 0) {
          const refId = queue.shift()!;
          if (visited.has(refId)) continue;
          visited.add(refId);
          const card = byRefId.get(refId);
          if (!card) continue;
          positions.push({
            cardId: card.id,
            x: GAP + col * COL_W,
            y: GAP + 48 + row * ROW_H,
            w: card.w,
            h: card.h,
          });
          placed.add(card.refId);
          row++;
          const kids = children.get(refId) || [];
          // First child continues down, siblings start new columns
          for (let i = 0; i < kids.length; i++) {
            if (i === 0) queue.unshift(kids[i]); // depth-first for main chain
            else queue.push(kids[i]); // breadth for branches
          }
        }
        col++;
      }

      // Place orphans in a row at the bottom
      let orphanX = GAP;
      const orphanY = GAP + 48 + (positions.length > 0 ? Math.max(...positions.map((p) => p.y + p.h)) + GAP : 0);
      for (const o of orphans) {
        if (placed.has(o.refId)) continue;
        positions.push({ cardId: o.id, x: orphanX, y: orphanY, w: o.w, h: o.h });
        placed.add(o.refId);
        orphanX += o.w + GAP;
      }

      // Place any remaining unplaced cards
      for (const c of ctx.cards) {
        if (placed.has(c.refId)) continue;
        positions.push({ cardId: c.id, x: orphanX, y: orphanY, w: c.w, h: c.h });
        orphanX += c.w + GAP;
      }

      return positions;
    },
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
