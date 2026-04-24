/**
 * Story generator — calls the currently-active LLM provider (via the
 * server-side API route) with the storyteller system prompt, parses
 * the JSON response into a Story, and stashes it in the story store
 * as the pending draft. Deliberately decoupled from the AgentRunner
 * path so /story stays a single lightweight LLM call — no tool use,
 * no multi-turn loop, no 19-tool schema overhead.
 */

import type { Story, StoryScene } from "./types";
import type { CreativeContext } from "@/lib/agents/session-context";
import { extractGeminiTokens } from "@/lib/utils/execution-tracker";

/** Fetch skills/storyteller.md at runtime so edits to the skill file take effect without code changes. */
let _promptCache: string | null = null;
async function getStorytellerPrompt(): Promise<string> {
  if (_promptCache) return _promptCache;
  try {
    const resp = await fetch("/skills/storyteller.md");
    if (resp.ok) {
      _promptCache = await resp.text();
      return _promptCache;
    }
  } catch { /* fall through */ }
  // Minimal fallback — should never be hit if public/skills/storyteller.md exists
  return "You are a visual storyteller. Respond with a JSON story object with title, audience, arc, context, and scenes.";
}

/**
 * Tolerant JSON extractor. LLMs sometimes wrap output in code fences,
 * prepend "Here's the story:", or append "Let me know if...". Strip
 * common wrappers and parse whatever's left. Returns null on failure.
 */
export function extractJsonObject(raw: string): unknown | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip leading/trailing code fences (```json ... ``` or ``` ... ```).
  text = text.replace(/^```(?:json)?\s*\n?/i, "");
  text = text.replace(/\n?```\s*$/i, "");
  text = text.trim();
  // If there's a leading non-JSON preamble, find the first `{` and
  // the matching last `}` and try parsing that slice.
  if (!text.startsWith("{")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last < first) return null;
    text = text.slice(first, last + 1);
  }
  try {
    return JSON.parse(text);
  } catch {
    // Last-ditch: find the largest balanced {...} substring
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last < first) return null;
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Validate and normalize a parsed story payload into the Story shape
 * our store expects. Returns null if the payload is unusable.
 * Also catches the storyteller's {"error":"..."} soft-fail path.
 */
export function validateStoryPayload(
  parsed: unknown,
  originalPrompt: string
): { ok: true; story: Omit<Story, "id" | "createdAt" | "status"> }
  | { ok: false; reason: string } {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "Response was not a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;

  // Soft-fail from the model when the prompt is too vague.
  if (typeof obj.error === "string") {
    return { ok: false, reason: obj.error };
  }

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const audience = typeof obj.audience === "string" ? obj.audience.trim() : "all ages";
  const arc = typeof obj.arc === "string" ? obj.arc.trim() : "";
  const ctxRaw = obj.context as Record<string, unknown> | undefined;
  const scenesRaw = obj.scenes as unknown;

  if (!title) return { ok: false, reason: "Missing 'title'" };
  if (!ctxRaw || typeof ctxRaw !== "object") {
    return { ok: false, reason: "Missing 'context' block" };
  }
  if (!Array.isArray(scenesRaw) || scenesRaw.length === 0) {
    return { ok: false, reason: "Missing 'scenes' array" };
  }

  const context: CreativeContext = {
    style: typeof ctxRaw.style === "string" ? ctxRaw.style : "",
    palette: typeof ctxRaw.palette === "string" ? ctxRaw.palette : "",
    characters: typeof ctxRaw.characters === "string" ? ctxRaw.characters : "",
    setting: typeof ctxRaw.setting === "string" ? ctxRaw.setting : "",
    rules: typeof ctxRaw.rules === "string" ? ctxRaw.rules : "",
    mood: typeof ctxRaw.mood === "string" ? ctxRaw.mood : "",
  };
  // At minimum we want style + characters for the apply flow to be useful.
  if (!context.style && !context.characters) {
    return { ok: false, reason: "Story context has no style or characters" };
  }

  const scenes: StoryScene[] = [];
  for (let i = 0; i < scenesRaw.length; i++) {
    const s = scenesRaw[i] as Record<string, unknown>;
    if (!s || typeof s !== "object") continue;
    const desc = typeof s.description === "string" ? s.description.trim() : "";
    if (desc.length < 10) continue;
    scenes.push({
      index: typeof s.index === "number" ? s.index : i + 1,
      title: typeof s.title === "string" && s.title.trim()
        ? s.title.trim()
        : `Scene ${i + 1}`,
      description: desc,
      beats: Array.isArray(s.beats)
        ? (s.beats as unknown[]).filter((b): b is string => typeof b === "string")
        : undefined,
    });
  }
  if (scenes.length === 0) {
    return { ok: false, reason: "No usable scenes in the response" };
  }

  return {
    ok: true,
    story: {
      originalPrompt,
      title,
      audience,
      arc,
      context,
      scenes,
    },
  };
}

/**
 * Call Gemini (via the server-side proxy) to generate a story from a
 * short prompt. Returns the parsed Story on success or an error
 * message on failure.
 */
export async function generateStory(
  userPrompt: string
): Promise<
  | { ok: true; story: Omit<Story, "id" | "createdAt" | "status">; tokens: { input: number; output: number } }
  | { ok: false; error: string }
> {
  const trimmed = userPrompt.trim();
  if (trimmed.length < 3) {
    return { ok: false, error: "Give me a concept — a character, genre, or situation." };
  }

  const systemPrompt = await getStorytellerPrompt();

  // Route through SDK's gemini-text capability (uses the BYOC adapter's
  // Gemini API key — no local GEMINI_API_KEY env var needed).
  // Falls back to /api/agent/gemini if SDK is unreachable.
  let text = "";
  let tokens = { input: 0, output: 0 };

  try {
    const { runInference } = await import("@/lib/sdk/client");
    const result = await runInference({
      capability: "gemini-text",
      prompt: `${systemPrompt}\n\nUser request: ${trimmed}`,
      params: {},
    });
    const r = result as Record<string, unknown>;
    const data = (r.data ?? r) as Record<string, unknown>;
    // gemini-text returns { text: "..." } or { data: { text: "..." } }
    text = (data.text as string)
      ?? (data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>)?.[0]?.content?.parts?.map((p) => p.text || "").join("")
      ?? (r.text as string)
      ?? "";
    tokens = {
      input: (data.prompt_tokens as number) ?? 0,
      output: (data.completion_tokens as number) ?? 0,
    };
  } catch (e) {
    // Fallback: try the local Gemini proxy (needs GEMINI_API_KEY env var)
    try {
      const resp = await fetch("/api/agent/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: trimmed }] }],
          system_instruction: { parts: [{ text: systemPrompt }] },
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return { ok: false, error: `Storyteller error ${resp.status}: ${errText.slice(0, 140)}` };
      }
      const payload = await resp.json();
      tokens = extractGeminiTokens(payload);
      text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
        .candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    } catch (fallbackErr) {
      return { ok: false, error: `Can't reach storyteller: ${(e as Error).message}` };
    }
  }
  if (!text) {
    return { ok: false, error: "Storyteller returned an empty response — try again." };
  }

  const parsed = extractJsonObject(text);
  if (!parsed) {
    return { ok: false, error: "Storyteller response wasn't valid JSON — try again." };
  }

  const validation = validateStoryPayload(parsed, trimmed);
  if (!validation.ok) {
    return { ok: false, error: validation.reason };
  }
  return { ...validation, tokens };
}
