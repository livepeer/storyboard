export interface CapabilityResult {
  capability: string;
  type: string;
}

export interface CapabilityResolverConfig {
  fallbackChains: Record<string, string[]>;
  /** Maps action → default capability name. Type is inferred from the action name. */
  actionDefaults: Record<string, string>;
  /** Maps action → default result with explicit type (overrides actionDefaults). */
  actionResults?: Record<string, CapabilityResult>;
  userMentionPatterns: Record<string, CapabilityResult>;
}

export interface CapabilityResolver {
  resolve(
    action: string,
    opts?: {
      styleHint?: string;
      modelOverride?: string;
      hasSourceUrl?: boolean;
      userText?: string;
    }
  ): CapabilityResult;
  buildAttemptChain(initial: string, liveCapabilities: Set<string>): string[];
  config: CapabilityResolverConfig;
}

export function createCapabilityResolver(
  config: CapabilityResolverConfig
): CapabilityResolver {
  function resolve(
    action: string,
    opts: {
      styleHint?: string;
      modelOverride?: string;
      hasSourceUrl?: boolean;
      userText?: string;
    } = {}
  ): CapabilityResult {
    const { modelOverride, userText } = opts;

    // 1. modelOverride takes precedence
    if (modelOverride) {
      return { capability: modelOverride, type: "override" };
    }

    // 2. Check user mention patterns in userText
    if (userText) {
      const lowerText = userText.toLowerCase();
      for (const [pattern, result] of Object.entries(
        config.userMentionPatterns
      )) {
        if (lowerText.includes(pattern.toLowerCase())) {
          return result;
        }
      }
    }

    // 3. Action results (with explicit type)
    const actionResult = config.actionResults?.[action];
    if (actionResult) return actionResult;

    // 4. Action defaults (type inferred from action name)
    const defaultCap = config.actionDefaults[action];
    if (defaultCap) {
      return { capability: defaultCap, type: action };
    }

    // 5. Fallback to action itself
    return { capability: action, type: action };
  }

  function buildAttemptChain(
    initial: string,
    liveCapabilities: Set<string>
  ): string[] {
    const fallbacks = config.fallbackChains[initial] ?? [];
    const allCandidates = [initial, ...fallbacks];

    // Filter to live capabilities
    const liveFiltered = allCandidates.filter((cap) =>
      liveCapabilities.has(cap)
    );

    if (liveFiltered.length === 0) {
      // Nothing live — return initial so caller gets one attempt
      // that fails with a proper error (rather than silent skip)
      return [initial];
    }

    // If initial is dead but alternatives exist, skip it
    if (!liveCapabilities.has(initial) && liveFiltered.length > 0) {
      return deduplicate(liveFiltered.filter((cap) => cap !== initial));
    }

    return deduplicate(liveFiltered);
  }

  function deduplicate(arr: string[]): string[] {
    return [...new Set(arr)];
  }

  return { resolve, buildAttemptChain, config };
}
