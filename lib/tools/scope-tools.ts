/**
 * Scope Domain Agent tools — expose Scope's full power to the agent system.
 *
 * These tools compose precise Scope configurations from agent instructions,
 * validate them client-side, then proxy through the SDK to the fal runner.
 * The agent skill (scope-agent.md) provides the domain knowledge; these
 * tools provide the execution surface.
 */

import type { ToolDefinition } from "./types";
import {
  validateStreamParams,
  getPreset,
  listPresets,
  SCOPE_PRESETS,
  type ScopeStreamParams,
} from "@/lib/stream/scope-params";
import {
  getGraphTemplate,
  buildGraph,
  buildDefaultGraph,
  GRAPH_TEMPLATES,
} from "@/lib/stream/scope-graphs";
import {
  startStream,
  controlStream,
  stopStream,
  getSession,
  getActiveSession,
} from "@/lib/stream/session";
import { useCanvasStore } from "@/lib/canvas/store";

/**
 * scope_start — Start an LV2V stream with full Scope configuration.
 */
export const scopeStartTool: ToolDefinition = {
  name: "scope_start",
  description:
    "Start a live video-to-video (LV2V) stream with advanced Scope configuration. Supports custom graphs, LoRA, VACE, presets, and all Scope parameters. Use this instead of stream_start for advanced LV2V.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Style prompt for the transformation",
      },
      graph_template: {
        type: "string",
        enum: ["simple-lv2v", "depth-guided", "scribble-guided", "interpolated", "text-only", "multi-pipeline"],
        description: "Graph template to use. Default: simple-lv2v",
      },
      preset: {
        type: "string",
        enum: ["dreamy", "cinematic", "anime", "abstract", "faithful", "painterly", "psychedelic"],
        description: "Named preset to apply (sets noise_scale, denoising, etc.)",
      },
      pipeline_id: {
        type: "string",
        description: "Override the main pipeline (default: longlive). Options: longlive, streamdiffusionv2, krea_realtime_video, memflow",
      },
      noise_scale: {
        type: "number",
        description: "Creativity level 0.0-1.0 (0=faithful, 1=maximum creativity)",
      },
      denoising_steps: {
        type: "array",
        items: { type: "number" },
        description: "Denoising schedule e.g. [1000,750,500,250]. More steps = higher quality, slower",
      },
      lora_url: {
        type: "string",
        description: "URL to a LoRA .safetensors file (HuggingFace, CivitAI, or direct URL)",
      },
      lora_scale: {
        type: "number",
        description: "LoRA strength 0.0-1.0 (default 1.0)",
      },
      vace_ref_images: {
        type: "array",
        items: { type: "string" },
        description: "Reference image URLs for VACE (style reference, structural guide)",
      },
      source: {
        type: "object",
        description: "Input source override. Default: webcam via CameraWidget",
        properties: {
          type: {
            type: "string",
            enum: ["webcam", "image", "video", "url"],
            description: "Source type",
          },
          url: {
            type: "string",
            description: "URL for image/video/url sources",
          },
          ref_id: {
            type: "string",
            description: "Canvas card refId to use as source",
          },
        },
      },
    },
    required: ["prompt"],
  },
  execute: async (input) => {
    const prompt = input.prompt as string;
    const templateId = (input.graph_template as string) || "simple-lv2v";
    const presetId = input.preset as string | undefined;
    const pipelineId = (input.pipeline_id as string) || "longlive";

    // Build graph from template
    const graph = buildGraph(templateId, pipelineId);

    // Start with preset params if specified
    const presetData = presetId ? getPreset(presetId) : undefined;
    const baseParams: Partial<ScopeStreamParams> = presetData?.params || {};

    // Build final prompt (preset prefix + user prompt)
    const finalPrompt = presetData?.prompt_prefix
      ? presetData.prompt_prefix + prompt
      : prompt;

    // Merge user overrides
    const params: Partial<ScopeStreamParams> = {
      ...baseParams,
      pipeline_ids: [pipelineId],
      prompts: finalPrompt,
      graph,
    };

    if (input.noise_scale !== undefined) params.noise_scale = input.noise_scale as number;
    if (input.denoising_steps) params.denoising_steps = input.denoising_steps as number[];
    if (input.lora_url) {
      params.lora_path = input.lora_url as string;
      params.lora_merge_strategy = "permanent_merge";
    }
    if (input.lora_scale !== undefined) {
      params.lora_scales = [{ adapter_name: "default", scale: input.lora_scale as number }];
    }
    if (input.vace_ref_images) {
      params.vace_enabled = true;
      params.vace_ref_images = input.vace_ref_images as string[];
      params.vace_context_scale = 1.5;
    }

    // Validate
    const errors = validateStreamParams(params);
    if (errors.length > 0) {
      return { success: false, error: `Invalid params: ${errors.join("; ")}` };
    }

    // Check if template needs input
    const template = getGraphTemplate(templateId);
    const needsInput = template?.needsInput ?? true;

    // Dispatch to CameraWidget for webcam source, or start directly for other sources
    const sourceType = (input.source as Record<string, unknown>)?.type as string | undefined;

    if (!sourceType || sourceType === "webcam") {
      // Webcam source — dispatch to CameraWidget which handles lifecycle
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lv2v-start", {
            detail: { prompt: finalPrompt, params, needsInput },
          })
        );
        return {
          success: true,
          data: {
            message: `Scope LV2V starting: template=${templateId}, pipeline=${pipelineId}${presetId ? ", preset=" + presetId : ""}`,
            graph_template: templateId,
            pipeline: pipelineId,
            preset: presetId,
          },
        };
      }
      return { success: false, error: "LV2V requires browser environment" };
    }

    // Non-webcam sources — create stream card and start
    const sourceUrl = (input.source as Record<string, unknown>)?.url as string
      || (input.source as Record<string, unknown>)?.ref_id as string;

    if (!sourceUrl) {
      return { success: false, error: "Source requires url or ref_id" };
    }

    // If ref_id, look up the card's URL
    let resolvedUrl = sourceUrl;
    if ((input.source as Record<string, unknown>)?.ref_id) {
      const card = useCanvasStore.getState().cards.find(
        (c) => c.refId === sourceUrl
      );
      if (!card?.url) {
        return { success: false, error: `Card "${sourceUrl}" not found or has no URL` };
      }
      resolvedUrl = card.url;

      // Create edge from source card to stream card
      const streamRefId = `scope_stream_${Date.now()}`;
      const streamCard = useCanvasStore.getState().addCard({
        type: "stream",
        title: `Stream: ${prompt.slice(0, 30)}`,
        refId: streamRefId,
      });
      useCanvasStore.getState().addEdge(sourceUrl, streamRefId, {
        capability: "scope-lv2v",
        prompt: prompt.slice(0, 50),
        action: "stream",
      });

      // Dispatch with source info for frame extraction
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lv2v-start", {
            detail: {
              prompt: finalPrompt,
              params,
              needsInput,
              source: { type: sourceType, url: resolvedUrl },
              streamCardId: streamCard.id,
            },
          })
        );
      }

      return {
        success: true,
        data: {
          message: `Scope LV2V starting from ${sourceType}: ${resolvedUrl.slice(0, 50)}`,
          stream_card: streamRefId,
          source_url: resolvedUrl,
        },
      };
    }

    // URL source — create both source and stream cards
    const canvas = useCanvasStore.getState();
    const sourceCard = canvas.addCard({
      type: sourceType === "image" ? "image" : "video",
      title: `Source: ${resolvedUrl.split("/").pop()?.slice(0, 30) || "media"}`,
      url: resolvedUrl,
    });
    const streamRefId = `scope_stream_${Date.now()}`;
    const streamCard = canvas.addCard({
      type: "stream",
      title: `Stream: ${prompt.slice(0, 30)}`,
      refId: streamRefId,
    });
    canvas.addEdge(sourceCard.refId, streamRefId, {
      capability: "scope-lv2v",
      prompt: prompt.slice(0, 50),
      action: "stream",
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("lv2v-start", {
          detail: {
            prompt: finalPrompt,
            params,
            needsInput,
            source: { type: sourceType, url: resolvedUrl },
            streamCardId: streamCard.id,
          },
        })
      );
    }

    return {
      success: true,
      data: {
        message: `Scope LV2V starting from ${sourceType}`,
        source_card: sourceCard.refId,
        stream_card: streamRefId,
      },
    };
  },
};

