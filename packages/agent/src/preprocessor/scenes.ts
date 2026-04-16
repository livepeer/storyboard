/**
 * Scene extraction from a brief. The Layer 1 win — parses
 * scene-structured prompts client-side without an LLM call.
 *
 * Ported from storyboard's lib/agents/preprocessor.ts, dropping the
 * Zustand store dependencies. The smart-split (multi-project) sits
 * on top of this in multi-project.ts.
 */

const METADATA_LINE_RE =
  /^\s*(panel|colour|color|score|visual|super|duration|camera|score|sound|music|shot|lens|palette|style|lighting|art\s*style)\s*[:—\-–]/i;
const HAS_SENTENCE_RE = /[.!?](\s|$)/;

export interface ExtractedScene {
  title: string;
  description: string;
  prompt: string;
}

export function summarize(title: string, description: string): string {
  const lines = description
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 10 && !METADATA_LINE_RE.test(l));
  const contentLine = lines.find((l) => HAS_SENTENCE_RE.test(l)) || lines[0] || description;
  const firstSentence = contentLine.split(/[.!?]/)[0]?.trim() || "";
  const combined = `${title}. ${firstSentence}`;
  const words = combined.split(/\s+/);
  return words.length <= 25 ? combined : words.slice(0, 25).join(" ");
}

export function extractScenes(text: string): ExtractedScene[] {
  const sceneRegex =
    /(?:scene|shot|frame)\s*(\d+)\s*[—\-–:]\s*([^\n]+)\n([\s\S]*?)(?=(?:scene|shot|frame)\s*\d+\s*[—\-–:]|$)/gi;
  const scenes: ExtractedScene[] = [];
  let match: RegExpExecArray | null;
  while ((match = sceneRegex.exec(text)) !== null) {
    const title = match[2].trim();
    const desc = match[3].trim();
    if (desc.length < 10) continue;
    scenes.push({ title, description: desc.slice(0, 200), prompt: summarize(title, desc) });
  }
  return scenes;
}
