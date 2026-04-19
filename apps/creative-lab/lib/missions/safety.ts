const SAFE_MODELS = new Set([
  "flux-dev",
  "flux-schnell",
  "seedream-5-lite",
  "recraft-v4",
  "kontext-edit",
  "chatterbox-tts",
  "ltx-i2v",
  "bg-remove",
  "topaz-upscale",
]);

const SAFETY_PREFIX = "child-friendly, colorful, cartoon style, safe for all ages, ";

export function isSafeCapability(capability: string): boolean {
  return SAFE_MODELS.has(capability);
}

export function safePrompt(userPrompt: string, autoPrefix?: string): string {
  const prefix = autoPrefix ?? SAFETY_PREFIX;
  return `${prefix}${userPrompt}`;
}

export function friendlyError(rawError: string): string {
  const lower = rawError.toLowerCase();

  if (lower.includes("content") || lower.includes("policy") || lower.includes("safety")) {
    return "Hmm, let\u2019s try describing it differently! \uD83E\uDD14";
  }

  if (
    lower.includes("orchestrator") ||
    lower.includes("capacity") ||
    lower.includes("503") ||
    lower.includes("no gpu") ||
    lower.includes("unavailable")
  ) {
    return "The AI is busy right now. Try again in a moment! \u23F3";
  }

  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("failed to fetch")
  ) {
    return "Check your internet connection and try again! \uD83C\uDF10";
  }

  if (lower.includes("401") || lower.includes("auth") || lower.includes("key") || lower.includes("unauthorized")) {
    return "Oops! Ask a grown-up to check the settings. \uD83D\uDD11";
  }

  return "Something went wrong. Let\u2019s try again! \uD83D\uDD04";
}