/**
 * scope_control — Update parameters on a running Scope stream.
 */
export const scopeControlTool: ToolDefinition = {
  name: "scope_control",
  description:
    "Update parameters on a running LV2V stream. Change prompt, noise, denoising, apply presets, update LoRA scale — all in real-time without stopping the stream.",
  parameters: {
    type: "object",
    properties: {
      stream_id: { type: "string", description: "Stream ID (auto-detects active stream if omitted)" },
      prompt: { type: "string", description: "New prompt" },
      preset: {
        type: "string",
        enum: ["dreamy", "cinematic", "anime", "abstract", "faithful", "painterly", "psychedelic"],
        description: "Apply a preset (overrides noise_scale, denoising, etc.)",
      },
      noise_scale: { type: "number", description: "Creativity 0.0-1.0" },
      kv_cache_attention_bias: { type: "number", description: "Responsiveness 0.01-1.0" },
      denoising_step_list: {
        type: "array",
        items: { type: "number" },
        description: "Denoising schedule",
      },
      reset_cache: { type: "boolean", description: "Flush cache for dramatic change" },
      lora_scale: { type: "number", description: "Adjust LoRA strength" },
      node_id: { type: "string", description: "Target specific pipeline node (for multi-pipeline graphs)" },
      transition: {
        type: "object",
        description: "Smooth transition to new prompt",
        properties: {
          target_prompts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                weight: { type: "number" },
              },
            },
          },
          num_steps: { type: "number" },
        },
      },
    },
  },
  execute: async (input) => {
    const session = input.stream_id
      ? getSession(input.stream_id as string)
      : getActiveSession();

    if (!session) {
      return {
        success: false,
        error: "No active LV2V stream. Start one with scope_start first.",
      };
    }

    // Build control params
    const controlParams: Record<string, unknown> = {};

    // Apply preset first (can be overridden by explicit params)
    if (input.preset) {
      const preset = getPreset(input.preset as string);
      if (preset) {
        Object.assign(controlParams, preset.params);
        if (preset.prompt_prefix && input.prompt) {
          input.prompt = preset.prompt_prefix + (input.prompt as string);
        }
      }
    }

    // Apply explicit overrides
    if (input.noise_scale !== undefined) controlParams.noise_scale = input.noise_scale;
    if (input.kv_cache_attention_bias !== undefined) controlParams.kv_cache_attention_bias = input.kv_cache_attention_bias;
    if (input.denoising_step_list) controlParams.denoising_step_list = input.denoising_step_list;
    if (input.reset_cache) controlParams.reset_cache = true;
    if (input.node_id) controlParams.node_id = input.node_id;
    if (input.transition) controlParams.transition = input.transition;
    if (input.lora_scale !== undefined) {
      controlParams.lora_scales = [{ adapter_name: "default", scale: input.lora_scale }];
    }

    await controlStream(
      session,
      (input.prompt as string) || "",
      controlParams
    );

    const applied = Object.keys(controlParams);
    if (input.prompt) applied.push("prompt");

    return {
      success: true,
      data: {
        stream_id: session.streamId,
        applied,
        message: `Updated: ${applied.join(", ")}`,
      },
    };
  },
};

