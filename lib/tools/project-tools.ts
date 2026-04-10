import type { ToolDefinition } from "./types";
import { useProjectStore } from "@/lib/projects/store";
import { useCanvasStore } from "@/lib/canvas/store";
import { useSessionContext } from "@/lib/agents/session-context";
import { executeTool } from "./registry";
import type { Scene, StyleGuide } from "@/lib/projects/types";

/**
 * project_create — Create a project from a brief with scene breakdown.
 * The agent calls this after analyzing the user's creative brief.
 */
export const projectCreateTool: ToolDefinition = {
  name: "project_create",
  description:
    "Create a multi-scene project from a creative brief. Break the brief into scenes with prompts. The system auto-batches generation (max 5 per batch). Use this for storyboards, ad campaigns, or any multi-asset creative work.",
  parameters: {
    type: "object",
    properties: {
      brief: {
        type: "string",
        description: "The original creative brief from the user",
      },
      style_guide: {
        type: "object",
        description: "Visual style rules extracted from the brief",
        properties: {
          visual_style: { type: "string", description: "e.g. photorealistic CGI, watercolor, anime" },
          color_palette: { type: "string", description: "e.g. warm golden, cool blue, earth tones" },
          mood: { type: "string", description: "e.g. aspirational, intimate, dramatic" },
          prompt_prefix: { type: "string", description: "Style prefix injected into all scene prompts" },
          prompt_suffix: { type: "string", description: "Style suffix injected into all scene prompts" },
        },
      },
      scenes: {
        type: "array",
        description: "Scene breakdown. Keep each prompt under 40 words.",
        items: {
          type: "object",
          properties: {
            index: { type: "number", description: "Scene number (0-based)" },
            title: { type: "string", description: "Short scene title" },
            description: { type: "string", description: "What the scene shows" },
            prompt: { type: "string", description: "Concise generation prompt (under 40 words)" },
            media_type: { type: "string", enum: ["image", "video", "audio"], description: "Output type" },
            action: { type: "string", enum: ["generate", "animate", "tts"], description: "What to do" },
            depends_on: {
              type: "array",
              items: { type: "number" },
              description: "Scene indices this depends on (e.g. animate depends on image)",
            },
          },
          required: ["index", "title", "prompt", "action"],
        },
      },
    },
    required: ["brief", "scenes"],
  },
  execute: async (input) => {
    const brief = input.brief as string;
    const rawScenes = input.scenes as Array<Record<string, unknown>>;
    const rawStyle = input.style_guide as Record<string, string> | undefined;

    if (!brief || !rawScenes?.length) {
      return { success: false, error: "brief and scenes are required" };
    }

    const styleGuide: StyleGuide | undefined = rawStyle ? {
      visualStyle: rawStyle.visual_style || "",
      colorPalette: rawStyle.color_palette || "",
      mood: rawStyle.mood || "",
      promptPrefix: rawStyle.prompt_prefix || "",
      promptSuffix: rawStyle.prompt_suffix || "",
    } : undefined;

    const scenes = rawScenes.map((s, i) => ({
      index: (s.index as number) ?? i,
      title: (s.title as string) || `Scene ${i + 1}`,
      description: (s.description as string) || (s.prompt as string),
      prompt: s.prompt as string,
      mediaType: ((s.media_type as string) || "image") as Scene["mediaType"],
      action: ((s.action as string) || "generate") as Scene["action"],
      dependsOn: s.depends_on as number[] | undefined,
      sourceUrl: s.source_url as string | undefined,
    }));

    const project = useProjectStore.getState().createProject(brief, scenes, styleGuide);

    return {
      success: true,
      data: {
        project_id: project.id,
        total_scenes: project.scenes.length,
        batch_size: project.batchSize,
        batches_needed: Math.ceil(project.scenes.length / project.batchSize),
        message: `Project created with ${project.scenes.length} scenes. Call project_generate to start.`,
      },
    };
  },
};

/**
 * project_generate — Generate the next batch of pending scenes.
 * Auto-batches up to 5 scenes per create_media call.
 */
