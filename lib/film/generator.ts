import type { Film, FilmShot } from "./types";
import type { CreativeContext } from "@/lib/agents/session-context";
import { FILM_SYSTEM_PROMPT, FILM_SKILLS, getActiveFilmSkill, detectFilmSkill, setActiveFilmSkill } from "./film-prompt";
import { extractJsonObject } from "@/lib/story/generator";
import { extractGeminiTokens } from "@/lib/utils/execution-tracker";

export async function generateFilm(
  userPrompt: string
): Promise<{ ok: true; film: Omit<Film, "id" | "createdAt" | "status">; tokens: { input: number; output: number } } | { ok: false; error: string }> {
  const trimmed = userPrompt.trim();
  if (trimmed.length < 3) return { ok: false, error: "Give me a concept — a character, scene, or situation." };

  // Auto-detect or use active skill to add genre-specific guidance
  let skillPrompt = "";
  const skill = getActiveFilmSkill() || detectFilmSkill(trimmed);
  if (skill && FILM_SKILLS[skill]) {
    const s = FILM_SKILLS[skill];
    skillPrompt = `\n\n## Active Film Skill: ${s.name}\nDefault style: ${s.styleHint}\nApply this genre's conventions for camera, lighting, palette, and pacing.`;
    if (!getActiveFilmSkill()) setActiveFilmSkill(skill);
    console.log(`[Film] Auto-detected skill: ${skill} (${s.name})`);
  }

  // Route through SDK's gemini-text capability (BYOC has the key).
  // Falls back to /api/agent/gemini if SDK is unreachable.
  let text = "";
  let tokens = { input: 0, output: 0 };
  const fullPrompt = `${FILM_SYSTEM_PROMPT}${skillPrompt}\n\nUser request: ${trimmed}`;

  try {
    const { runInference } = await import("@/lib/sdk/client");
    const result = await runInference({ capability: "gemini-text", prompt: fullPrompt, params: {} });
    const r = result as Record<string, unknown>;
    const data = (r.data ?? r) as Record<string, unknown>;
    text = (data.text as string)
      ?? (data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>)?.[0]?.content?.parts?.map((p) => p.text || "").join("")
      ?? (r.text as string) ?? "";
  } catch {
    try {
      const resp = await fetch("/api/agent/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: trimmed }] }],
          system_instruction: { parts: [{ text: FILM_SYSTEM_PROMPT + skillPrompt }] },
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return { ok: false, error: `Film director error ${resp.status}: ${errText.slice(0, 140)}` };
      }
      const payload = await resp.json();
      tokens = extractGeminiTokens(payload);
      text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
        .candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    } catch (e2) {
      return { ok: false, error: `Can't reach film director: ${(e2 as Error).message}` };
    }
  }
  if (!text) return { ok: false, error: "Film director returned empty response." };

  const parsed = extractJsonObject(text);
  if (!parsed) return { ok: false, error: "Film director response wasn't valid JSON." };

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.error === "string") return { ok: false, error: obj.error };

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (!title) return { ok: false, error: "Missing title" };

  const style = typeof obj.style === "string" ? obj.style : "";
  const characterLock = typeof obj.character_lock === "string" ? obj.character_lock : "";
  const ctxRaw = (obj.context || {}) as Record<string, unknown>;
  const shotsRaw = obj.shots as unknown;
  if (!Array.isArray(shotsRaw) || shotsRaw.length === 0) return { ok: false, error: "Missing shots" };

  const context: CreativeContext = {
    style: (ctxRaw.style as string) || style,
    palette: (ctxRaw.palette as string) || "",
    characters: (ctxRaw.characters as string) || characterLock,
    setting: (ctxRaw.setting as string) || "",
    rules: (ctxRaw.rules as string) || "",
    mood: (ctxRaw.mood as string) || "",
  };

  const shots: FilmShot[] = [];
  for (const s of shotsRaw as Array<Record<string, unknown>>) {
    if (!s || typeof s !== "object") continue;
    const desc = typeof s.description === "string" ? s.description.trim() : "";
    if (desc.length < 5) continue;
    shots.push({
      index: typeof s.index === "number" ? s.index : shots.length + 1,
      title: typeof s.title === "string" ? s.title.trim() : `Shot ${shots.length + 1}`,
      camera: typeof s.camera === "string" ? s.camera.trim() : "medium",
      description: desc,
      duration: typeof s.duration === "number" ? s.duration : 4,
    });
  }
  if (shots.length === 0) return { ok: false, error: "No usable shots" };

  return {
    ok: true,
    film: { originalPrompt: trimmed, title, style, characterLock, context, shots },
    tokens,
  };
}