/**
 * scope_stop — Stop a Scope stream.
 */
export const scopeStopTool: ToolDefinition = {
  name: "scope_stop",
  description: "Stop an active LV2V stream.",
  parameters: {
    type: "object",
    properties: {
      stream_id: { type: "string", description: "Stream ID (auto-detects if omitted)" },
    },
  },
  execute: async (input) => {
    const session = input.stream_id
      ? getSession(input.stream_id as string)
      : getActiveSession();

    if (!session) {
      return { success: false, error: "No active LV2V stream to stop." };
    }

    await stopStream(session);
    return { success: true, data: { stopped: session.streamId } };
  },
};

/**
 * scope_preset — List or apply a named preset.
 */
export const scopePresetTool: ToolDefinition = {
  name: "scope_preset",
  description:
    "List available Scope presets or get details on a specific preset. Presets bundle noise_scale, denoising, and prompt prefixes for common styles.",
  parameters: {
    type: "object",
    properties: {
      preset_id: { type: "string", description: "Preset ID to get details. Omit to list all." },
    },
  },
  execute: async (input) => {
    if (input.preset_id) {
      const preset = getPreset(input.preset_id as string);
      if (!preset) {
        return { success: false, error: `Preset "${input.preset_id}" not found. Available: ${listPresets().join(", ")}` };
      }
      return { success: true, data: preset };
    }
    return {
      success: true,
      data: {
        presets: SCOPE_PRESETS.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        })),
      },
    };
  },
};

/**
 * scope_graph — List or build graph templates.
 */
export const scopeGraphTool: ToolDefinition = {
  name: "scope_graph",
  description:
    "List available Scope graph templates or build a specific graph config. Templates define pipeline chains for different LV2V modes.",
  parameters: {
    type: "object",
    properties: {
      template_id: { type: "string", description: "Template ID to build. Omit to list all." },
      pipeline_id: { type: "string", description: "Override main pipeline in the template" },
    },
  },
  execute: async (input) => {
    if (input.template_id) {
      const template = getGraphTemplate(input.template_id as string);
      if (!template) {
        return {
          success: false,
          error: `Template "${input.template_id}" not found. Available: ${GRAPH_TEMPLATES.map((t) => t.id).join(", ")}`,
        };
      }
      const graph = template.build(input.pipeline_id as string);
      return {
        success: true,
        data: {
          template: { id: template.id, name: template.name, description: template.description },
          graph,
        },
      };
    }
    return {
      success: true,
      data: {
        templates: GRAPH_TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          pipelines: t.pipelines,
          needs_input: t.needsInput,
        })),
      },
    };
  },
};

/**
 * scope_status — Get current stream status and active parameters.
 */
export const scopeStatusTool: ToolDefinition = {
  name: "scope_status",
  description: "Get the status of the active LV2V stream — FPS, frames published/received, current state.",
  parameters: {
    type: "object",
    properties: {
      stream_id: { type: "string", description: "Stream ID (auto-detects if omitted)" },
    },
  },
  execute: async (input) => {
    const session = input.stream_id
      ? getSession(input.stream_id as string)
      : getActiveSession();

    if (!session) {
      return { success: false, error: "No active LV2V stream." };
    }

    return {
      success: true,
      data: {
        stream_id: session.streamId,
        stopped: session.stopped,
        frames_published: session.publishOk,
        frames_received: session.totalRecv,
        publish_errors: session.publishErr,
      },
    };
  },
};

/** All scope tools */
export const scopeTools: ToolDefinition[] = [
  scopeStartTool,
  scopeControlTool,
  scopeStopTool,
  scopePresetTool,
  scopeGraphTool,
  scopeStatusTool,
];