export const projectGenerateTool: ToolDefinition = {
  name: "project_generate",
  description:
    "Generate the next batch of pending scenes in a project. Auto-batches up to 5 at a time. Call repeatedly until all scenes are done.",
  parameters: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID from project_create" },
    },
    required: ["project_id"],
  },
  execute: async (input) => {
    const projectId = input.project_id as string;
    const store = useProjectStore.getState();
    const project = store.getProject(projectId);
    if (!project) return { success: false, error: `Project ${projectId} not found` };

    const batch = store.getNextBatch(projectId);
    if (batch.length === 0) {
      const allDone = store.isProjectComplete(projectId);
      return {
        success: true,
        data: {
          message: allDone ? "All scenes complete!" : "No pending scenes. Use project_iterate to redo rejected ones.",
          completed: project.scenes.filter((s) => s.status === "done").length,
          total: project.scenes.length,
        },
      };
    }

    store.updateProjectStatus(projectId, "generating");

    // Apply session context + project style guide to prompts.
    // Session context (from Creative DNA extraction) takes priority — it's richer.
    // Project style guide is the fallback.
    const sessionPrefix = useSessionContext.getState().buildPrefix();
    const stylePrefix = sessionPrefix || project.styleGuide?.promptPrefix || "";
    const styleSuffix = project.styleGuide?.promptSuffix || "";

    // Build create_media steps from the batch
    const steps = batch.map((scene) => ({
      action: scene.action,
      prompt: `${stylePrefix}${scene.prompt}${styleSuffix}`,
      title: scene.title,
      source_url: scene.sourceUrl,
    }));

    // Mark scenes as generating
    for (const scene of batch) {
      store.updateSceneStatus(projectId, scene.index, "generating");
    }

    // Execute via create_media tool
    const result = await executeTool("create_media", { steps });

    // Update scene statuses based on results
    const cardsCreated = (result.data as Record<string, unknown>)?.cards_created as string[] | undefined;
    const results = (result.data as Record<string, unknown>)?.results as Array<{ refId: string; error?: string }> | undefined;

    for (let i = 0; i < batch.length; i++) {
      const scene = batch[i];
      const refId = cardsCreated?.[i];
      const stepResult = results?.[i];
      const hasError = stepResult?.error;

      if (hasError) {
        store.updateSceneStatus(projectId, scene.index, "pending"); // retry later
      } else if (refId) {
        store.updateSceneStatus(projectId, scene.index, "done", refId);
      }
    }

    // Auto-layout completed scenes in timeline order on canvas
    const updatedProject = store.getProject(projectId)!;
    const doneRefIds = updatedProject.scenes
      .filter((s) => s.status === "done" && s.cardRefId)
      .sort((a, b) => a.index - b.index)
      .map((s) => s.cardRefId!);
    if (doneRefIds.length > 0) {
      useCanvasStore.getState().layoutTimeline(doneRefIds);
    }

    // Add narrative flow edges between consecutive scenes
    for (let i = 1; i < doneRefIds.length; i++) {
      const prevScene = updatedProject.scenes.find((s) => s.cardRefId === doneRefIds[i - 1]);
      const currScene = updatedProject.scenes.find((s) => s.cardRefId === doneRefIds[i]);
      if (prevScene && currScene) {
        useCanvasStore.getState().addEdge(doneRefIds[i - 1], doneRefIds[i], {
          capability: "narrative",
          action: "sequence",
          prompt: currScene.title,
        });
      }
    }

    // Check if more batches needed
    const remaining = store.getNextBatch(projectId);
    const completed = updatedProject.scenes.filter((s) => s.status === "done").length;

    if (remaining.length === 0 && store.isProjectComplete(projectId)) {
      store.updateProjectStatus(projectId, "reviewing");
    }

    return {
      success: result.success,
      data: {
        batch_size: batch.length,
        completed,
        total: project.scenes.length,
        remaining: remaining.length,
        message: remaining.length > 0
          ? `Batch done (${completed}/${project.scenes.length}). Call project_generate again for next batch.`
          : `All ${project.scenes.length} scenes generated! Ask the user for feedback.`,
      },
    };
  },
};

/**
 * project_iterate — Regenerate specific scenes based on feedback.
 */
export const projectIterateTool: ToolDefinition = {
  name: "project_iterate",
  description:
    "Regenerate specific scenes in a project based on user feedback. Only regenerates the specified scenes — preserves approved ones.",
  parameters: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID" },
      scene_indices: {
        type: "array",
        items: { type: "number" },
        description: "Which scenes to regenerate (0-based indices)",
      },
      feedback: { type: "string", description: "User feedback for the regeneration" },
    },
    required: ["project_id", "scene_indices", "feedback"],
  },
  execute: async (input) => {
    const projectId = input.project_id as string;
    const indices = input.scene_indices as number[];
    const feedback = input.feedback as string;
    const store = useProjectStore.getState();
    const project = store.getProject(projectId);
    if (!project) return { success: false, error: `Project ${projectId} not found` };

    // Mark scenes for regeneration
    store.rejectScenes(projectId, indices, feedback);

    // Regenerate by calling project_generate (which picks up "regenerating" scenes)
    const result = await projectGenerateTool.execute({ project_id: projectId });
    return result;
  },
};

/**
 * project_status — Get current project status and scene summary.
 */
export const projectStatusTool: ToolDefinition = {
  name: "project_status",
  description: "Get the current status of a project — which scenes are done, pending, or rejected.",
  parameters: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID. Omit to use active project." },
    },
  },
  execute: async (input) => {
    const store = useProjectStore.getState();
    const project = input.project_id
      ? store.getProject(input.project_id as string)
      : store.getActiveProject();
    if (!project) return { success: false, error: "No active project" };

    return {
      success: true,
      data: {
        project_id: project.id,
        status: project.status,
        brief: project.brief.slice(0, 100),
        scenes: project.scenes.map((s) => ({
          index: s.index,
          title: s.title,
          status: s.status,
          iterations: s.iterations,
          cardRefId: s.cardRefId,
        })),
        done: project.scenes.filter((s) => s.status === "done").length,
        total: project.scenes.length,
        feedback: project.feedback,
      },
    };
  },
};

export const projectTools: ToolDefinition[] = [
  projectCreateTool,
  projectGenerateTool,
  projectIterateTool,
  projectStatusTool,
];
