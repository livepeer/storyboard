export interface ScopeStreamState {
  status: "idle" | "connecting" | "warming" | "streaming" | "error";
  streamId: string | null;
  fps: number;
  framesReceived: number;
  error: string | null;
  /** Current warm-up phase label */
  phase: string | null;
}

export interface ScopeParams {
  prompts?: string;
  graph?: {
    nodes: Array<{ id: string; type: string; [k: string]: unknown }>;
    edges: Array<{ from: string; from_port: string; to_node: string; to_port: string; kind: string }>;
  };
  pipeline_ids?: string[];
  noise_scale?: number;
  denoising_step_list?: number[];
  kv_cache_attention_bias?: number;
  reset_cache?: boolean;
  vace_enabled?: boolean;
  vace_ref_images?: string[];
  vace_context_scale?: number;
  modulation?: Record<string, {
    enabled: boolean;
    shape?: string;
    rate?: string;
    depth?: number;
  }>;
  recording?: boolean;
  [key: string]: unknown;
}
