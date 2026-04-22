/** Pipeline info — describes a single Scope pipeline's capabilities. */
export interface PipelineInfo {
  id: string;
  name: string;
  vram_gb: number | null;
  capabilities: string[];
  default_kv_cache: number;
  default_fps: number | null;
}

/** Graph node for Scope's graph execution system. */
export interface RecipeGraphNode {
  id: string;
  type: "source" | "pipeline" | "sink" | "record";
  pipeline_id?: string;
  source_mode?: string;
}

/** Graph edge for Scope's graph execution system. */
export interface RecipeGraphEdge {
  from: string;
  from_port: string;
  to_node: string;
  to_port: string;
  kind: "stream" | "parameter";
}

/** A composable graph config. */
export interface RecipeGraph {
  nodes: RecipeGraphNode[];
  edges: RecipeGraphEdge[];
}

/** Stream recipe — bundles pipeline + graph + defaults into a named preset. */
export interface StreamRecipe {
  id: string;
  name: string;
  description: string;
  pipeline: string;
  graph: RecipeGraph;
  defaults: Record<string, unknown>;
  quality: "fast" | "balanced" | "quality";
  capabilities: string[];
  needsInput: boolean;
}

/** Pipeline registry — resolves intent to recipes. */
export interface PipelineRegistry {
  pipelines: PipelineInfo[];
  recipes: StreamRecipe[];
  getRecipe(id: string): StreamRecipe | undefined;
  resolve(intent: string): StreamRecipe;
  listRecipes(quality?: "fast" | "balanced" | "quality"): StreamRecipe[];
}
