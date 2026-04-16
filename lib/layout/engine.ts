import type { LayoutSkill, LayoutContext, CardPosition, LayoutPreset } from "./types";
import type { Card } from "@/lib/canvas/types";
import { BASE_CARD_W, BASE_CARD_H, HEADER_OFFSET } from "./types";

export function runLayout(ctx: LayoutContext, skill: LayoutSkill): CardPosition[] {
  if (ctx.cards.length === 0) return [];
  if (skill.layoutFn) return skill.layoutFn(ctx);
  if (!skill.preset) {
    return ctx.cards.map((c) => ({ cardId: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
  }
  return runPreset(ctx, skill.preset);
}

function runPreset(ctx: LayoutContext, preset: LayoutPreset): CardPosition[] {
  const cardW = Math.round(BASE_CARD_W * preset.cardScale);
  const cardH = Math.round(BASE_CARD_H * preset.cardScale);
  const gap = preset.gap;
  const ordered = bfsOrder(ctx.cards, ctx.edges);
  const groups = groupCards(ordered, ctx, preset.groupBy);
  if (preset.flow === "center-out") {
    return positionCenterOut(groups, cardW, cardH, gap, ctx.canvasWidth);
  }
  return positionRows(groups, cardW, cardH, gap, preset);
}

function bfsOrder(cards: LayoutContext["cards"], edges: LayoutContext["edges"]): LayoutContext["cards"] {
  const hasIncoming = new Set(edges.map((e) => e.toRefId));
  const roots = cards.filter((c) => !hasIncoming.has(c.refId));
  const visited = new Set<string>();
  const order: string[] = [];
  const queue = [...roots.map((c) => c.refId)];
  while (queue.length > 0) {
    const refId = queue.shift()!;
    if (visited.has(refId)) continue;
    visited.add(refId);
    order.push(refId);
    for (const e of edges) {
      if (e.fromRefId === refId && !visited.has(e.toRefId)) queue.push(e.toRefId);
    }
  }
  for (const c of cards) {
    if (!visited.has(c.refId)) order.push(c.refId);
  }
  const byRefId = new Map(cards.map((c) => [c.refId, c]));
  return order.map((r) => byRefId.get(r)!).filter(Boolean);
}

function groupCards(
  ordered: LayoutContext["cards"],
  ctx: LayoutContext,
  groupBy: string
): Card[][] {
  if (groupBy === "episode" && ctx.episodes.length > 0) return groupByEpisode(ordered, ctx);
  if (groupBy === "batch") return groupByBatch(ordered);
  return [ordered];
}

/**
 * Group cards by batchId, then merge trailing small groups into the
 * previous substantive group. Rationale: each `create_media` call gets
 * a fresh `batch_${Date.now()}` id (see compound-tools.ts:278), so an
 * iterative clarification flow ("cat+bulldog" → "outdoor" → "with more
 * bulldog" → "brighter") produces many 1-card batches. Narrative layout
 * would otherwise put each on its own row, visually fragmenting what is
 * logically one session.
 *
 * Merge rule: a group with fewer than MIN_BATCH_FOR_NEW_ROW cards is
 * appended to the previous group, as long as the previous group has
 * room under MAX_MERGED_GROUP. A new substantive group (≥ 3 cards)
 * always starts on its own row.
 */
const MIN_BATCH_FOR_NEW_ROW = 3;
const MAX_MERGED_GROUP = 8; // matches narrative preset's cols

function groupByBatch(ordered: LayoutContext["cards"]): Card[][] {
  const raw: Card[][] = [];
  const batchMap = new Map<string, number>();
  for (const card of ordered) {
    const bid = card.batchId;
    if (bid && batchMap.has(bid)) {
      raw[batchMap.get(bid)!].push(card);
    } else {
      const idx = raw.length;
      if (bid) batchMap.set(bid, idx);
      raw.push([card]);
    }
  }
  // Merge tiny trailing batches into the previous group where possible.
  const merged: Card[][] = [];
  for (const g of raw) {
    const last = merged[merged.length - 1];
    if (
      last &&
      g.length < MIN_BATCH_FOR_NEW_ROW &&
      last.length < MAX_MERGED_GROUP
    ) {
      last.push(...g);
    } else {
      merged.push([...g]);
    }
  }
  return merged;
}

function groupByEpisode(ordered: LayoutContext["cards"], ctx: LayoutContext): Card[][] {
  const epMap = new Map<string, LayoutContext["cards"]>();
  const ungrouped: LayoutContext["cards"][number][] = [];
  for (const ep of ctx.episodes) epMap.set(ep.id, []);
  for (const card of ordered) {
    const ep = ctx.episodes.find((e) => e.cardIds.includes(card.id));
    if (ep) epMap.get(ep.id)!.push(card);
    else ungrouped.push(card);
  }
  const groups: Card[][] = [];
  for (const ep of ctx.episodes) {
    const epCards = epMap.get(ep.id)!;
    if (epCards.length > 0) groups.push(epCards);
  }
  if (ungrouped.length > 0) groups.push(ungrouped);
  return groups;
}

function positionRows(
  groups: Card[][],
  cardW: number,
  cardH: number,
  gap: number,
  preset: LayoutPreset
): CardPosition[] {
  const positions: CardPosition[] = [];
  let currentY = gap + HEADER_OFFSET;
  // Track global card index for zigzag flow across all groups
  let globalIdx = 0;
  let col = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const hasRowSep = gi < groups.length - 1 && preset.rowSeparator > 0;

    // For narrative (rowSeparator > 0): force each group to start on a new row
    if (hasRowSep && col > 0) {
      currentY += cardH + gap;
      col = 0;
      globalIdx = 0; // reset zigzag row tracking per group
    } else if (gi === 0) {
      globalIdx = 0;
    }

    const groupStartGlobalIdx = globalIdx;

    for (let ci = 0; ci < group.length; ci++) {
      if (col >= preset.cols) {
        col = 0;
        currentY += cardH + gap;
        globalIdx = 0;
      }
      let x: number;
      if (preset.flow === "zigzag") {
        const localIdx = groupStartGlobalIdx + ci;
        const rowIdx = Math.floor(localIdx / preset.cols);
        const isReverse = rowIdx % 2 === 1;
        const colInRow = localIdx % preset.cols;
        const effectiveCol = isReverse ? preset.cols - 1 - colInRow : colInRow;
        x = gap + effectiveCol * (cardW + gap);
      } else {
        x = gap + col * (cardW + gap);
      }
      positions.push({ cardId: group[ci].id, x, y: currentY, w: cardW, h: cardH });
      col++;
      globalIdx++;
    }

    if (hasRowSep) {
      // Finish the last row of this group then add separator
      currentY += cardH + gap + preset.rowSeparator;
      col = 0;
      globalIdx = 0;
    }
  }

  return positions;
}

function positionCenterOut(
  groups: Card[][],
  cardW: number,
  cardH: number,
  gap: number,
  canvasWidth: number
): CardPosition[] {
  const all = groups.flat();
  const positions: CardPosition[] = [];
  const centerX = canvasWidth / 2;
  const centerY = 400;
  for (let i = 0; i < all.length; i++) {
    if (i === 0) {
      positions.push({
        cardId: all[i].id,
        x: centerX - cardW / 2,
        y: centerY - cardH / 2,
        w: cardW,
        h: cardH,
      });
    } else {
      const ring = Math.ceil(Math.sqrt(i));
      const angle = (i / (ring * 4)) * 2 * Math.PI;
      const radius = ring * (cardW + gap);
      positions.push({
        cardId: all[i].id,
        x: centerX + Math.cos(angle) * radius - cardW / 2,
        y: centerY + Math.sin(angle) * radius - cardH / 2,
        w: cardW,
        h: cardH,
      });
    }
  }
  return positions;
}
