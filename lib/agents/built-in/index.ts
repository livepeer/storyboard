import type {
  AgentPlugin,
  AgentEvent,
  AgentStep,
  EnrichResponse,
  CanvasContext,
} from "../types";
import type { CardType } from "@/lib/canvas/types";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import { sdkFetch, runInference } from "@/lib/sdk/client";
import { resolveCapability } from "@/lib/sdk/capabilities";

/**
 * Built-in agent plugin.
 *
 * Uses the SDK's /enrich endpoint to plan steps, then executes them
 * as a DAG (independent steps in parallel, dependent steps in waves).
 *
 * Implements the AgentPlugin interface by yielding AgentEvent objects
 * as it executes. Also maintains backward compatibility by writing
 * directly to the chat and canvas stores (so the UI works identically
 * to Phase 0).
 */

let stopped = false;

function say(text: string, role: "agent" | "system" = "agent") {
  useChatStore.getState().addMessage(text, role);
}

function setProcessing(v: boolean) {
  useChatStore.getState().setProcessing(v);
}

// --- Enrich: ask SDK to plan steps ---
async function enrichTask(
  task: string,
  context: string
): Promise<AgentStep[]> {
  try {
    const resp = await sdkFetch<EnrichResponse>(
      "/enrich/v2",
      { task, context, quality: "balanced" },
      60_000
    );
    if (resp.steps?.length) return resp.steps;
  } catch {
    // v2 failed, try v1
  }

  try {
    const resp = await sdkFetch<EnrichResponse>(
      "/enrich",
      { task, context },
      30_000
    );
    if (resp.steps?.length) return resp.steps;
  } catch {
    // v1 also failed
  }

  // Fallback: single image step
  return [
    {
      id: "step_0",
      type: "image",
      prompt: task,
      capability: "flux-dev",
      title: task.slice(0, 40),
    },
  ];
}

// --- Extract URL from nested SDK response shapes ---
function extractUrls(result: Record<string, unknown>): {
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
} {
  const data = (result.data ?? result) as Record<string, unknown>;
  const images = data.images as Array<{ url: string }> | undefined;
  const image = data.image as { url: string } | undefined;
  const video = data.video as { url: string } | undefined;

  return {
    imageUrl:
      (result.image_url as string) ??
      images?.[0]?.url ??
      image?.url ??
      undefined,
    videoUrl: (result.video_url as string) ?? video?.url ?? undefined,
    audioUrl: (result.audio_url as string) ?? undefined,
  };
}

// --- Execute a single step, yielding events ---
async function* executeStep(
  step: AgentStep,
  results: Map<string, Record<string, unknown>>
): AsyncGenerator<AgentEvent> {
  const canvas = useCanvasStore.getState();
  const cardType = (
    step.type === "music" ? "audio" : step.type
  ) as CardType;

  // Create card (will show spinner)
  const card = canvas.addCard({
    type: cardType,
    title: step.title || step.prompt.slice(0, 40),
    refId: step.id,
  });

  yield {
    type: "card_created",
    refId: step.id,
    content: step.title || step.prompt.slice(0, 40),
  };

  // Inject dependency URLs
  const params: Record<string, unknown> = { ...step.params };
  if (step.depends_on) {
    const prev = results.get(step.depends_on);
    if (prev) {
      const { imageUrl, videoUrl } = extractUrls(prev);
      if (imageUrl) params.image_url = imageUrl;
      if (videoUrl) params.video_url = videoUrl;
      canvas.addEdge(step.depends_on, step.id, {
        capability: step.capability,
        prompt: step.prompt,
        action: step.type,
      });
    }
  }

  // Yield tool_call event
  yield {
    type: "tool_call",
    name: "inference",
    input: {
      capability: step.capability,
      prompt: step.prompt,
      params,
    },
  };

  // Resolve capability against live registry (guards against invalid names from /enrich)
  const resolvedCap = resolveCapability(step.capability, step.type) || "flux-dev";

  // Run inference
  const t0 = performance.now();
  const result = await runInference({
    capability: resolvedCap,
    prompt: step.prompt,
    params,
  });
  const elapsed = performance.now() - t0;

  // Yield tool_result event
  yield {
    type: "tool_result",
    name: "inference",
    result: { ...result, _elapsed: elapsed },
  };

  // Update card with result
  const { imageUrl, videoUrl, audioUrl } = extractUrls(
    result as Record<string, unknown>
  );
  const url = imageUrl || videoUrl || audioUrl;

  if (result.error) {
    canvas.updateCard(card.id, { error: result.error });
    say(`Step "${step.title || step.id}" failed: ${result.error}`);
  } else if (url) {
    canvas.updateCard(card.id, { url });
    say(
      `${step.title || step.id} — ${step.capability} (${(elapsed / 1000).toFixed(1)}s)`
    );
  } else {
    canvas.updateCard(card.id, { error: "No media returned" });
  }

  // Update edge meta with elapsed time
  if (step.depends_on) {
    canvas.addEdge(step.depends_on, step.id, {
      capability: step.capability,
      prompt: step.prompt,
      action: step.type,
      elapsed,
    });
  }

  results.set(step.id, {
    ...(result as Record<string, unknown>),
    _elapsed: elapsed,
  });
}

