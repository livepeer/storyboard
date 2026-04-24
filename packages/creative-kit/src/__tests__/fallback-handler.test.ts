import { describe, it, expect, vi } from "vitest";
import { buildAttemptChain, executeWithFallback, type InferenceCall, type InferenceResult } from "../routing/fallback-handler";

const CHAINS = {
  "flux-dev": ["seedream-5-lite", "flux-schnell"],
  "seedance-i2v": ["veo-i2v", "ltx-i2v"],
};

describe("buildAttemptChain", () => {
  it("returns initial + live fallbacks", () => {
    const live = new Set(["flux-dev", "seedream-5-lite", "flux-schnell"]);
    const chain = buildAttemptChain("flux-dev", CHAINS, live);
    expect(chain).toEqual(["flux-dev", "seedream-5-lite", "flux-schnell"]);
  });

  it("filters out non-live fallbacks", () => {
    const live = new Set(["flux-dev", "flux-schnell"]); // seedream not available
    const chain = buildAttemptChain("flux-dev", CHAINS, live);
    expect(chain).toEqual(["flux-dev", "flux-schnell"]);
  });

  it("skips initial if not live but fallbacks exist", () => {
    const live = new Set(["seedream-5-lite", "flux-schnell"]); // flux-dev down
    const chain = buildAttemptChain("flux-dev", CHAINS, live);
    expect(chain).toEqual(["seedream-5-lite", "flux-schnell"]);
    expect(chain).not.toContain("flux-dev");
  });

  it("returns just initial if no chain defined", () => {
    const live = new Set(["gpt-image"]);
    const chain = buildAttemptChain("gpt-image", CHAINS, live);
    expect(chain).toEqual(["gpt-image"]);
  });

  it("deduplicates", () => {
    const chains = { "a": ["b", "a", "b"] };
    const chain = buildAttemptChain("a", chains, new Set(["a", "b"]));
    expect(chain).toEqual(["a", "b"]);
  });
});

describe("executeWithFallback", () => {
  it("returns first successful result", async () => {
    const executeFn = vi.fn(async (req: InferenceCall): Promise<InferenceResult> => ({
      url: "https://result.jpg",
      capability: req.capability,
      elapsed_ms: 100,
      raw: {},
    }));

    const result = await executeWithFallback(
      { capability: "flux-dev", prompt: "test", params: {} },
      executeFn,
      { chains: CHAINS, liveCapabilities: new Set(["flux-dev", "seedream-5-lite"]) },
    );

    expect(result.url).toBe("https://result.jpg");
    expect(executeFn).toHaveBeenCalledTimes(1); // no fallback needed
  });

  it("falls back on failure", async () => {
    let callCount = 0;
    const executeFn = vi.fn(async (req: InferenceCall): Promise<InferenceResult> => {
      callCount++;
      if (callCount === 1) return { error: "Safety filter", capability: req.capability, elapsed_ms: 50, raw: {} };
      return { url: "https://fallback.jpg", capability: req.capability, elapsed_ms: 100, raw: {} };
    });

    const fallbacks: string[] = [];
    const result = await executeWithFallback(
      { capability: "flux-dev", prompt: "test", params: {} },
      executeFn,
      {
        chains: CHAINS,
        liveCapabilities: new Set(["flux-dev", "seedream-5-lite"]),
        isRecoverable: () => true,
        onFallback: (from, to) => fallbacks.push(`${from}→${to}`),
      },
    );

    expect(result.url).toBe("https://fallback.jpg");
    expect(executeFn).toHaveBeenCalledTimes(2);
    expect(fallbacks).toEqual(["flux-dev→seedream-5-lite"]);
  });

  it("stops on non-recoverable error", async () => {
    const executeFn = vi.fn(async (req: InferenceCall): Promise<InferenceResult> => ({
      error: "401 auth failed",
      capability: req.capability,
      elapsed_ms: 10,
      raw: {},
    }));

    const result = await executeWithFallback(
      { capability: "flux-dev", prompt: "test", params: {} },
      executeFn,
      {
        chains: CHAINS,
        liveCapabilities: new Set(["flux-dev", "seedream-5-lite"]),
        isRecoverable: (err) => !err.includes("auth"),
      },
    );

    expect(result.error).toContain("auth");
    expect(executeFn).toHaveBeenCalledTimes(1); // didn't try fallback
  });

  it("adapts params per model", async () => {
    const capturedParams: Record<string, unknown>[] = [];
    const executeFn = vi.fn(async (req: InferenceCall): Promise<InferenceResult> => {
      capturedParams.push(req.params);
      if (req.capability === "flux-dev") return { error: "fail", capability: req.capability, elapsed_ms: 10, raw: {} };
      return { url: "ok", capability: req.capability, elapsed_ms: 10, raw: {} };
    });

    await executeWithFallback(
      { capability: "flux-dev", prompt: "test", params: { image_url: "img.jpg" } },
      executeFn,
      {
        chains: CHAINS,
        liveCapabilities: new Set(["flux-dev", "seedream-5-lite"]),
        isRecoverable: () => true,
        adaptParams: (cap, params) => {
          if (cap === "seedream-5-lite") params.adapted = true;
          return params;
        },
      },
    );

    expect(capturedParams[0]).not.toHaveProperty("adapted"); // flux-dev: no adaptation
    expect(capturedParams[1]).toHaveProperty("adapted", true); // seedream: adapted
  });

  it("returns error when all attempts fail", async () => {
    const executeFn = vi.fn(async (req: InferenceCall): Promise<InferenceResult> => ({
      error: "fail",
      capability: req.capability,
      elapsed_ms: 10,
      raw: {},
    }));

    const result = await executeWithFallback(
      { capability: "flux-dev", prompt: "test", params: {} },
      executeFn,
      {
        chains: CHAINS,
        liveCapabilities: new Set(["flux-dev", "seedream-5-lite", "flux-schnell"]),
        isRecoverable: () => true,
      },
    );

    expect(result.error).toBe("fail");
    expect(executeFn).toHaveBeenCalledTimes(3); // tried all 3
  });
});
