import type { StreamPlan, StreamScene } from "./types";
import { STREAM_SYSTEM_PROMPT } from "./stream-prompt";
import { extractJsonObject } from "@/lib/story/generator";
import { extractGeminiTokens } from "@/lib/utils/execution-tracker";

export async function generateStreamPlan(
  userPrompt: string
): Promise<{ ok: true; plan: Omit<StreamPlan, "id" | "createdAt" | "status">; tokens: { input: number; output: number } } | { ok: false; error: string }> {
  const trimmed = userPrompt.trim();
  if (trimmed.length < 3) return { ok: false, error: "Give me a concept for the stream." };

  let resp: Response;
  try {
    resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: trimmed }] }],
        system_instruction: { parts: [{ text: STREAM_SYSTEM_PROMPT }] },
      }),
    });
  } catch (e) {
    return { ok: false, error: `Can't reach stream director: ${e instanceof Error ? e.message : "unknown"}` };
  }

  if (!resp.ok) return { ok: false, error: `Stream director error ${resp.status}` };

  const payload = await resp.json();
  const tokens = extractGeminiTokens(payload);
  const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) return { ok: false, error: "Empty response from stream director." };

  const parsed = extractJsonObject(text);
  if (!parsed) return { ok: false, error: "Response wasn't valid JSON." };
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.error === "string") return { ok: false, error: obj.error };

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (!title) return { ok: false, error: "Missing title" };

  const style = typeof obj.style === "string" ? obj.style : "";
  const graphTemplate = typeof obj.graph_template === "string" ? obj.graph_template : "text-only";
  const rawScenes = obj.scenes as unknown;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) return { ok: false, error: "Missing scenes" };

  const scenes: StreamScene[] = [];
  for (const s of rawScenes as Array<Record<string, unknown>>) {
    const prompt = typeof s.prompt === "string" ? s.prompt.trim() : "";
    if (prompt.length < 5) continue;
    scenes.push({
      index: typeof s.index === "number" ? s.index : scenes.length + 1,
      title: typeof s.title === "string" ? s.title.trim() : `Scene ${scenes.length + 1}`,
      prompt,
      duration: typeof s.duration === "number" ? Math.max(10, Math.min(60, s.duration)) : 20,
      preset: typeof s.preset === "string" ? s.preset : "cinematic",
      noiseScale: typeof s.noise_scale === "number" ? s.noise_scale : undefined,
    });
  }
  if (scenes.length === 0) return { ok: false, error: "No usable scenes" };

  return { ok: true, plan: { originalPrompt: trimmed, title, style, graphTemplate, scenes }, tokens };
}
