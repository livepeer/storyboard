const BEAT_LABELS = [
  "opening moment",
  "building tension",
  "mid-action",
  "rising stakes",
  "climax",
  "resolution",
  "afterglow",
  "transition",
];

/**
 * Break a scene description into N beats by sentence splitting.
 * If there aren't enough sentences, repeat the description with beat labels.
 * Synchronous, no LLM call — used as fallback when LLM fails.
 */
export function breakSceneIntoBeatsFallback(description: string, n: number): string[] {
  if (n <= 1) return [description.trim()];

  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  if (sentences.length >= n) {
    const beats: string[] = [];
    const groupSize = Math.ceil(sentences.length / n);
    for (let i = 0; i < n; i++) {
      const start = i * groupSize;
      const end = Math.min(start + groupSize, sentences.length);
      beats.push(sentences.slice(start, end).join(" "));
    }
    return beats;
  }

  const beats: string[] = [];
  for (let i = 0; i < n; i++) {
    const label = BEAT_LABELS[i % BEAT_LABELS.length];
    beats.push(`${description.trim()}, ${label}`);
  }
  return beats;
}

/**
 * Async version that calls the LLM to break a scene into beats.
 * Falls back to breakSceneIntoBeatsFallback on failure.
 */
export async function breakSceneIntoBeats(description: string, n: number): Promise<string[]> {
  if (n <= 1) return [description.trim()];

  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Break this scene description into exactly ${n} beats. Each beat is a short prompt (under 20 words) describing a consecutive moment of motion. Each beat should evolve naturally from the previous one. Return exactly ${n} lines, one beat per line, no numbering.\n\nScene: ${description.slice(0, 1500)}`,
              },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) return breakSceneIntoBeatsFallback(description, n);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const lines = text
      .split("\n")
      .map((l: string) => l.replace(/^\d+[.)]\s*/, "").trim())
      .filter((l: string) => l.length > 0);
    if (lines.length < n) return breakSceneIntoBeatsFallback(description, n);
    return lines.slice(0, n);
  } catch {
    return breakSceneIntoBeatsFallback(description, n);
  }
}
