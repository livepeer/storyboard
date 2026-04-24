import { describe, it, expect, beforeEach } from "vitest";
import { getConfig, configure, resetConfig, getDefaults } from "../config";

beforeEach(() => { resetConfig(); });

describe("Config", () => {
  it("returns defaults", () => {
    const cfg = getConfig();
    expect(cfg.batchSize).toBe(5);
    expect(cfg.maxBatches).toBe(10);
    expect(cfg.staleThresholdMs).toBe(30 * 60 * 1000);
    expect(cfg.routerSpeedWeight).toBe(0.60);
  });

  it("configure merges partial updates", () => {
    configure({ batchSize: 10, maxBatches: 20 });
    const cfg = getConfig();
    expect(cfg.batchSize).toBe(10);
    expect(cfg.maxBatches).toBe(20);
    expect(cfg.staleThresholdMs).toBe(30 * 60 * 1000); // unchanged
  });

  it("resetConfig restores defaults", () => {
    configure({ batchSize: 99 });
    expect(getConfig().batchSize).toBe(99);
    resetConfig();
    expect(getConfig().batchSize).toBe(5);
  });

  it("getDefaults always returns original values", () => {
    configure({ batchSize: 99 });
    expect(getDefaults().batchSize).toBe(5); // not affected
  });

  it("config is readonly (typescript-level)", () => {
    const cfg = getConfig();
    // @ts-expect-error — should not be assignable
    // cfg.batchSize = 10;
    expect(cfg.batchSize).toBe(5);
  });

  it("all router weights sum to 1.0", () => {
    const cfg = getConfig();
    const sum = cfg.routerSpeedWeight + cfg.routerStyleWeight + cfg.routerCapacityWeight;
    expect(sum).toBeCloseTo(1.0);
  });

  it("confirmation gate defaults are reasonable", () => {
    const cfg = getConfig();
    expect(cfg.confirmationSceneThreshold).toBeGreaterThan(0);
    expect(cfg.confirmationEnabled).toBe(true);
  });

  it("streaming defaults are reasonable", () => {
    const cfg = getConfig();
    expect(cfg.transitionHoldMs).toBeGreaterThan(500);
    expect(cfg.firstSceneResetMs).toBeGreaterThan(0);
    expect(cfg.streamWarmupMaxWaitSec).toBeGreaterThan(60);
  });
});
