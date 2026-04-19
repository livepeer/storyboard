import { describe, it, expect, vi } from "vitest";
import { createCommandRouter } from "../routing/command-router";
import {
  createCapabilityResolver,
  type CapabilityResolverConfig,
} from "../routing/capability-resolver";
import { extractFalError, isRecoverableFailure } from "../routing/fal-errors";
import { createIntentClassifier } from "../routing/intent-classifier";

// ─── CommandRouter ────────────────────────────────────────────────────────────

describe("CommandRouter", () => {
  it("executes a registered command", async () => {
    const router = createCommandRouter();
    router.register({
      name: "greet",
      description: "Say hello",
      execute: async () => "hello",
    });
    const result = await router.execute("/greet");
    expect(result).toBe("hello");
  });

  it("passes args to the handler", async () => {
    const router = createCommandRouter();
    router.register({
      name: "echo",
      description: "Echo args",
      execute: async (args) => args,
    });
    const result = await router.execute("/echo foo bar");
    expect(result).toBe("foo bar");
  });

  it("returns null for non-commands (no / prefix)", async () => {
    const router = createCommandRouter();
    const result = await router.execute("just some text");
    expect(result).toBeNull();
  });

  it("returns null for empty string", async () => {
    const router = createCommandRouter();
    expect(await router.execute("")).toBeNull();
  });

  it("returns Unknown message for unregistered command", async () => {
    const router = createCommandRouter();
    const result = await router.execute("/missing");
    expect(result).toContain("Unknown command: /missing");
    expect(result).toContain("/help");
  });

  it("supports aliases", async () => {
    const router = createCommandRouter();
    router.register({
      name: "list",
      aliases: ["ls"],
      description: "List items",
      execute: async () => "items",
    });
    expect(await router.execute("/ls")).toBe("items");
    expect(await router.execute("/list")).toBe("items");
  });

  it("supports subcommand routing: /parent/sub calls parent handler with sub as args", async () => {
    const router = createCommandRouter();
    const spy = vi.fn(async (args: string) => `got: ${args}`);
    router.register({
      name: "project",
      description: "Project commands",
      execute: spy,
    });
    const result = await router.execute("/project/list");
    expect(result).toBe("got: list");
    expect(spy).toHaveBeenCalledWith("list");
  });

  it("subcommand routing passes remaining args", async () => {
    const router = createCommandRouter();
    const spy = vi.fn(async (args: string) => `got: ${args}`);
    router.register({
      name: "project",
      description: "Project commands",
      execute: spy,
    });
    const result = await router.execute("/project/create my project");
    expect(result).toBe("got: create my project");
  });

  it("generateHelp includes all registered commands", () => {
    const router = createCommandRouter();
    router.register({ name: "foo", description: "Foo command", execute: async () => "" });
    router.register({ name: "bar", description: "Bar command", execute: async () => "" });
    const help = router.generateHelp();
    expect(help).toContain("/foo");
    expect(help).toContain("/bar");
    expect(help).toContain("Foo command");
    expect(help).toContain("Bar command");
  });

  it("/help auto-registers and returns help text", async () => {
    const router = createCommandRouter();
    router.register({ name: "test", description: "A test command", execute: async () => "" });
    const result = await router.execute("/help");
    expect(result).not.toBeNull();
    expect(result).toContain("/test");
    expect(result).toContain("A test command");
  });

  it("generateHelp shows aliases", () => {
    const router = createCommandRouter();
    router.register({
      name: "list",
      aliases: ["ls", "dir"],
      description: "List items",
      execute: async () => "",
    });
    const help = router.generateHelp();
    expect(help).toContain("ls");
    expect(help).toContain("dir");
  });
});

// ─── CapabilityResolver ───────────────────────────────────────────────────────

const baseConfig: CapabilityResolverConfig = {
  fallbackChains: {
    "ltx-i2v": ["kling-i2v", "pixverse-i2v"],
    "flux-dev": ["flux-schnell"],
  },
  actionDefaults: {
    image: "flux-dev",
    video: "ltx-i2v",
    tts: "chatterbox-tts",
  },
  userMentionPatterns: {
    gemini: { capability: "gemini-image", type: "mention" },
    flux: { capability: "flux-dev", type: "mention" },
    kling: { capability: "kling-i2v", type: "mention" },
  },
};

