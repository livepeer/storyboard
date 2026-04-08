/**
 * Performance benchmark utilities.
 * Measures time-to-first-card and total execution time per plugin.
 */

export interface BenchmarkResult {
  pluginId: string;
  prompt: string;
  timeToFirstEvent: number;
  timeToFirstCard: number | null;
  totalTime: number;
  toolCalls: number;
  errors: string[];
  timestamp: number;
}

const BENCH_KEY = "storyboard_benchmarks";

export function saveBenchmark(result: BenchmarkResult) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(BENCH_KEY);
    const results: BenchmarkResult[] = raw ? JSON.parse(raw) : [];
    results.push(result);
    // Keep last 50
    if (results.length > 50) results.splice(0, results.length - 50);
    localStorage.setItem(BENCH_KEY, JSON.stringify(results));
  } catch {
    // Ignore
  }
}

export function getBenchmarks(): BenchmarkResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BENCH_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearBenchmarks() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(BENCH_KEY);
}

/**
 * Token counting utilities for efficiency measurement.
 * Rough estimate: 1 token ~ 4 characters for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a full message array (system + user + assistant + tool results).
 */
export function estimateConversationTokens(
  messages: Array<{ role: string; content: unknown }>
): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (typeof block.text === "string") total += estimateTokens(block.text);
        if (typeof block.content === "string") total += estimateTokens(block.content);
      }
    }
    // Role + overhead ~4 tokens per message
    total += 4;
  }
  return total;
}

/**
 * The 10-prompt A/B test suite for token efficiency evaluation.
 * Each prompt has a "naive" token estimate (multiple tool calls, verbose)
 * and an "optimized" target (compound tools, compacted).
 */
export const TOKEN_EFFICIENCY_SUITE = [
  {
    id: "t2i-simple",
    prompt: "Create an image of a sunset",
    naiveTokens: 800,
    optimizedTarget: 160,
    category: "single-step",
  },
  {
    id: "t2i-styled",
    prompt: "Create a watercolor painting of a mountain lake",
    naiveTokens: 1200,
    optimizedTarget: 200,
    category: "single-step",
  },
  {
    id: "multi-2step",
    prompt: "Generate a dragon image then animate it",
    naiveTokens: 2400,
    optimizedTarget: 400,
    category: "multi-step",
  },
  {
    id: "multi-3step",
    prompt: "Create a robot, restyle it as cyberpunk, then animate",
    naiveTokens: 3600,
    optimizedTarget: 500,
    category: "multi-step",
  },
  {
    id: "storyboard-4",
    prompt: "A knight fights a dragon at a castle",
    naiveTokens: 6000,
    optimizedTarget: 1000,
    category: "storyboard",
  },
  {
    id: "canvas-query",
    prompt: "What's on my canvas?",
    naiveTokens: 400,
    optimizedTarget: 80,
    category: "canvas",
  },
  {
    id: "canvas-remove",
    prompt: "Remove all video cards",
    naiveTokens: 600,
    optimizedTarget: 120,
    category: "canvas",
  },
  {
    id: "style-set",
    prompt: "Remember: I like anime style for all future images",
    naiveTokens: 500,
    optimizedTarget: 100,
    category: "memory",
  },
  {
    id: "restyle",
    prompt: "Restyle the dragon card as oil painting",
    naiveTokens: 1800,
    optimizedTarget: 300,
    category: "edit",
  },
  {
    id: "upscale",
    prompt: "Upscale the best image on the canvas",
    naiveTokens: 1400,
    optimizedTarget: 250,
    category: "edit",
  },
];
