/**
 * Fallback Handler — retries failed inference with sibling models.
 *
 * When a model fails with a recoverable error (safety filter, 503, timeout),
 * the handler tries the next model in the fallback chain. Only same-type
 * fallbacks (image→image, video→video) so the output type never changes.
 *
 * Extracted from compound-tools' inline retry loop.
 */

export interface FallbackChains {
  [capability: string]: string[];
}

export interface InferenceCall {
  capability: string;
  prompt: string;
  params: Record<string, unknown>;
}

export interface InferenceResult {
  url?: string;
  error?: string;
  capability: string;
  elapsed_ms: number;
  raw: Record<string, unknown>;
}

export interface FallbackOptions {
  /** The fallback chain definitions */
  chains: FallbackChains;
  /** Set of live (available) capability names */
  liveCapabilities: Set<string>;
  /** Called before each attempt (for UI updates) */
  onAttempt?: (capability: string, attemptIndex: number) => void;
  /** Called when falling back from one model to another */
  onFallback?: (from: string, to: string, reason: string) => void;
  /** Classify if an error is recoverable (worth trying next model) */
  isRecoverable?: (error: string) => boolean;
  /** Adapt params per model (e.g., Kling needs start_image_url) */
  adaptParams?: (capability: string, params: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Build the ordered attempt list for a capability.
 * Returns [initial, ...chained-fallbacks-that-exist-in-live-registry].
 */
export function buildAttemptChain(
  initialCap: string,
  chains: FallbackChains,
  liveCaps: Set<string>,
): string[] {
  const chain = chains[initialCap] ?? [];
  const liveFallbacks = chain.filter((c) => liveCaps.has(c));

  // If the initial capability isn't live but we have fallbacks, skip it
  const attempts = liveCaps.size > 0 && !liveCaps.has(initialCap) && liveFallbacks.length > 0
    ? liveFallbacks
    : [initialCap, ...liveFallbacks];

  // Deduplicate while preserving order
  return Array.from(new Set(attempts));
}

/**
 * Execute inference with automatic fallback retry.
 *
 * @param call - The initial inference request
 * @param executeFn - The actual inference function
 * @param opts - Fallback chain config + callbacks
 * @returns The first successful result, or the last error
 */
export async function executeWithFallback(
  call: InferenceCall,
  executeFn: (req: InferenceCall) => Promise<InferenceResult>,
  opts: FallbackOptions,
): Promise<InferenceResult> {
  const chain = buildAttemptChain(call.capability, opts.chains, opts.liveCapabilities);

  let lastResult: InferenceResult | null = null;

  for (let i = 0; i < chain.length; i++) {
    const cap = chain[i];
    opts.onAttempt?.(cap, i);

    if (i > 0) {
      const reason = lastResult?.error || "No output";
      opts.onFallback?.(chain[i - 1], cap, reason);
    }

    // Adapt params for this specific model
    const adaptedParams = opts.adaptParams
      ? opts.adaptParams(cap, { ...call.params })
      : { ...call.params };

    const result = await executeFn({
      capability: cap,
      prompt: call.prompt,
      params: adaptedParams,
    });

    if (result.url && !result.error) {
      return result; // Success
    }

    lastResult = result;

    // Check if error is recoverable (worth trying next model)
    const errorMsg = result.error || "No output";
    if (opts.isRecoverable && !opts.isRecoverable(errorMsg)) {
      break; // Non-recoverable (auth, network) — don't cycle
    }
  }

  // All attempts failed — return the last error
  return lastResult || {
    error: `All models failed: ${chain.join(", ")}`,
    capability: call.capability,
    elapsed_ms: 0,
    raw: {},
  };
}