// --- DAG executor (yields events as steps execute) ---
async function* executeDag(
  steps: AgentStep[]
): AsyncGenerator<AgentEvent> {
  const results = new Map<string, Record<string, unknown>>();
  const idSet = new Set(steps.map((s) => s.id));

  const independent = steps.filter(
    (s) => !s.depends_on || !idSet.has(s.depends_on)
  );
  const dependent = steps.filter(
    (s) => s.depends_on && idSet.has(s.depends_on)
  );

  // Run independent steps concurrently, collect events
  const eventQueues: AgentEvent[][] = independent.map(() => []);
  const indResults = await Promise.allSettled(
    independent.map(async (step, idx) => {
      for await (const event of executeStep(step, results)) {
        eventQueues[idx].push(event);
      }
    })
  );

  // Yield all collected events
  for (const queue of eventQueues) {
    for (const event of queue) {
      yield event;
    }
  }

  // Log failures
  for (let i = 0; i < indResults.length; i++) {
    if (indResults[i].status === "rejected") {
      const reason = (indResults[i] as PromiseRejectedResult).reason;
      say(
        `Step "${independent[i].title || independent[i].id}" error: ${reason}`,
        "system"
      );
      results.set(independent[i].id, { error: String(reason) });
      yield {
        type: "error",
        content: `Step "${independent[i].title || independent[i].id}" error: ${reason}`,
      };
    }
  }

  // Run dependent steps in waves
  let remaining = [...dependent];
  while (remaining.length > 0) {
    if (stopped) break;

    const ready = remaining.filter(
      (s) => s.depends_on && results.has(s.depends_on)
    );
    if (ready.length === 0) {
      for (const s of remaining) {
        say(
          `Skipped "${s.title || s.id}" — dependency not available`,
          "system"
        );
        yield {
          type: "error",
          content: `Skipped "${s.title || s.id}" — dependency not available`,
        };
      }
      break;
    }

    const waveQueues: AgentEvent[][] = ready.map(() => []);
    const waveResults = await Promise.allSettled(
      ready.map(async (step, idx) => {
        for await (const event of executeStep(step, results)) {
          waveQueues[idx].push(event);
        }
      })
    );

    for (const queue of waveQueues) {
      for (const event of queue) {
        yield event;
      }
    }

    for (let i = 0; i < waveResults.length; i++) {
      if (waveResults[i].status === "rejected") {
        const reason = (waveResults[i] as PromiseRejectedResult).reason;
        say(
          `Step "${ready[i].title || ready[i].id}" error: ${reason}`,
          "system"
        );
        results.set(ready[i].id, { error: String(reason) });
        yield {
          type: "error",
          content: `Step "${ready[i].title || ready[i].id}" error: ${reason}`,
        };
      }
    }

    remaining = remaining.filter((s) => !ready.includes(s));
  }
}

// --- The plugin object ---

export const builtInPlugin: AgentPlugin = {
  id: "built-in",
  name: "Built-in Agent",
  description:
    "SDK-powered agent with enrich planning and DAG execution. No LLM required.",
  configFields: [],

  async *sendMessage(
    text: string,
    _context: CanvasContext
  ): AsyncGenerator<AgentEvent> {
    stopped = false;
    setProcessing(true);

    try {
      const lower = text.toLowerCase().trim();

      // Command shortcuts
      if (/^(ls|list)\s+cap/i.test(lower)) {
        yield { type: "tool_call", name: "capabilities", input: {} };
        const caps = await sdkFetch<
          Array<{ id: string; name?: string }>
        >("/capabilities");
        const capText = caps
          .map((c) => `\u2022 ${c.id}${c.name ? ` \u2014 ${c.name}` : ""}`)
          .join("\n");
        say(capText);
        yield {
          type: "tool_result",
          name: "capabilities",
          result: caps,
        };
        yield { type: "text", content: capText };
        yield { type: "done" };
        return;
      }

      // Enrich -> DAG execute
      say("Planning\u2026", "system");
      yield { type: "text", content: "Planning\u2026" };

      const steps = await enrichTask(text, "");
      const planMsg = `${steps.length} step${steps.length > 1 ? "s" : ""} planned`;
      say(planMsg, "system");
      yield { type: "text", content: planMsg };

      yield* executeDag(steps);
      yield { type: "done" };
    } catch (e) {
      const errMsg = `Error: ${e instanceof Error ? e.message : "Unknown error"}`;
      say(errMsg, "system");
      yield { type: "error", content: errMsg };
      yield { type: "done" };
    } finally {
      setProcessing(false);
    }
  },

  configure() {
    // Built-in plugin has no config fields (uses SDK config from SettingsPanel)
  },

  stop() {
    stopped = true;
    setProcessing(false);
  },
};
