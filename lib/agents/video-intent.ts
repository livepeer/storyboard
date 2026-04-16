export interface SceneDuration {
  sceneIndex: number;
  seconds: number;
}

export interface VideoStrategy {
  mode: "overview" | "full" | "custom";
  totalClips: number;
  perScene: number[];
}

export interface PerSceneNotes {
  visualLanguage?: string;
  cameraNotes?: string;
  score?: string;
}

// Video-intent detection. A brief is a "video project" only when the
// user EXPLICITLY asks for motion — not just because it contains
// standard cinematography framing terms like "wide shot" or "close-up",
// which are equally valid for still storyboards.
//
// Requires one of:
//   - An explicit video noun ("animation", "short film", "movie clip", ...)
//   - An explicit duration ("8-second", "duration: 5s")
//   - A motion verb (tracking, pan, zoom, cut to, fade to, dissolve, ...)
//
// Framing-only terms (wide shot, close-up, medium shot, three-quarter
// shot, low angle, etc.) do NOT trigger video intent — they describe
// composition, which stills have too.
const VIDEO_KEYWORDS: RegExp[] = [
  // Explicit video nouns (must be standalone — "cinematic short film"
  // in a style-context paragraph won't match because "cinematic short"
  // is style language, not a command)
  /\b(animated|animation|short film to be animated|video clip|movie|music video|film clip)\b/i,
  // Explicit duration
  /\bduration:\s*\d+\s*(s|sec|second|minute)/i,
  /\b\d+[-\s]second\s+(video|clip|animation|film)\b/i,
  // Explicit motion / transition verbs (NOT framing)
  /\b(tracking shot|pan(ning)? (across|from|to)|zoom(ing)? in|zoom(ing)? out|cut to|fade to|dissolve to|tilt up|tilt down|dolly (in|out|shot)|crane shot|slow motion)\b/i,
  // Only flag if the brief explicitly says "video storyboard" or similar
  /\b(animate this|animate the|make it a video|turn (it|this) into (a )?(video|animation|film))\b/i,
];

export function detectVideoIntent(brief: string): boolean {
  return VIDEO_KEYWORDS.some((re) => re.test(brief));
}

export function extractDurations(brief: string): SceneDuration[] {
  const sceneBlocks = brief.split(/(?=SCENE\s*\d+)/i);
  const result: SceneDuration[] = [];
  let sceneIdx = 0;
  for (const block of sceneBlocks) {
    if (!/SCENE\s*\d+/i.test(block)) continue;
    const m = block.match(/duration:\s*(\d+)\s*(s|sec|second|minute|min)/i);
    if (m) {
      let seconds = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      if (unit.startsWith("min")) seconds *= 60;
      result.push({ sceneIndex: sceneIdx, seconds });
    }
    sceneIdx++;
  }
  return result;
}

export function planVideoStrategy(
  mode: "overview" | "full" | "custom",
  durations: number[]
): VideoStrategy {
  if (mode === "overview") {
    const perScene = durations.length > 0 ? durations.map(() => 1) : [];
    return { mode, totalClips: perScene.length, perScene };
  }
  if (mode === "full") {
    const perScene = durations.map((d) => Math.max(1, Math.ceil(d / 10)));
    return { mode, totalClips: perScene.reduce((a, b) => a + b, 0), perScene };
  }
  return { mode, totalClips: 0, perScene: [] };
}

export function buildLockedPrefix(ctx: {
  style: string;
  characters: string;
  setting: string;
  palette: string;
  mood: string;
  rules: string;
}): string {
  const parts: string[] = [];
  if (ctx.style) parts.push(ctx.style);
  if (ctx.characters) parts.push(ctx.characters);
  if (ctx.palette) parts.push(ctx.palette);
  if (ctx.setting) parts.push(ctx.setting);
  if (ctx.mood) parts.push(ctx.mood);
  const joined = parts.join(", ");
  const words = joined.split(/\s+/);
  return (words.length > 80 ? words.slice(0, 80).join(" ") : joined) + ", ";
}

export function extractColorArc(brief: string): string[] {
  const arc: string[] = [];
  const lines = brief.split("\n");
  for (const line of lines) {
    const m = line.match(/scene\s*\d+\s*[\u2192\->]+\s*(.+)/i);
    if (m) {
      const color = m[1].trim().replace(/[(\s]+(possibility|friction|crisis|healing|time and life|belonging)[)\s]*$/i, "").trim();
      if (color.length > 0 && color.length < 60) arc.push(color);
    }
  }
  return arc;
}

export function extractCharacterLock(brief: string): string {
  const matches: string[] = [];
  const re = /\b([A-Z]{2,}[A-Z]*)\b\s*[,\u2014]\s*(?:a|the|an)?\s*([^.\n]{20,200})/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(brief)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const desc = m[2].trim().replace(/\s+/g, " ").slice(0, 120);
    matches.push(`${name} is ${desc}`);
    if (matches.length >= 3) break;
  }
  return matches.join(". ");
}

export function extractPerSceneNotes(sceneText: string): PerSceneNotes {
  const notes: PerSceneNotes = {};
  const visMatch = sceneText.match(/visual language:\s*([^\n]+)/i);
  if (visMatch) notes.visualLanguage = visMatch[1].trim().slice(0, 200);
  const camMatch = sceneText.match(/camera:\s*([^\n|]+)/i);
  if (camMatch) notes.cameraNotes = camMatch[1].trim().slice(0, 100);
  const scoreMatch = sceneText.match(/score:\s*([^\n]+)/i);
  if (scoreMatch) notes.score = scoreMatch[1].trim().slice(0, 100);
  return notes;
}