describe("CapabilityResolver", () => {
  it("resolves action to default capability", () => {
    const resolver = createCapabilityResolver(baseConfig);
    const result = resolver.resolve("image");
    expect(result.capability).toBe("flux-dev");
    expect(result.type).toBe("default");
  });

  it("respects modelOverride", () => {
    const resolver = createCapabilityResolver(baseConfig);
    const result = resolver.resolve("image", { modelOverride: "recraft-v4" });
    expect(result.capability).toBe("recraft-v4");
    expect(result.type).toBe("override");
  });

  it("modelOverride takes precedence over userText mention", () => {
    const resolver = createCapabilityResolver(baseConfig);
    const result = resolver.resolve("image", {
      modelOverride: "recraft-v4",
      userText: "use gemini for this",
    });
    expect(result.capability).toBe("recraft-v4");
    expect(result.type).toBe("override");
  });

  it("detects user mention patterns in userText", () => {
    const resolver = createCapabilityResolver(baseConfig);
    const result = resolver.resolve("image", { userText: "make it with gemini" });
    expect(result.capability).toBe("gemini-image");
    expect(result.type).toBe("mention");
  });

  it("buildAttemptChain includes initial and fallbacks", () => {
    const resolver = createCapabilityResolver(baseConfig);
    const live = new Set(["ltx-i2v", "kling-i2v", "pixverse-i2v"]);
    const chain = resolver.buildAttemptChain("ltx-i2v", live);
    expect(chain).toContain("ltx-i2v");
    expect(chain).toContain("kling-i2v");
    expect(chain).toContain("pixverse-i2v");
  });

  it("buildAttemptChain filters to live capabilities", () => {
    const resolver = createCapabilityResolver(baseConfig);
    const live = new Set(["kling-i2v"]); // only kling is live
    const chain = resolver.buildAttemptChain("ltx-i2v", live);
    expect(chain).not.toContain("ltx-i2v");
    expect(chain).toContain("kling-i2v");
  });

  it("buildAttemptChain skips dead initial if alternatives exist", () => {
    const resolver = createCapabilityResolver(baseConfig);
    const live = new Set(["kling-i2v", "pixverse-i2v"]); // ltx-i2v is dead
    const chain = resolver.buildAttemptChain("ltx-i2v", live);
    expect(chain[0]).not.toBe("ltx-i2v");
    expect(chain).not.toContain("ltx-i2v");
  });

  it("buildAttemptChain deduplicates entries", () => {
    const config: CapabilityResolverConfig = {
      ...baseConfig,
      fallbackChains: { "flux-dev": ["flux-dev", "flux-schnell"] }, // duplicate
    };
    const resolver = createCapabilityResolver(config);
    const live = new Set(["flux-dev", "flux-schnell"]);
    const chain = resolver.buildAttemptChain("flux-dev", live);
    const fluxDevCount = chain.filter((c) => c === "flux-dev").length;
    expect(fluxDevCount).toBe(1);
  });

  it("buildAttemptChain returns empty array if nothing is live", () => {
    const resolver = createCapabilityResolver(baseConfig);
    const chain = resolver.buildAttemptChain("ltx-i2v", new Set());
    expect(chain).toEqual([]);
  });
});

// ─── fal-errors ───────────────────────────────────────────────────────────────

describe("extractFalError", () => {
  it("returns undefined for missing detail", () => {
    expect(extractFalError({})).toBeUndefined();
  });

  it("returns string detail directly", () => {
    expect(extractFalError({ detail: "something went wrong" })).toBe(
      "something went wrong"
    );
  });

  it("extracts msg from detail array", () => {
    expect(
      extractFalError({ detail: [{ msg: "field required" }, { msg: "invalid type" }] })
    ).toBe("field required; invalid type");
  });

  it("handles detail array with string items", () => {
    expect(extractFalError({ detail: ["error one", "error two"] })).toBe(
      "error one; error two"
    );
  });

  it("returns undefined for empty string detail", () => {
    expect(extractFalError({ detail: "" })).toBeUndefined();
  });

  it("returns undefined for null detail", () => {
    expect(extractFalError({ detail: null })).toBeUndefined();
  });
});

