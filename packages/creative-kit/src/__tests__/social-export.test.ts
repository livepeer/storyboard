import { describe, it, expect } from "vitest";
import { calculateCrop } from "../agent/social-export";

describe("calculateCrop", () => {
  it("center-crops landscape to square (instagram 1080x1080)", () => {
    // 1920x1080 landscape → 1080x1080 square: crop sides
    const crop = calculateCrop(1920, 1080, 1080, 1080);
    expect(crop.sx).toBe(420); // (1920-1080)/2
    expect(crop.sy).toBe(0);
    expect(crop.sw).toBe(1080);
    expect(crop.sh).toBe(1080);
  });

  it("center-crops portrait to square with face bias toward top", () => {
    // 1080x1920 portrait → 1080x1080 square: crop top/bottom with face bias
    const crop = calculateCrop(1080, 1920, 1080, 1080);
    // True center would be sy=(1920-1080)/2=420
    // Face bias: sy=(1920-1080)/3=280 — shifted upward
    expect(crop.sx).toBe(0);
    expect(crop.sy).toBeLessThan((1920 - 1080) / 2); // face bias shifts up
    expect(crop.sy).toBe(280); // (1920-1080)/3
    expect(crop.sw).toBe(1080);
    expect(crop.sh).toBe(1080);
  });

  it("crops landscape to portrait (tiktok 1080x1920)", () => {
    // 1920x1080 → 1080x1920: must crop width significantly
    const crop = calculateCrop(1920, 1080, 1080, 1920);
    // Target ratio 1080/1920 = 0.5625, crop width = 1080 * (1080/1920) = 607.5
    expect(crop.sw).toBeLessThan(1920);
    expect(crop.sh).toBe(1080);
    expect(crop.sy).toBe(0); // horizontal crop, no vertical offset
    // sx should center the crop
    expect(crop.sx).toBe(Math.round((1920 - crop.sw) / 2));
  });

  it("returns full frame when aspect ratios match", () => {
    // 1920x1080 → 1920x1080 (same ratio)
    const crop = calculateCrop(1920, 1080, 1920, 1080);
    expect(crop.sx).toBe(0);
    expect(crop.sy).toBe(0);
    expect(crop.sw).toBe(1920);
    expect(crop.sh).toBe(1080);
  });

  it("returns full frame for near-matching ratios within tolerance", () => {
    // 1200x675 has ratio 1.7778, youtube 1920x1080 has ratio 1.7778 — same
    const crop = calculateCrop(1200, 675, 1920, 1080);
    expect(crop.sx).toBe(0);
    expect(crop.sy).toBe(0);
    expect(crop.sw).toBe(1200);
    expect(crop.sh).toBe(675);
  });
});
