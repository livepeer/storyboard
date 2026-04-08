import type { ToolDefinition } from "./types";
import { sdkFetch, runInference, listCapabilities } from "@/lib/sdk/client";
import { resolveCapability } from "@/lib/sdk/capabilities";
import {
  startStream,
  controlStream,
  stopStream,
  getSession,
} from "@/lib/stream/session";

/**
 * inference — run a model inference via the SDK service.
 */
export const inferenceTool: ToolDefinition = {
  name: "inference",
  description:
    "Run AI inference directly. Prefer create_media instead — it handles model selection automatically. Only use this if you need a specific model override.",
  parameters: {
    type: "object",
    properties: {
      capability: {
        type: "string",
        description: "Model capability ID. Invalid names are auto-corrected to the closest available model.",
      },
      prompt: {
        type: "string",
        description: "Text prompt for generation",
      },
      params: {
        type: "object",
        description:
          "Additional parameters (image_url, video_url, style, etc.)",
      },
    },
    required: ["capability", "prompt"],
  },
  execute: async (input) => {
    const requested = input.capability as string;
    const resolved = resolveCapability(requested);
    if (!resolved) {
      return {
        success: false,
        error: `Cannot resolve capability "${requested}" to any available model.`,
      };
    }
    const result = await runInference({
      capability: resolved,
      prompt: input.prompt as string,
      params: (input.params as Record<string, unknown>) ?? {},
    });
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result };
  },
};

/**
 * stream_start — start an LV2V streaming session.
 */
export const streamStartTool: ToolDefinition = {
  name: "stream_start",
  description: "Start a live video-to-video (LV2V) streaming session.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Initial prompt for the LV2V stream",
      },
    },
    required: ["prompt"],
  },
  execute: async (input) => {
    const session = await startStream(input.prompt as string);
    return {
      success: true,
      data: { stream_id: session.streamId },
    };
  },
};

/**
 * stream_control — send a control command to an active LV2V stream.
 */
export const streamControlTool: ToolDefinition = {
  name: "stream_control",
  description:
    "Send a control command to an active LV2V stream. Change prompt, noise_scale, denoising steps, transitions, etc. Load the 'live-director' skill for parameter mapping.",
  parameters: {
    type: "object",
    properties: {
      stream_id: { type: "string", description: "Stream session ID" },
      prompt: { type: "string", description: "New style prompt for the stream" },
      noise_scale: { type: "number", description: "Creativity level 0.0-1.0 (lower=faithful, higher=creative)" },
      kv_cache_attention_bias: { type: "number", description: "Responsiveness 0.01-1.0 (lower=responsive, higher=stable)" },
      reset_cache: { type: "boolean", description: "Flush cache for dramatic style change" },
      denoising_step_list: {
        type: "array",
        items: { type: "number" },
        description: "Denoising steps e.g. [1000,750,500,250]. More=quality, fewer=speed",
      },
      transition: {
        type: "object",
        description: "Smooth style transition",
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
          num_steps: { type: "number", description: "Transition steps (default 8)" },
          temporal_interpolation_method: { type: "string", description: "slerp or lerp" },
        },
      },
    },
    required: ["stream_id"],
  },
  execute: async (input) => {
    const session = getSession(input.stream_id as string);
    if (!session) {
      return {
        success: false,
        error: `Stream ${input.stream_id} not found`,
      };
    }
    const { stream_id, prompt, ...params } = input;
    await controlStream(
      session,
      (prompt as string) || "",
      params as Record<string, unknown>
    );
    return { success: true, data: { stream_id: session.streamId, applied: Object.keys(input).filter(k => k !== "stream_id") } };
  },
};

/**
 * stream_stop — stop an active LV2V stream.
 */
export const streamStopTool: ToolDefinition = {
  name: "stream_stop",
  description: "Stop an active LV2V streaming session.",
  parameters: {
    type: "object",
    properties: {
      stream_id: { type: "string", description: "Stream session ID" },
    },
    required: ["stream_id"],
  },
  execute: async (input) => {
    const session = getSession(input.stream_id as string);
    if (!session) {
      return {
        success: false,
        error: `Stream ${input.stream_id} not found`,
      };
    }
    await stopStream(session);
    return { success: true, data: { stopped: true } };
  },
};

/**
 * capabilities — list available model capabilities from the SDK.
 */
export const capabilitiesTool: ToolDefinition = {
  name: "capabilities",
  description:
    "List available AI model capabilities from the SDK service.",
  parameters: {
    type: "object",
    properties: {},
  },
  execute: async () => {
    const caps = await listCapabilities();
    return { success: true, data: caps };
  },
};

/**
 * train_lora — start a LoRA training job via the SDK.
 */
export const trainLoraTool: ToolDefinition = {
  name: "train_lora",
  description: "Start a LoRA fine-tuning training job.",
  parameters: {
    type: "object",
    properties: {
      zip_url: {
        type: "string",
        description: "URL to a ZIP file of training images",
      },
      trigger_word: {
        type: "string",
        description: "Trigger word for the LoRA",
      },
      steps: {
        type: "number",
        description: "Number of training steps (default 1000)",
        default: 1000,
      },
    },
    required: ["zip_url"],
  },
  execute: async (input) => {
    const result = await sdkFetch<Record<string, unknown>>("/train", {
      zip_url: input.zip_url,
      trigger_word: input.trigger_word ?? "TOK",
      steps: input.steps ?? 1000,
    });
    return { success: true, data: result };
  },
};

/** All SDK tools */
export const sdkTools: ToolDefinition[] = [
  inferenceTool,
  streamStartTool,
  streamControlTool,
  streamStopTool,
  capabilitiesTool,
  trainLoraTool,
];
