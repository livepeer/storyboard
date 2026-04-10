/**
 * Pre-built Scope graph templates for common LV2V use cases.
 *
 * Each template produces a valid ScopeGraphConfig that can be sent directly
 * to the SDK /stream/start endpoint. The SDK passes it through to the fal
 * runner which validates against Scope's graph_schema.py.
 *
 * Edge format: from/from_port/to_node/to_port/kind (NOT source/target).
 */

import type { ScopeGraphConfig } from "./scope-params";

export interface GraphTemplate {
  id: string;
  name: string;
  description: string;
  /** Pipeline IDs required by this template */
  pipelines: string[];
  /** Whether this template needs a video input source */
  needsInput: boolean;
  /** Build the graph config. pipelineId overrides the main pipeline. */
  build: (pipelineId?: string) => ScopeGraphConfig;
}

// ---------------------------------------------------------------------------
// Template builders
// ---------------------------------------------------------------------------

function simpleLv2v(pipelineId = "longlive"): ScopeGraphConfig {
  return {
    nodes: [
      { id: "input", type: "source", source_mode: "video" },
      { id: pipelineId, type: "pipeline", pipeline_id: pipelineId },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "input", from_port: "video", to_node: pipelineId, to_port: "video", kind: "stream" },
      { from: pipelineId, from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

function depthGuided(pipelineId = "longlive"): ScopeGraphConfig {
  return {
    nodes: [
      { id: "input", type: "source", source_mode: "video" },
      { id: "depth", type: "pipeline", pipeline_id: "video_depth_anything" },
      { id: pipelineId, type: "pipeline", pipeline_id: pipelineId },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "input", from_port: "video", to_node: "depth", to_port: "video", kind: "stream" },
      { from: "depth", from_port: "video", to_node: pipelineId, to_port: "vace_input_frames", kind: "stream" },
      { from: "input", from_port: "video", to_node: pipelineId, to_port: "video", kind: "stream" },
      { from: pipelineId, from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

function scribbleGuided(pipelineId = "longlive"): ScopeGraphConfig {
  return {
    nodes: [
      { id: "input", type: "source", source_mode: "video" },
      { id: "scribble", type: "pipeline", pipeline_id: "scribble" },
      { id: pipelineId, type: "pipeline", pipeline_id: pipelineId },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "input", from_port: "video", to_node: "scribble", to_port: "video", kind: "stream" },
      { from: "scribble", from_port: "video", to_node: pipelineId, to_port: "vace_input_frames", kind: "stream" },
      { from: "input", from_port: "video", to_node: pipelineId, to_port: "video", kind: "stream" },
      { from: pipelineId, from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

function interpolated(pipelineId = "longlive"): ScopeGraphConfig {
  return {
    nodes: [
      { id: "input", type: "source", source_mode: "video" },
      { id: pipelineId, type: "pipeline", pipeline_id: pipelineId },
      { id: "rife", type: "pipeline", pipeline_id: "rife" },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "input", from_port: "video", to_node: pipelineId, to_port: "video", kind: "stream" },
      { from: pipelineId, from_port: "video", to_node: "rife", to_port: "video", kind: "stream" },
      { from: "rife", from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

function textOnly(pipelineId = "longlive"): ScopeGraphConfig {
  return {
    nodes: [
      { id: pipelineId, type: "pipeline", pipeline_id: pipelineId },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: pipelineId, from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

function multiPipeline(pipelineA = "longlive", pipelineB = "rife"): ScopeGraphConfig {
  return {
    nodes: [
      { id: "input", type: "source", source_mode: "video" },
      { id: pipelineA, type: "pipeline", pipeline_id: pipelineA },
      { id: pipelineB, type: "pipeline", pipeline_id: pipelineB },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "input", from_port: "video", to_node: pipelineA, to_port: "video", kind: "stream" },
      { from: pipelineA, from_port: "video", to_node: pipelineB, to_port: "video", kind: "stream" },
      { from: pipelineB, from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    id: "simple-lv2v",
    name: "Simple LV2V",
    description: "Basic webcam/video transform through a single pipeline",
    pipelines: ["longlive"],
    needsInput: true,
    build: simpleLv2v,
  },
  {
    id: "depth-guided",
    name: "Depth-Guided",
    description: "Depth-preserving transform — extracts depth map, uses it to guide generation",
    pipelines: ["video_depth_anything", "longlive"],
    needsInput: true,
    build: depthGuided,
  },
  {
    id: "scribble-guided",
    name: "Scribble-Guided",
    description: "Edge-guided generation — extracts contours, uses them as structural guide",
    pipelines: ["scribble", "longlive"],
    needsInput: true,
    build: scribbleGuided,
  },
  {
    id: "interpolated",
    name: "Interpolated",
    description: "Smoother output with 2x frame interpolation via RIFE",
    pipelines: ["longlive", "rife"],
    needsInput: true,
    build: interpolated,
  },
  {
    id: "text-only",
    name: "Text-Only",
    description: "Pure text-to-video generation — no input source needed",
    pipelines: ["longlive"],
    needsInput: false,
    build: textOnly,
  },
  {
    id: "multi-pipeline",
    name: "Multi-Pipeline",
    description: "Chain two pipelines sequentially (default: longlive → rife)",
    pipelines: ["longlive", "rife"],
    needsInput: true,
    build: multiPipeline,
  },
];

/** Get a graph template by ID */
export function getGraphTemplate(id: string): GraphTemplate | undefined {
  return GRAPH_TEMPLATES.find((t) => t.id === id);
}

/** List all template IDs */
export function listGraphTemplates(): string[] {
  return GRAPH_TEMPLATES.map((t) => t.id);
}

/**
 * Build a graph from template ID, with optional pipeline override.
 * Falls back to simple-lv2v if template not found.
 */
export function buildGraph(templateId: string, pipelineId?: string): ScopeGraphConfig {
  const template = getGraphTemplate(templateId);
  if (!template) return simpleLv2v(pipelineId || "longlive");
  return template.build(pipelineId);
}

/**
 * Build the default linear graph (source→pipeline→sink).
 * This is what the SDK currently hardcodes — kept as the safe fallback.
 */
export function buildDefaultGraph(pipelineId = "longlive"): ScopeGraphConfig {
  return simpleLv2v(pipelineId);
}
