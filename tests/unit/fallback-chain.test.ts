import { describe, expect, test } from "vitest";
import {
  FALLBACK_CHAINS,
  buildAttemptChain,
  isRecoverableFailure,
} from "@/lib/tools/compound-tools";

// Full live-capability set for the current deployment (22 caps).
const ALL_LIVE = new Set([
  "nano-banana", "recraft-v4", "flux-schnell", "flux-dev",
  "ltx-t2v", "ltx-i2v", "kontext-edit", "bg-remove",
  "topaz-upscale", "chatterbox-tts", "gemini-image", "gemini-text",
  "veo-i2v", "veo-t2v", "veo-transition", "flux-fill",
  "lipsync", "music", "sfx", "face-swap", "sam3", "talking-head",
]);

describe("FALLBACK_CHAINS — shape and coverage", () => {
  test("every video i2v has a sibling fallback", () => {
    expect(FALLBACK_CHAINS["veo-i2v"]).toContain("ltx-i2v");
    expect(FALLBACK_CHAINS["ltx-i2v"]).toContain("veo-i2v");
  });

  test("every video t2v has a sibling fallback", () => {
    expect(FALLBACK_CHAINS["veo-t2v"]).toContain("ltx-t2v");
    expect(FALLBACK_CHAINS["ltx-t2v"]).toContain("veo-t2v");
  });

  test("flux-dev has multi-option image fallback", () => {
    expect(FALLBACK_CHAINS["flux-dev"].length).toBeGreaterThanOrEqual(3);
  });

  test("image edit caps cover each other", () => {
    expect(FALLBACK_CHAINS["kontext-edit"]).toContain("flux-fill");
    expect(FALLBACK_CHAINS["flux-fill"]).toContain("kontext-edit");
  });
});

describe("buildAttemptChain", () => {
  test("returns [initial, ...live-fallbacks]", () => {
    const chain = buildAttemptChain("veo-i2v", ALL_LIVE);
    expect(chain[0]).toBe("veo-i2v");
    expect(chain).toContain("ltx-i2v");
  });

  test("drops fallbacks that aren't in the live registry", () => {
    const partial = new Set(["veo-i2v"]);
    const chain = buildAttemptChain("veo-i2v", partial);
    expect(chain).toEqual(["veo-i2v"]);
  });

  test("single-item chain for capabilities with no fallback", () => {
    const chain = buildAttemptChain("bg-remove", ALL_LIVE);
    expect(chain).toEqual(["bg-remove"]);
  });

  test("unknown capability yields just itself", () => {
    const chain = buildAttemptChain("fnord", ALL_LIVE);
    expect(chain).toEqual(["fnord"]);
  });

  test("de-duplicates even if chain repeats initial", () => {
    const chain = buildAttemptChain("flux-dev", ALL_LIVE);
    const unique = new Set(chain);
    expect(unique.size).toBe(chain.length);
    expect(chain[0]).toBe("flux-dev");
  });

  test("flux-dev full chain order is flux-dev → flux-schnell → recraft-v4 → gemini-image → nano-banana", () => {
    const chain = buildAttemptChain("flux-dev", ALL_LIVE);
    expect(chain).toEqual([
      "flux-dev",
      "flux-schnell",
      "recraft-v4",
      "gemini-image",
      "nano-banana",
    ]);
  });
});

describe("isRecoverableFailure", () => {
  test("empty / undefined error → recoverable", () => {
    expect(isRecoverableFailure(undefined)).toBe(true);
    expect(isRecoverableFailure("")).toBe(true);
  });

  test("content policy rejection → recoverable", () => {
    expect(isRecoverableFailure("No output from veo-i2v")).toBe(true);
    expect(isRecoverableFailure("The model did not generate the expected output")).toBe(true);
    expect(isRecoverableFailure("unsafe content detected")).toBe(true);
    expect(isRecoverableFailure("Content blocked by safety filter")).toBe(true);
  });

  test("server errors → recoverable", () => {
    expect(isRecoverableFailure("500 internal error")).toBe(true);
    expect(isRecoverableFailure("503 no orchestrator")).toBe(true);
    expect(isRecoverableFailure("Server error — try again")).toBe(true);
  });

  test("timeout → recoverable", () => {
    expect(isRecoverableFailure("Request timed out")).toBe(true);
  });

  test("rate limit → recoverable", () => {
    expect(isRecoverableFailure("429 rate limited")).toBe(true);
  });

  test("connectivity errors → NOT recoverable (same SDK, fallback won't help)", () => {
    expect(isRecoverableFailure("Failed to fetch")).toBe(false);
    expect(isRecoverableFailure("Can't reach SDK — check connection & API key")).toBe(false);
    expect(isRecoverableFailure("networkerror")).toBe(false);
    expect(isRecoverableFailure("Connection blocked (CORS)")).toBe(false);
  });

  test("auth errors → NOT recoverable", () => {
    expect(isRecoverableFailure("Authentication failed — check your API key")).toBe(false);
    expect(isRecoverableFailure("401 unauthorized")).toBe(false);
    expect(isRecoverableFailure("payment failed")).toBe(false);
    expect(isRecoverableFailure("signer error")).toBe(false);
  });
});
