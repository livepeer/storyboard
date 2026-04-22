import type { PipelineInfo, PipelineRegistry, StreamRecipe } from "./types";
import { BUILTIN_RECIPES, KNOWN_PIPELINES } from "./recipes";

/** Intent keywords → recipe ID mapping. */
const INTENT_MAP: Array<{ keywords: string[]; recipe: string }> = [
  { keywords: ["smooth", "fluid", "24fps", "responsive"], recipe: "ltx-responsive" },
  { keywords: ["buttery", "48fps", "ultra smooth"], recipe: "ltx-smooth" },
  { keywords: ["depth", "structure", "architecture", "preserve"], recipe: "depth-lock" },
  { keywords: ["sketch", "scribble", "edge", "contour", "cartoon guide"], recipe: "scribble-guide" },
  { keywords: ["interpolat", "smoother frame"], recipe: "interpolated" },
  { keywords: ["fast", "preview", "quick", "draft"], recipe: "fast-preview" },
  { keywords: ["highest quality", "best quality", "hq", "14b"], recipe: "krea-hq" },
  { keywords: ["consistent", "same face", "same character", "persistent", "memory"], recipe: "memflow-consistent" },
  { keywords: ["text only", "no input", "no camera", "no webcam"], recipe: "text-only" },
];

/**
 * Create a pipeline registry with built-in pipelines and recipes.
 * Optionally override pipelines from a live Scope capabilities fetch.
 */
export function createPipelineRegistry(
  livePipelines?: PipelineInfo[],
  customRecipes?: StreamRecipe[],
): PipelineRegistry {
  const pipelines = livePipelines ?? KNOWN_PIPELINES;
  const recipes = [...BUILTIN_RECIPES, ...(customRecipes ?? [])];
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));

  return {
    pipelines,
    recipes,

    getRecipe(id: string): StreamRecipe | undefined {
      return recipeMap.get(id);
    },

    resolve(intent: string): StreamRecipe {
      const lower = intent.toLowerCase();
      for (const { keywords, recipe } of INTENT_MAP) {
        if (keywords.some((kw) => lower.includes(kw))) {
          const r = recipeMap.get(recipe);
          if (r) return r;
        }
      }
      return recipeMap.get("classic")!;
    },

    listRecipes(quality?: "fast" | "balanced" | "quality"): StreamRecipe[] {
      if (!quality) return recipes;
      return recipes.filter((r) => r.quality === quality);
    },
  };
}
