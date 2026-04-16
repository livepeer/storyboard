import { describe, it, expect } from "vitest";
import { pickTier } from "../../src/routing/policy.js";
import type { Intent } from "../../src/agent/intent.js";

const noneIntent: Intent = { type: "none" };
const continueIntent: Intent = { type: "continue" };
const statusIntent: Intent = { type: "status" };

describe("routing policy", () => {
  it("forceTier wins over everything", () => {
    expect(pickTier("anything", { intent: noneIntent, forceTier: 3 }).tier).toBe(3);
  });

  it("skillTiers picks the max", () => {
    expect(pickTier("hi", { intent: noneIntent, skillTiers: [0, 2, 1] }).tier).toBe(2);
  });

  it("mechanical intents → tier 0", () => {
    expect(pickTier("continue", { intent: continueIntent }).tier).toBe(0);
    expect(pickTier("where are my pics", { intent: statusIntent }).tier).toBe(0);
  });

  it("reasoning keywords → tier 2", () => {
    expect(pickTier("why does it look this way", { intent: noneIntent }).tier).toBe(2);
    expect(pickTier("compare these two scenes", { intent: noneIntent }).tier).toBe(2);
  });

  it("long input → tier 2", () => {
    expect(pickTier("x".repeat(900), { intent: noneIntent }).tier).toBe(2);
  });

  it("default short creative → tier 1", () => {
    expect(pickTier("a red apple", { intent: noneIntent }).tier).toBe(1);
  });
});