describe("isRecoverableFailure", () => {
  it("returns true for undefined (empty-result case)", () => {
    expect(isRecoverableFailure(undefined)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isRecoverableFailure("")).toBe(true);
  });

  it("returns false for 'failed to fetch'", () => {
    expect(isRecoverableFailure("failed to fetch")).toBe(false);
  });

  it("returns false for 401 errors", () => {
    expect(isRecoverableFailure("401 unauthorized")).toBe(false);
  });

  it("returns false for payment failed", () => {
    expect(isRecoverableFailure("Payment failed — ticket rejected")).toBe(false);
  });

  it("returns false for signer errors", () => {
    expect(isRecoverableFailure("signer returned 403")).toBe(false);
  });

  it("returns false for authentication failed", () => {
    expect(isRecoverableFailure("authentication failed")).toBe(false);
  });

  it("returns false for api key errors", () => {
    expect(isRecoverableFailure("Invalid api key provided")).toBe(false);
  });

  it("returns false for CORS errors", () => {
    expect(isRecoverableFailure("CORS policy blocked the request")).toBe(false);
  });

  it("returns true for 503 (recoverable)", () => {
    expect(isRecoverableFailure("503 No GPU available")).toBe(true);
  });

  it("returns true for 429 rate limit (recoverable)", () => {
    expect(isRecoverableFailure("429 too many requests")).toBe(true);
  });

  it("returns true for 500 server error (recoverable)", () => {
    expect(isRecoverableFailure("500 internal server error")).toBe(true);
  });

  it("returns true for safety block (recoverable)", () => {
    expect(isRecoverableFailure("blocked by safety filter")).toBe(true);
  });

  it("returns true for timeout (recoverable)", () => {
    expect(isRecoverableFailure("request timed out after 60s")).toBe(true);
  });
});

// ─── IntentClassifier ─────────────────────────────────────────────────────────

describe("IntentClassifier", () => {
  it("classifies text using registered rules", () => {
    const classifier = createIntentClassifier([
      { type: "create", test: (text) => text.includes("create"), priority: 10 },
      { type: "delete", test: (text) => text.includes("delete"), priority: 10 },
    ]);
    expect(classifier.classify("create an image", { hasActiveProject: false, pendingItems: 0 })).toEqual({ type: "create" });
    expect(classifier.classify("delete the card", { hasActiveProject: false, pendingItems: 0 })).toEqual({ type: "delete" });
  });

  it("returns type none when no rule matches", () => {
    const classifier = createIntentClassifier([
      { type: "create", test: (text) => text.includes("create") },
    ]);
    expect(classifier.classify("hello world", { hasActiveProject: false, pendingItems: 0 })).toEqual({ type: "none" });
  });

  it("respects priority order — higher priority wins first", () => {
    const classifier = createIntentClassifier([
      { type: "low", test: (text) => text.includes("foo"), priority: 1 },
      { type: "high", test: (text) => text.includes("foo"), priority: 100 },
    ]);
    expect(classifier.classify("foo", { hasActiveProject: false, pendingItems: 0 })).toEqual({ type: "high" });
  });

  it("register adds rules dynamically", () => {
    const classifier = createIntentClassifier();
    expect(classifier.classify("animate this", { hasActiveProject: false, pendingItems: 0 })).toEqual({ type: "none" });
    classifier.register({
      type: "animate",
      test: (text) => text.includes("animate"),
    });
    expect(classifier.classify("animate this", { hasActiveProject: false, pendingItems: 0 })).toEqual({ type: "animate" });
  });

  it("passes context to test function", () => {
    const classifier = createIntentClassifier([
      {
        type: "continue-project",
        test: (_text, ctx) => ctx.hasActiveProject && ctx.pendingItems > 0,
        priority: 50,
      },
    ]);
    expect(
      classifier.classify("go", { hasActiveProject: true, pendingItems: 3 })
    ).toEqual({ type: "continue-project" });
    expect(
      classifier.classify("go", { hasActiveProject: false, pendingItems: 3 })
    ).toEqual({ type: "none" });
  });

  it("rules without priority default to 0", () => {
    const classifier = createIntentClassifier([
      { type: "a", test: (text) => text.includes("x") }, // priority defaults to 0
      { type: "b", test: (text) => text.includes("x"), priority: 5 },
    ]);
    // b has higher priority so it wins
    expect(classifier.classify("x", { hasActiveProject: false, pendingItems: 0 })).toEqual({ type: "b" });
  });
});
