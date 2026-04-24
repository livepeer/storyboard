/**
 * Skill Resolver — detects conflicts between active skills
 * and resolves them with clear precedence.
 *
 * Skills are categorized: style, mood, technique, character.
 * Conflicts only occur WITHIN the same category
 * (e.g., "ghibli" + "photorealistic" = style conflict).
 * Cross-category combos are fine
 * (e.g., "ghibli" + "dark mood" = no conflict).
 */

export interface SkillEntry {
  id: string;
  category: string;
  prompt_prefix?: string;
  prompt_suffix?: string;
  model_hint?: string;
}

export interface SkillConflict {
  category: string;
  skills: string[];
  message: string;
}

export interface ResolvedSkills {
  /** Skills to apply (no conflicts, or conflicts resolved by priority) */
  active: SkillEntry[];
  /** Detected conflicts (for user warning) */
  conflicts: SkillConflict[];
}

/** Style keywords that indicate a specific visual aesthetic. */
const STYLE_KEYWORDS: Record<string, string[]> = {
  photorealistic: ["photorealistic", "photo", "realistic", "dslr", "raw"],
  anime: ["anime", "manga", "cel-shad", "japanese"],
  ghibli: ["ghibli", "miyazaki", "watercolor", "hand-painted"],
  cartoon: ["cartoon", "comic", "pixel", "lego", "chibi"],
  noir: ["noir", "shadow", "monochrome", "black-and-white"],
  painterly: ["oil-paint", "impressionist", "gouache", "pastel"],
};

/** Detect style category from a skill's prompt prefix. */
function detectStyleCategory(prefix: string): string | null {
  if (!prefix) return null;
  const lower = prefix.toLowerCase();
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return style;
  }
  return null;
}

/**
 * Resolve skills and detect conflicts.
 * Most recently added skill wins within a category.
 */
export function resolveSkills(skills: SkillEntry[]): ResolvedSkills {
  const conflicts: SkillConflict[] = [];
  const byCategoryStyle = new Map<string, SkillEntry[]>();

  // Group style-override skills by detected style category
  for (const skill of skills) {
    const styleCategory = detectStyleCategory(skill.prompt_prefix || "");
    if (styleCategory) {
      const existing = byCategoryStyle.get(styleCategory) || [];
      existing.push(skill);
      byCategoryStyle.set(styleCategory, existing);
    }
  }

  // Check for cross-category style conflicts
  const styleCategories = [...byCategoryStyle.keys()];
  if (styleCategories.length > 1) {
    conflicts.push({
      category: "style",
      skills: skills.filter((s) => detectStyleCategory(s.prompt_prefix || "")).map((s) => s.id),
      message: `Conflicting styles: ${styleCategories.join(" + ")}. The most recently loaded will dominate.`,
    });
  }

  // All skills pass through — conflicts are warnings, not blockers
  return { active: skills, conflicts };
}

/** Check if two skills would conflict. */
export function wouldConflict(existing: SkillEntry[], candidate: SkillEntry): SkillConflict | null {
  const candidateStyle = detectStyleCategory(candidate.prompt_prefix || "");
  if (!candidateStyle) return null;

  for (const skill of existing) {
    const existingStyle = detectStyleCategory(skill.prompt_prefix || "");
    if (existingStyle && existingStyle !== candidateStyle) {
      return {
        category: "style",
        skills: [skill.id, candidate.id],
        message: `"${candidate.id}" (${candidateStyle}) conflicts with "${skill.id}" (${existingStyle}).`,
      };
    }
  }
  return null;
}
