/**
 * Smart-split a brief into one or more projects on scene-number reset.
 *
 * A new project starts whenever the current scene number is not
 * strictly greater than the previous one (i.e. it reset to 1 or went
 * backwards). Single-project briefs return one group; combined
 * "6-scene video + 10-scene graphic novel" returns two.
 *
 * Ported from storyboard's lib/agents/preprocessor.ts.
 */

import { summarize, type ExtractedScene } from "./scenes.js";

export interface ExtractedProject {
  /** Bytes of the original text relevant to this project. */
  subText: string;
  scenes: ExtractedScene[];
}

export function extractProjects(text: string): ExtractedProject[] {
  const sceneRegex =
    /(?:scene|shot|frame)\s*(\d+)\s*[—\-–:]\s*([^\n]+)\n([\s\S]*?)(?=(?:scene|shot|frame)\s*\d+\s*[—\-–:]|$)/gi;
  const raw: Array<{ num: number; title: string; desc: string; offset: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = sceneRegex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    const title = match[2].trim();
    const desc = match[3].trim();
    if (desc.length < 10) continue;
    raw.push({ num, title, desc, offset: match.index });
  }
  if (raw.length === 0) return [];

  type Raw = (typeof raw)[number];
  const groups: Raw[][] = [];
  let current: Raw[] = [];
  let lastNum = 0;
  for (const r of raw) {
    if (r.num <= lastNum) {
      if (current.length > 0) groups.push(current);
      current = [];
    }
    current.push(r);
    lastNum = r.num;
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group, i) => {
    const startOffset = group[0].offset;
    const endOffset = i + 1 < groups.length ? groups[i + 1][0].offset : text.length;
    const subText = text.slice(startOffset, endOffset);
    const scenes: ExtractedScene[] = group.map((r) => ({
      title: r.title,
      description: r.desc.slice(0, 200),
      prompt: summarize(r.title, r.desc),
    }));
    return { subText, scenes };
  });
}
