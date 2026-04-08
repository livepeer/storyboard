import type { ToolDefinition } from "./types";
import {
  addStyleDNA,
  getStyleDNA,
  setActiveStyle,
  addRating,
  setPreference,
  getMemorySummary,
} from "@/lib/memory/store";

/**
 * memory_style — save or activate a style DNA entry.
 */
export const memoryStyleTool: ToolDefinition = {
  name: "memory_style",
  description:
    "Save a visual style (Style DNA) from a reference image or description. Use 'save' to store, 'activate' to apply to future generations, 'deactivate' to stop, 'list' to see saved styles.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["save", "activate", "deactivate", "list"],
        description: "What to do",
      },
      name: {
        type: "string",
        description: "Style name (for save/activate)",
      },
      description: {
        type: "string",
        description: "Brief description of the style (for save)",
      },
      prompt_prefix: {
        type: "string",
        description:
          "Prompt prefix to inject before all future prompts (for save). E.g. 'in Moebius illustration style, clean lines, muted colors'",
      },
      model_hint: {
        type: "string",
        description: "Preferred model for this style (e.g. 'recraft-v4')",
      },
      reference_url: {
        type: "string",
        description: "URL of the reference image",
      },
    },
    required: ["action"],
  },
  execute: async (input) => {
    const action = input.action as string;

    switch (action) {
      case "save": {
        if (!input.name || !input.prompt_prefix) {
          return {
            success: false,
            error: "name and prompt_prefix are required for save",
          };
        }
        const style = addStyleDNA({
          name: input.name as string,
          description: (input.description as string) || "",
          prompt_prefix: input.prompt_prefix as string,
          model_hint: input.model_hint as string | undefined,
          reference_url: input.reference_url as string | undefined,
        });
        return {
          success: true,
          data: {
            saved: style.name,
            message: `Style "${style.name}" saved. Use activate to apply it.`,
          },
        };
      }
      case "activate": {
        if (!input.name) {
          return { success: false, error: "name is required for activate" };
        }
        const styles = getStyleDNA();
        const found = styles.find((s) => s.name === input.name);
        if (!found) {
          return {
            success: false,
            error: `Style "${input.name}" not found. Available: ${styles.map((s) => s.name).join(", ")}`,
          };
        }
        setActiveStyle(input.name as string);
        return {
          success: true,
          data: {
            activated: found.name,
            prompt_prefix: found.prompt_prefix,
          },
        };
      }
      case "deactivate":
        setActiveStyle(null);
        return { success: true, data: { message: "Style deactivated" } };
      case "list": {
        const styles = getStyleDNA();
        return {
          success: true,
          data: {
            styles: styles.map((s) => ({
              name: s.name,
              description: s.description,
              prefix: s.prompt_prefix.slice(0, 40),
            })),
          },
        };
      }
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  },
};

/**
 * memory_rate — rate the quality of a generated result.
 */
export const memoryRateTool: ToolDefinition = {
  name: "memory_rate",
  description:
    "Rate the quality of a generated result (1-5 stars). Helps learn model preferences over time.",
  parameters: {
    type: "object",
    properties: {
      ref_id: { type: "string", description: "Card refId to rate" },
      capability: {
        type: "string",
        description: "Model/capability that produced this result",
      },
      prompt: {
        type: "string",
        description: "The prompt used (brief)",
      },
      rating: {
        type: "number",
        description: "Quality rating 1-5",
      },
    },
    required: ["ref_id", "rating"],
  },
  execute: async (input) => {
    const rating = Number(input.rating);
    if (rating < 1 || rating > 5) {
      return { success: false, error: "Rating must be 1-5" };
    }
    addRating({
      ref_id: input.ref_id as string,
      capability: (input.capability as string) || "unknown",
      prompt: (input.prompt as string) || "",
      rating,
    });
    return {
      success: true,
      data: { rated: input.ref_id, stars: rating },
    };
  },
};

/**
 * memory_preference — save a user preference.
 */
export const memoryPreferenceTool: ToolDefinition = {
  name: "memory_preference",
  description:
    "Save a user preference for future conversations. E.g. 'preferred_style: illustration', 'default_model: recraft-v4'.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Preference key" },
      value: { type: "string", description: "Preference value" },
    },
    required: ["key", "value"],
  },
  execute: async (input) => {
    setPreference(input.key as string, input.value as string);
    return {
      success: true,
      data: { saved: `${input.key} = ${input.value}` },
    };
  },
};

export const memoryTools: ToolDefinition[] = [
  memoryStyleTool,
  memoryRateTool,
  memoryPreferenceTool,
];
