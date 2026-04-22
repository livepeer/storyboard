import type { RecipeGraph, RecipeGraphNode, RecipeGraphEdge } from "./types";

/** Build a simple linear graph: source → pipeline → sink. */
export function buildSimpleGraph(pipelineId: string): RecipeGraph {
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

/** Build a text-only graph: pipeline → sink (no input source). */
export function buildTextOnlyGraph(pipelineId: string): RecipeGraph {
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

/** Build a preprocessor → pipeline graph: source → preprocessor → pipeline → sink. */
export function buildPreprocessorGraph(
  pipelineId: string,
  preprocessorId: string,
): RecipeGraph {
  return {
    nodes: [
      { id: "input", type: "source", source_mode: "video" },
      { id: preprocessorId, type: "pipeline", pipeline_id: preprocessorId },
      { id: pipelineId, type: "pipeline", pipeline_id: pipelineId },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "input", from_port: "video", to_node: preprocessorId, to_port: "video", kind: "stream" },
      // Preprocessor output feeds as VACE input to the main pipeline
      { from: preprocessorId, from_port: "video", to_node: pipelineId, to_port: "video", kind: "stream" },
      // Original input also feeds main pipeline for reference
      { from: "input", from_port: "video", to_node: pipelineId, to_port: "vace_input_frames", kind: "stream" },
      { from: pipelineId, from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

/** Build a pipeline → postprocessor graph: source → pipeline → postprocessor → sink. */
export function buildPostprocessorGraph(
  pipelineId: string,
  postprocessorId: string,
): RecipeGraph {
  return {
    nodes: [
      { id: "input", type: "source", source_mode: "video" },
      { id: pipelineId, type: "pipeline", pipeline_id: pipelineId },
      { id: postprocessorId, type: "pipeline", pipeline_id: postprocessorId },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "input", from_port: "video", to_node: pipelineId, to_port: "video", kind: "stream" },
      { from: pipelineId, from_port: "video", to_node: postprocessorId, to_port: "video", kind: "stream" },
      { from: postprocessorId, from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}
