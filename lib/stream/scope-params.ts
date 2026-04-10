/**
 * Scope parameter types — complete TypeScript representation of Scope's
 * graph engine, pipeline configs, and control protocol.
 *
 * These types map 1:1 to Scope's server/schema.py and server/graph_schema.py.
 * The SDK proxies them through to the fal runner without validation.
 */

// ---------------------------------------------------------------------------
// Graph Schema (maps to Scope server/graph_schema.py)
// ---------------------------------------------------------------------------

export type GraphNodeType = "source" | "pipeline" | "sink" | "record";
export type SourceMode = "video" | "camera" | "spout" | "ndi" | "syphon";
export type EdgeKind = "stream" | "parameter";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  source_mode?: SourceMode;
  source_name?: string;
  pipeline_id?: string;
  sink_mode?: "spout" | "ndi" | "syphon";
  sink_name?: string;
  tempo_sync?: boolean;
}

export interface GraphEdge {
  from: string;
  from_port: string;
  to_node: string;
  to_port: string;
  kind: EdgeKind;
}

export interface ScopeGraphConfig {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Pipeline Parameters (maps to Scope server/schema.py + longlive/schema.py)
// ---------------------------------------------------------------------------

export interface PromptItem {
  text: string;
  weight?: number;
}

export interface PromptTransition {
  target_prompts: PromptItem[];
  num_steps?: number; // default 8
  temporal_interpolation_method?: "slerp" | "lerp";
}

export interface LoRAScaleUpdate {
  adapter_name: string;
  scale: number;
}

export type LoRAMergeStrategy = "permanent_merge" | "runtime_peft" | "module_targeted";

export interface ModulationConfig {
  enabled: boolean;
  shape: "sine" | "cosine" | "triangle" | "saw" | "square" | "exp_decay";
  depth: number; // 0-1
  rate: "half_beat" | "beat" | "2_beat" | "bar" | "2_bar" | "4_bar";
  base_value?: number;
  min_value?: number;
  max_value?: number;
}

// ---------------------------------------------------------------------------
// Stream Parameters — full start_stream payload
// ---------------------------------------------------------------------------

export interface ScopeStreamParams {
  // Pipeline selection
  pipeline_ids: string[];
  graph?: ScopeGraphConfig;

  // Prompts
  prompts: string | PromptItem[];
  transition?: PromptTransition;

  // Input mode
  input_mode?: "text" | "video";

  // Load-time params (set at start, can't change mid-stream)
  base_seed?: number;
  height?: number;
  width?: number;
  denoising_steps?: number[];
  vae_type?: "bf16" | "fp16";
  manage_cache?: boolean;
  quantization?: boolean;

  // Runtime params (change mid-stream via control)
  noise_scale?: number; // 0.0-1.0
  noise_controller?: boolean;
  denoising_step_list?: number[];
  reset_cache?: boolean;
  kv_cache_attention_bias?: number; // 0.01-1.0

  // LoRA
  lora_path?: string;
  lora_merge_strategy?: LoRAMergeStrategy;
  lora_scales?: LoRAScaleUpdate[];

  // VACE
  vace_enabled?: boolean;
  vace_ref_images?: string[];
  vace_use_input_video?: boolean;
  vace_context_scale?: number; // 0.0-2.0

  // First/Last frame
  first_frame_image?: string;
  last_frame_image?: string;

  // Per-node targeting (for multi-pipeline graphs)
  node_id?: string;

