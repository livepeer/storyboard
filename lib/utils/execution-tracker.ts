/**
 * Generic execution tracker for slash commands and fast paths.
 *
 * Usage:
 *   const tracker = createTracker();
 *   tracker.trackLLM(inputTokens, outputTokens);  // from Gemini response
 *   tracker.trackTool("project_create", true);
 *   tracker.trackTool("project_generate", true);
 *   const summary = tracker.summary();
 *   // → "Done in 12.3s — 2 tools ok · 1,412 tokens (812 in / 600 out)"
 *
 * Designed to be used by /story, /film, /briefing, and any future
 * command that does generation work outside the agent event loop.
 */

import { useChatStore } from "@/lib/chat/store";

export interface ExecutionTracker {
  trackLLM: (input: number, output: number) => void;
  trackTool: (name: string, success: boolean) => void;
  summary: () => string;
  announce: () => void;
}

export function createTracker(label?: string): ExecutionTracker {
  const startTime = Date.now();
  let llmInput = 0;
  let llmOutput = 0;
  const tools: Array<{ name: string; success: boolean }> = [];

  return {
    trackLLM(input, output) {
      llmInput += input;
      llmOutput += output;
    },

    trackTool(name, success) {
      tools.push({ name, success });
    },

    summary() {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const parts: string[] = [];

      // Tools summary
      if (tools.length > 0) {
        const ok = tools.filter((t) => t.success).length;
        const fail = tools.length - ok;
        const capNames = [...new Set(tools.map((t) => t.name))].slice(0, 3).join("+");
        if (fail === 0) {
          parts.push(`${ok} tools ok (${capNames})`);
        } else {
          parts.push(`${ok}/${tools.length} tools ok, ${fail} failed (${capNames})`);
        }
      }

      // Token summary
      const tokenTotal = llmInput + llmOutput;
      if (tokenTotal > 0) {
        parts.push(
          `${tokenTotal.toLocaleString()} tokens (${llmInput.toLocaleString()} in / ${llmOutput.toLocaleString()} out)`
        );
      }

      const prefix = label ? `${label} — ` : "";
      if (parts.length === 0) return `${prefix}Done in ${elapsed}s`;
      return `${prefix}Done in ${elapsed}s — ${parts.join(" · ")}`;
    },

    announce() {
      useChatStore.getState().addMessage(this.summary(), "system");
    },
  };
}

/**
 * Extract token usage from a Gemini API response.
 * The response from /api/agent/gemini includes usageMetadata when
 * the Google API returns it.
 */
export function extractGeminiTokens(
  response: unknown
): { input: number; output: number } {
  if (!response || typeof response !== "object") return { input: 0, output: 0 };
  const r = response as Record<string, unknown>;
  const meta = r.usageMetadata as Record<string, number> | undefined;
  if (meta) {
    return {
      input: meta.promptTokenCount || 0,
      output: meta.candidatesTokenCount || 0,
    };
  }
  // Try candidates[0].usageMetadata (some Gemini response shapes)
  const candidates = r.candidates as Array<Record<string, unknown>> | undefined;
  if (candidates?.[0]) {
    const cm = candidates[0].usageMetadata as Record<string, number> | undefined;
    if (cm) {
      return { input: cm.promptTokenCount || 0, output: cm.candidatesTokenCount || 0 };
    }
  }
  return { input: 0, output: 0 };
}
