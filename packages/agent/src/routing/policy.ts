/**
 * Layer 4: model routing policy. Picks the cheapest tier that can
 * do the job. Default policy: Tier 1 for everything except turns
 * flagged as needing reasoning.
 */

import type { Tier } from "../types.js";
import type { Intent } from "../agent/intent.js";

export interface RoutingDecision {
  tier: Tier;
  reason: string;
}

export interface RoutingContext {
  intent: Intent;
  /** Has the user pinned a "use Opus only" override? */
  forceTier?: Tier;
  /** Skill-declared tier overrides (highest wins). */
  skillTiers?: Tier[];
  /** Previous tier used in this session (for sticky escalation). */
  lastTier?: Tier;
}

const REASONING_KEYWORDS = [
  "explain",
  "why",
  "analyze",
  "compare",
  "decide",
  "recommend",
  "design",
  "plan",
  "rewrite",
  "rethink",
];

export function pickTier(input: string, ctx: RoutingContext): RoutingDecision {
  if (ctx.forceTier !== undefined) {
    return { tier: ctx.forceTier, reason: "user override" };
  }
  if (ctx.skillTiers && ctx.skillTiers.length > 0) {
    const max = Math.max(...ctx.skillTiers) as Tier;
    return { tier: max, reason: "skill override" };
  }
  // Tier 0 — pure mechanical paths
  if (ctx.intent.type === "continue" || ctx.intent.type === "status") {
    return { tier: 0, reason: "mechanical intent" };
  }
  // Tier 2 — reasoning-flagged turns
  const lower = input.toLowerCase();
  if (REASONING_KEYWORDS.some((k) => lower.includes(k))) {
    return { tier: 2, reason: "reasoning keyword" };
  }
  // Tier 2 — long inputs likely need real comprehension
  if (input.length > 800) {
    return { tier: 2, reason: "long input" };
  }
  // Default — Tier 1
  return { tier: 1, reason: "default" };
}
