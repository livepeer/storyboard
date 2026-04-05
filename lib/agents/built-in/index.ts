import type { AgentPlugin, AgentStep, EnrichResponse } from "../types";
import type { CardType } from "@/lib/canvas/types";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import { sdkFetch, runInference } from "@/lib/sdk/client";

function say(text: string, role: "agent" | "system" = "agent") {
  useChatStore.getState().addMessage(text, role);
}

function setProcessing(v: boolean) {
  useChatStore.getState().setProcessing(v);
}

// --- Enrich: ask SDK to plan steps ---
async function enrichTask(task: string, context: string): Promise<AgentStep[]> {
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
      capability: "flux-1.1-pro",
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

// --- Execute a single step ---
async function executeStep(
  step: AgentStep,
  results: Map<string, Record<string, unknown>>
): Promise<Record<string, unknown>> {
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

  // Run inference
  const t0 = performance.now();
  const result = await runInference({
    capability: step.capability,
    prompt: step.prompt,
    params,
  });
  const elapsed = performance.now() - t0;

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

  return { ...(result as Record<string, unknown>), _elapsed: elapsed };
}

// --- DAG executor ---
async function executeDag(steps: AgentStep[]) {
  const results = new Map<string, Record<string, unknown>>();
  const idSet = new Set(steps.map((s) => s.id));

  const independent = steps.filter(
    (s) => !s.depends_on || !idSet.has(s.depends_on)
  );
  const dependent = steps.filter(
    (s) => s.depends_on && idSet.has(s.depends_on)
  );

  // Run independent steps concurrently
  const indResults = await Promise.allSettled(
    independent.map(async (step) => {
      const r = await executeStep(step, results);
      results.set(step.id, r);
    })
  );

  // Log failures
  for (let i = 0; i < indResults.length; i++) {
    if (indResults[i].status === "rejected") {
      const reason = (indResults[i] as PromiseRejectedResult).reason;
      say(
        `Step "${independent[i].title || independent[i].id}" error: ${reason}`,
        "system"
      );
      results.set(independent[i].id, { error: String(reason) });
    }
  }

  // Run dependent steps in waves
  let remaining = [...dependent];
  while (remaining.length > 0) {
    const ready = remaining.filter(
      (s) => s.depends_on && results.has(s.depends_on)
    );
    if (ready.length === 0) {
      // Deadlock — remaining steps have unresolved deps
      for (const s of remaining) {
        say(`Skipped "${s.title || s.id}" — dependency not available`, "system");
      }
      break;
    }

    const waveResults = await Promise.allSettled(
      ready.map(async (step) => {
        const r = await executeStep(step, results);
        results.set(step.id, r);
      })
    );

    for (let i = 0; i < waveResults.length; i++) {
      if (waveResults[i].status === "rejected") {
        const reason = (waveResults[i] as PromiseRejectedResult).reason;
        say(
          `Step "${ready[i].title || ready[i].id}" error: ${reason}`,
          "system"
        );
        results.set(ready[i].id, { error: String(reason) });
      }
    }

    remaining = remaining.filter((s) => !ready.includes(s));
  }
}

// --- Main handler ---
async function handleMessage(text: string) {
  setProcessing(true);

  try {
    // Command shortcuts
    const lower = text.toLowerCase().trim();

    if (/^(ls|list)\s+cap/i.test(lower)) {
      const caps = await sdkFetch<Array<{ id: string; name?: string }>>(
        "/capabilities"
      );
      say(
        caps.map((c) => `• ${c.id}${c.name ? ` — ${c.name}` : ""}`).join("\n")
      );
      return;
    }

    // Enrich → DAG execute
    say("Planning…", "system");
    const steps = await enrichTask(text, "");
    say(
      `${steps.length} step${steps.length > 1 ? "s" : ""} planned`,
      "system"
    );
    await executeDag(steps);
  } catch (e) {
    say(
      `Error: ${e instanceof Error ? e.message : "Unknown error"}`,
      "system"
    );
  } finally {
    setProcessing(false);
  }
}

export const builtInPlugin: AgentPlugin = {
  id: "built-in",
  name: "Built-in Agent",
  handleMessage,
};
