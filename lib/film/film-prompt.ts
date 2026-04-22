/**
 * Film skill registry. Each skill overrides the base prompt with
 * genre-specific style, camera patterns, and prompt rules.
 * User loads via /film/load <genre> or auto-detected from intent.
 */
export const FILM_SKILLS: Record<string, { name: string; file: string; styleHint: string }> = {
  animation: {
    name: "Animation (Pixar/Ghibli)",
    file: "film-animation.md",
    styleHint: "3D animation or hand-painted watercolor, Pixar meets Ghibli, vibrant saturated, expressive characters",
  },
  action: {
    name: "Action (Blockbuster)",
    file: "film-action.md",
    styleHint: "cinematic blockbuster, anamorphic lens flare, teal and orange, high contrast, aggressive camera",
  },
  documentary: {
    name: "Documentary",
    file: "film-documentary.md",
    styleHint: "handheld documentary, natural light, shallow depth of field, muted earth tones, film grain",
  },
  noir: {
    name: "Film Noir",
    file: "film-noir.md",
    styleHint: "black and white, high contrast, dramatic shadows, rain-slicked streets, venetian blind shadows",
  },
  scifi: {
    name: "Sci-Fi (Blade Runner/Interstellar)",
    file: "film-scifi.md",
    styleHint: "cyberpunk neon or clean futurism, volumetric lighting, vast scale, holographic elements",
  },
  hifi: {
    name: "HiFi Video (GPT Image 2 → Seedance 2.0)",
    file: "film-hifi.md",
    styleHint: "GPT Image 2 key frame → Seedance 2.0 animation. Best for cartoon, anime, illustration, product, children's content, text-heavy scenes",
  },
};

/** Auto-detect the best film skill from user prompt keywords. */
export function detectFilmSkill(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  // hifi triggers — check first because it overlaps with animation keywords
  if (/\b(hifi|hi.fi|high.fidelity|gpt.?image|two.?step|illustration.?video)\b/.test(lower)) return "hifi";
  if (/\b(anime|ghibli|pixar|cartoon|animated|animation)\b/.test(lower)) return "animation";
  if (/\b(action|fight|explosion|chase|battle|combat|war)\b/.test(lower)) return "action";
  if (/\b(documentary|real|interview|observe|nature|wildlife)\b/.test(lower)) return "documentary";
  if (/\b(noir|detective|mystery|shadow|rain|crime|dark)\b/.test(lower)) return "noir";
  if (/\b(sci.fi|space|future|cyber|neon|robot|alien|dystop)\b/.test(lower)) return "scifi";
  return null;
}

let activeFilmSkill: string | null = null;
export function getActiveFilmSkill(): string | null { return activeFilmSkill; }
export function setActiveFilmSkill(skill: string | null): void { activeFilmSkill = skill; }

export const FILM_SYSTEM_PROMPT = `You are a film director for Livepeer Storyboard. Given a short concept, create a 4-shot mini-film script with camera directions.

## Rules
- EXACTLY 4 shots. Each ~4 seconds (total ~15s film).
- Maintain character/setting consistency across ALL shots.
- Each shot: scene description (under 80 words) + specific camera direction.
- Visual, filmable, no internal monologue.
- Arc: establishing shot → development → climax → resolution.

## Camera directions (pick one per shot)
wide establishing, slow dolly in, medium tracking, close-up handheld, pan left/right, crane up/down, low angle push-in, overhead drone, pull-back reveal, steady medium

## Output — STRICT JSON ONLY
No code fences. No preamble. No trailing text. Raw JSON only.

{
  "title": "5-8 word title",
  "style": "visual style phrase (e.g. cinematic Kurosawa, Pixar 3D, noir)",
  "character_lock": "consistent character description used in ALL shots",
  "context": {
    "style": "visual style",
    "palette": "3-5 colors",
    "characters": "named characters with visual details",
    "setting": "location/environment",
    "rules": "consistency rules",
    "mood": "emotional tone"
  },
  "shots": [
    {"index": 1, "title": "short title", "camera": "wide establishing → slow dolly in", "description": "scene description under 80 words", "duration": 4},
    {"index": 2, "title": "short title", "camera": "medium tracking shot", "description": "...", "duration": 4},
    {"index": 3, "title": "short title", "camera": "close-up handheld", "description": "...", "duration": 4},
    {"index": 4, "title": "short title", "camera": "crane up → wide reveal", "description": "...", "duration": 3}
  ]
}

If prompt is too vague: {"error":"Give me a concept — a character, a scene, or a situation."}`;