  // Modulation (beat-sync)
  modulation?: Record<string, ModulationConfig>;
}

// ---------------------------------------------------------------------------
// Control message — sent mid-stream via /stream/{id}/control
// ---------------------------------------------------------------------------

export interface ScopeControlMessage {
  type: "parameters";
  params: Partial<ScopeStreamParams>;
}

// ---------------------------------------------------------------------------
// Presets — named parameter bundles for common styles
// ---------------------------------------------------------------------------

export interface ScopePreset {
  id: string;
  name: string;
  description: string;
  params: Partial<ScopeStreamParams>;
  prompt_prefix?: string;
}

export const SCOPE_PRESETS: ScopePreset[] = [
  {
    id: "dreamy",
    name: "Dreamy",
    description: "Ethereal, soft-focus, dreamlike quality",
    params: {
      noise_scale: 0.7,
      denoising_step_list: [1000, 500],
      kv_cache_attention_bias: 0.3,
    },
    prompt_prefix: "ethereal, soft focus, dreamy, ",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Film-grade, dramatic lighting, high detail",
    params: {
      noise_scale: 0.5,
      denoising_step_list: [1000, 750, 500, 250],
      kv_cache_attention_bias: 0.5,
    },
    prompt_prefix: "cinematic, dramatic lighting, film grain, ",
  },
  {
    id: "anime",
    name: "Anime",
    description: "Japanese animation style, vibrant colors",
    params: {
      noise_scale: 0.6,
      denoising_step_list: [1000, 750, 500],
    },
    prompt_prefix: "anime style, cel shaded, vibrant colors, ",
  },
  {
    id: "abstract",
    name: "Abstract",
    description: "Highly creative, abstract transformation",
    params: {
      noise_scale: 0.95,
      denoising_step_list: [1000, 500],
      kv_cache_attention_bias: 0.1,
    },
    prompt_prefix: "abstract art, surreal, ",
  },
  {
    id: "faithful",
    name: "Faithful",
    description: "Minimal transformation, preserves original",
    params: {
      noise_scale: 0.2,
      denoising_step_list: [1000, 750, 500, 250],
      kv_cache_attention_bias: 0.8,
    },
  },
  {
    id: "painterly",
    name: "Painterly",
    description: "Oil painting, thick brush strokes, artistic",
    params: {
      noise_scale: 0.65,
      denoising_step_list: [1000, 750, 500],
      kv_cache_attention_bias: 0.4,
    },
    prompt_prefix: "oil painting, thick brush strokes, impasto, ",
  },
  {
    id: "psychedelic",
    name: "Psychedelic",
    description: "Trippy, color-shifting, kaleidoscopic",
    params: {
      noise_scale: 0.9,
      denoising_step_list: [1000, 500],
      kv_cache_attention_bias: 0.05,
      reset_cache: true,
    },
    prompt_prefix: "psychedelic, kaleidoscopic, neon colors, fractal patterns, ",
  },
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_PIPELINES = new Set([
  "longlive",
  "streamdiffusionv2",
  "krea_realtime_video",
  "reward_forcing",
  "memflow",
  "passthrough",
  "video_depth_anything",
  "scribble",
  "rife",
  "gray",
  "optical_flow",
]);

const LORA_CAPABLE_PIPELINES = new Set([
  "longlive",
  "streamdiffusionv2",
  "krea_realtime_video",
  "reward_forcing",
  "memflow",
]);

const VACE_CAPABLE_PIPELINES = new Set([
  "longlive",
  "streamdiffusionv2",
  "krea_realtime_video",
  "reward_forcing",
  "memflow",
]);

export function isValidPipeline(id: string): boolean {
  return VALID_PIPELINES.has(id);
}

export function supportsLora(pipelineId: string): boolean {
  return LORA_CAPABLE_PIPELINES.has(pipelineId);
}

export function supportsVace(pipelineId: string): boolean {
  return VACE_CAPABLE_PIPELINES.has(pipelineId);
}

export function validateStreamParams(params: Partial<ScopeStreamParams>): string[] {
  const errors: string[] = [];

  if (params.pipeline_ids) {
    for (const pid of params.pipeline_ids) {
      if (!isValidPipeline(pid)) {
        errors.push(`Unknown pipeline: "${pid}". Available: ${[...VALID_PIPELINES].join(", ")}`);
      }
    }
  }

  if (params.noise_scale !== undefined) {
    if (params.noise_scale < 0 || params.noise_scale > 1) {
      errors.push("noise_scale must be 0.0-1.0");
    }
  }

  if (params.kv_cache_attention_bias !== undefined) {
    if (params.kv_cache_attention_bias < 0.01 || params.kv_cache_attention_bias > 1) {
      errors.push("kv_cache_attention_bias must be 0.01-1.0");
    }
  }

  if (params.vace_context_scale !== undefined) {
    if (params.vace_context_scale < 0 || params.vace_context_scale > 2) {
      errors.push("vace_context_scale must be 0.0-2.0");
    }
  }

  if (params.lora_path && params.pipeline_ids) {
    for (const pid of params.pipeline_ids) {
      if (!supportsLora(pid)) {
        errors.push(`Pipeline "${pid}" does not support LoRA`);
      }
    }
  }

  if (params.vace_enabled && params.pipeline_ids) {
    for (const pid of params.pipeline_ids) {
      if (!supportsVace(pid)) {
        errors.push(`Pipeline "${pid}" does not support VACE`);
      }
    }
  }

  if (params.graph) {
    const nodeIds = new Set(params.graph.nodes.map((n) => n.id));
    const hasSink = params.graph.nodes.some((n) => n.type === "sink");
    if (!hasSink) errors.push("Graph must have at least one sink node");

    for (const edge of params.graph.edges) {
      if (!nodeIds.has(edge.from)) errors.push(`Edge references unknown node: "${edge.from}"`);
      if (!nodeIds.has(edge.to_node)) errors.push(`Edge references unknown node: "${edge.to_node}"`);
    }

    for (const node of params.graph.nodes) {
      if (node.type === "pipeline" && !node.pipeline_id) {
        errors.push(`Pipeline node "${node.id}" must have pipeline_id`);
      }
    }
  }

  return errors;
}

/** Get a preset by ID */
export function getPreset(id: string): ScopePreset | undefined {
  return SCOPE_PRESETS.find((p) => p.id === id);
}

/** List all preset IDs */
export function listPresets(): string[] {
  return SCOPE_PRESETS.map((p) => p.id);
}
