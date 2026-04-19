export interface CapabilityResult {
  capability: string;
  type: string;
}

export interface CapabilityResolverConfig {
  fallbackChains: Record<string, string[]>;
  actionDefaults: Record<string, string>;
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

    // 3. Action defaults
    const defaultCap = config.actionDefaults[action];
    if (defaultCap) {
      return { capability: defaultCap, type: "default" };
    }

    // 4. Fallback to action itself
    return { capability: action, type: "direct" };
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
      return [];
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
