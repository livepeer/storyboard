import type { ToolDefinition } from "./types";
import { useProjectStore } from "@/lib/projects/store";
import { useCanvasStore } from "@/lib/canvas/store";
import { useSessionContext } from "@/lib/agents/session-context";
import { executeTool } from "./registry";
import type { Scene, StyleGuide, VideoConsistency } from "@/lib/projects/types";
import { executeDAG, type DAGNode, checkSceneGate, checkRegenerateGate } from "@livepeer/creative-kit";

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
      is_video: {
        type: "boolean",
        description: "Set true when the brief signals a video/animated short",
      },
      video_consistency: {
        type: "object",
        description: "Locked prefix, color arc, character lock for cross-clip consistency",
        properties: {
          lockedPrefix: { type: "string" },
          colorArc: { type: "array", items: { type: "string" } },
          characterLock: { type: "string" },
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
            action: { type: "string", enum: ["generate", "animate", "tts", "video_keyframe"], description: "What to do" },
            visualLanguage: { type: "string" },
            cameraNotes: { type: "string" },
            score: { type: "string" },
            clipsPerScene: { type: "number" },
            beats: { type: "array", items: { type: "string" } },
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
    const projectId = project.id;

    // Apply video fields if provided
    if (input.is_video) {
      const projStore = useProjectStore.getState();
      const proj = projStore.getProject(projectId);
      if (proj) {
        proj.isVideo = true;
        if (input.video_consistency) {
          proj.videoConsistency = input.video_consistency as VideoConsistency;
        }
        // Save scene-level fields from input
        const inputScenes = (input.scenes as Array<Record<string, unknown>>) || [];
        for (let i = 0; i < proj.scenes.length; i++) {
          const inScene = inputScenes[i];
          if (!inScene) continue;
          if (inScene.visualLanguage) proj.scenes[i].visualLanguage = inScene.visualLanguage as string;
          if (inScene.cameraNotes) proj.scenes[i].cameraNotes = inScene.cameraNotes as string;
          if (inScene.score) proj.scenes[i].score = inScene.score as string;
          if (typeof inScene.clipsPerScene === "number") proj.scenes[i].clipsPerScene = inScene.clipsPerScene;
          if (Array.isArray(inScene.beats)) proj.scenes[i].beats = inScene.beats as string[];
          // Override action to video_keyframe
          if (inScene.action === "video_keyframe") {
            proj.scenes[i].action = "video_keyframe";
          }
        }
        // Trigger a state update so subscribers re-render
        useProjectStore.setState({ projects: [...useProjectStore.getState().projects] });
      }
    }

    // Bootstrap working memory with new project
    try {
      const { useWorkingMemory } = await import("@/lib/agents/working-memory");
      const mem = useWorkingMemory.getState();
      mem.syncFromProjectStore();
      mem.appendDigest(`Project created: ${scenes.length} scenes, style: ${styleGuide?.visualStyle || "unset"}`);
    } catch { /* non-critical */ }

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
    "Generate ALL pending scenes in a project in a single call. Internally batches up to 5 at a time and loops until every pending scene is done. Call this ONCE per project — do NOT call it multiple times.",
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

    // --- Confirmation gate: pause before large / regenerate jobs ---
    const existingCards = project.scenes.filter((s) => s.status === "done").length;
    const pendingCount = project.scenes.filter((s) => s.status === "pending" || s.status === "regenerating").length;
    const gate = existingCards > 0
      ? checkRegenerateGate(pendingCount, existingCards)
      : checkSceneGate(project.scenes.length, project.styleGuide?.visualStyle || "flux-dev", project.styleGuide?.visualStyle);

    if (gate) {
      try {
        await new Promise<void>((resolve, reject) => {
          // Fire a custom event — ChatPanel listens and shows a ConfirmationCard
          window.dispatchEvent(new CustomEvent("confirm-gate", {
            detail: { ...gate, onConfirm: resolve, onCancel: () => reject(new Error("Cancelled")) },
          }));
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Cancelled";
        return { success: false, data: { message: msg, cancelled: true } };
      }
    }

    // DAG-based parallel generation — runs independent scenes concurrently
    // (up to 4 at a time) and models dependencies (e.g. video_keyframe:
    // animate node waits for its keyframe image node).
    // Falls back to sequential batching if DAG build fails.
    let batchesRun = 0;
    let totalCardsCreated = 0;
    const aggregatedErrors: string[] = [];

    try {
      const dagStats = await runWithDAG(projectId);
      batchesRun = dagStats.nodesRun;
      totalCardsCreated = dagStats.cardsCreated;
      aggregatedErrors.push(...dagStats.errors);
    } catch (dagErr) {
      // Fallback: sequential batch loop (original behaviour)
      const MAX_BATCHES = 10;
      while (batchesRun < MAX_BATCHES) {
        const batchStarted = await runOneBatch(projectId);
        if (!batchStarted) break;
        batchesRun++;
        totalCardsCreated += batchStarted.cardsCreated;
        if (batchStarted.errors.length > 0) aggregatedErrors.push(...batchStarted.errors);
        const storeNow = useProjectStore.getState();
        const next = storeNow.getNextBatch(projectId);
        if (next.length === 0) break;
      }
    }

    // Post-loop: final summary
    const finalProject = useProjectStore.getState().getProject(projectId);
    if (!finalProject) return { success: false, error: "Project disappeared during generation" };
    const completed = finalProject.scenes.filter((s) => s.status === "done").length;
    const remaining = useProjectStore.getState().getNextBatch(projectId).length;

    if (remaining === 0 && useProjectStore.getState().isProjectComplete(projectId)) {
      useProjectStore.getState().updateProjectStatus(projectId, "reviewing");
    }

    // Sync working memory once at the end
    try {
      const { useWorkingMemory } = await import("@/lib/agents/working-memory");
      const mem = useWorkingMemory.getState();
      mem.recordAction({
        tool: "project_generate",
        summary: `${batchesRun} batch${batchesRun === 1 ? "" : "es"}, ${totalCardsCreated} cards`,
        outcome: `${completed}/${finalProject.scenes.length} scenes done, ${remaining} remaining`,
        success: aggregatedErrors.length === 0,
      });
      mem.syncFromProjectStore();
    } catch { /* non-critical */ }

    return {
      success: aggregatedErrors.length === 0,
      data: {
        batches_run: batchesRun,
        completed,
        total: finalProject.scenes.length,
        remaining,
        cards_created: totalCardsCreated,
        errors: aggregatedErrors.slice(0, 5),
        message: remaining === 0
          ? `All ${finalProject.scenes.length} scenes generated!`
          : `${completed}/${finalProject.scenes.length} scenes done, ${remaining} remaining${aggregatedErrors.length > 0 ? ` (${aggregatedErrors.length} errors)` : ""}`,
      },
    };
  },
};

/**
 * Run all pending scenes using a DAG for maximum parallelism.
 *
 * - Independent scenes run concurrently (up to 4 at a time).
 * - video_keyframe scenes get two nodes: keyframe-image → animate.
 *   The animate node starts as soon as its keyframe image completes,
 *   without waiting for the rest of the keyframes.
 */
async function runWithDAG(projectId: string): Promise<{ nodesRun: number; cardsCreated: number; errors: string[] }> {
  const store = useProjectStore.getState();
  const project = store.getProject(projectId);
  if (!project) throw new Error("Project not found");

  const pending = project.scenes.filter((s) => s.status === "pending" || s.status === "regenerating");
  if (pending.length === 0) return { nodesRun: 0, cardsCreated: 0, errors: [] };

  const sessionPrefix = useSessionContext.getState().buildPrefix();
  const stylePrefix = sessionPrefix || project.styleGuide?.promptPrefix || "";
  const styleSuffix = project.styleGuide?.promptSuffix || "";
  const consistency = project.videoConsistency;
  const lockedPrefix = consistency?.lockedPrefix || "";
  const characterLock = consistency?.characterLock || "";
  const colorArc = consistency?.colorArc || [];

  store.updateProjectStatus(projectId, "generating");

  type NodeResult = { refId?: string; error?: string };
  const nodes: DAGNode<NodeResult>[] = [];

  for (const scene of pending) {
    if (scene.action === "video_keyframe") {
      // Node 1: generate keyframe image
      const kfId = `kf-${scene.index}`;
      nodes.push({
        id: kfId,
        dependsOn: [],
        label: `${scene.title} (keyframe)`,
        execute: async () => {
          store.updateSceneStatus(projectId, scene.index, "generating");
          const colorPhrase = colorArc[scene.index] || "";
          const visLang = scene.visualLanguage || "";
          const kfPrompt = [lockedPrefix, scene.prompt, colorPhrase, visLang]
            .filter((s) => s.length > 0).join(" ").slice(0, 800);
          const result = await executeTool("create_media", {
            steps: [{ action: "generate", prompt: kfPrompt, title: `${scene.title} (keyframe)` }],
          });
          const cards = (result.data as Record<string, unknown>)?.cards_created as string[] | undefined;
          const results = (result.data as Record<string, unknown>)?.results as Array<{ refId?: string; error?: string }> | undefined;
          const refId = cards?.[0];
          const error = results?.[0]?.error;
          if (refId && !error) {
            // Write keyframeRefId + sourceUrl into project state
            const proj = useProjectStore.getState().getProject(projectId);
            if (proj) {
              const sceneObj = proj.scenes.find((s) => s.index === scene.index);
              if (sceneObj) {
                sceneObj.keyframeRefId = refId;
                try {
                  const card = useCanvasStore.getState().cards.find((c) => c.refId === refId);
                  if (card?.url) sceneObj.sourceUrl = card.url;
                } catch { /* canvas not available */ }
                if (scene.index === 0 && proj.videoConsistency && !proj.videoConsistency.styleAnchorRefId) {
                  proj.videoConsistency.styleAnchorRefId = refId;
                }
                useProjectStore.setState({ projects: [...useProjectStore.getState().projects] });
              }
            }
            // Keep scene "pending" — animate node will mark it done
            store.updateSceneStatus(projectId, scene.index, "pending");
            return { refId };
          }
          store.updateSceneStatus(projectId, scene.index, "pending");
          return { error: error || "No keyframe output" };
        },
      });

      // Node 2: animate the keyframe (depends on kf node)
      const vidId = `vid-${scene.index}`;
      nodes.push({
        id: vidId,
        dependsOn: [kfId],
        label: `${scene.title} (animate)`,
        execute: async () => {
          store.updateSceneStatus(projectId, scene.index, "generating");
          const clipCount = scene.clipsPerScene || 1;
          const beats = scene.beats || [scene.description];
          const steps = [];
          for (let c = 0; c < clipCount; c++) {
            const beat = beats[c] || beats[0] || scene.description;
            const motionPrompt = [characterLock, beat, scene.cameraNotes || ""]
              .filter((s) => s.length > 0).join(" ").slice(0, 500);
            // Refresh sourceUrl in case canvas updated after keyframe completed
            const freshProj = useProjectStore.getState().getProject(projectId);
            const freshScene = freshProj?.scenes.find((s) => s.index === scene.index);
            const sourceUrl = freshScene?.sourceUrl;
            steps.push({
              action: "animate",
              prompt: motionPrompt,
              title: `${scene.title} (clip ${c + 1}/${clipCount})`,
              source_url: sourceUrl,
            });
          }
          const result = await executeTool("create_media", { steps });
          const cards = (result.data as Record<string, unknown>)?.cards_created as string[] | undefined;
          const results = (result.data as Record<string, unknown>)?.results as Array<{ refId?: string; error?: string }> | undefined;
          const refId = cards?.[0];
          const error = results?.[0]?.error;
          if (refId && !error) {
            store.updateSceneStatus(projectId, scene.index, "done", refId);
            return { refId };
          }
          store.updateSceneStatus(projectId, scene.index, "pending");
          return { error: error || "No video output" };
        },
      });
    } else {
      // Regular non-video scene — no deps, runs in parallel with others
      nodes.push({
        id: `scene-${scene.index}`,
        dependsOn: (scene.dependsOn || []).map((i) => `scene-${i}`),
        label: scene.title,
        execute: async () => {
          store.updateSceneStatus(projectId, scene.index, "generating");
          const step = {
            action: scene.action,
            prompt: `${stylePrefix}${scene.prompt}${styleSuffix}`,
            title: scene.title,
            source_url: scene.sourceUrl as string | undefined,
          };
          const result = await executeTool("create_media", { steps: [step] });
          const cards = (result.data as Record<string, unknown>)?.cards_created as string[] | undefined;
          const results = (result.data as Record<string, unknown>)?.results as Array<{ refId?: string; error?: string }> | undefined;
          const refId = cards?.[0];
          const error = results?.[0]?.error;
          if (refId && !error) {
            store.updateSceneStatus(projectId, scene.index, "done", refId);
            return { refId };
          }
          store.updateSceneStatus(projectId, scene.index, "pending");
          return { error: error || "No output" };
        },
      });
    }
  }

  const dagResult = await executeDAG<NodeResult>(nodes, { concurrency: 4 });

  // Auto-layout after all done
  const updatedProject = useProjectStore.getState().getProject(projectId)!;
  const doneRefIds = updatedProject.scenes
    .filter((s) => s.status === "done" && s.cardRefId)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.cardRefId!);
  if (doneRefIds.length > 0) {
    try {
      const { organizeCanvas } = await import("@/lib/layout/agent");
      const positions = organizeCanvas();
      useCanvasStore.getState().applyLayout(positions);
    } catch { /* layout agent not available */ }
    for (let i = 1; i < doneRefIds.length; i++) {
      const prevScene = updatedProject.scenes.find((s) => s.cardRefId === doneRefIds[i - 1]);
      const currScene = updatedProject.scenes.find((s) => s.cardRefId === doneRefIds[i]);
      if (prevScene && currScene) {
        useCanvasStore.getState().addEdge(doneRefIds[i - 1], doneRefIds[i], {
          capability: "narrative", action: "sequence", prompt: currScene.title,
        });
      }
    }
  }

  const cardsCreated = [...dagResult.results.values()].filter((r) => r.refId).length;
  const errors = [...dagResult.errors.values()].map((e) => e.message);
  return { nodesRun: dagResult.executionOrder.length, cardsCreated, errors };
}

/**
 * Run one project_generate batch. Extracted so the top-level tool can
 * loop internally without multiplying LLM token costs. Returns null if
 * there was nothing to do.
 */
async function runOneBatch(projectId: string): Promise<{ success: boolean; batchSize: number; cardsCreated: number; errors: string[] } | null> {
  const store = useProjectStore.getState();
  const project = store.getProject(projectId);
  if (!project) return null;

  const batch = store.getNextBatch(projectId);
  if (batch.length === 0) {
    return null;
  }

  // Process this one batch — create_media for every pending scene.
  {
    store.updateProjectStatus(projectId, "generating");

    // Apply session context + project style guide to prompts.
    // Session context (from Creative DNA extraction) takes priority — it's richer.
    // Project style guide is the fallback.
    const sessionPrefix = useSessionContext.getState().buildPrefix();
    const stylePrefix = sessionPrefix || project.styleGuide?.promptPrefix || "";
    const styleSuffix = project.styleGuide?.promptSuffix || "";

    // Build create_media steps from the batch
    // For video_keyframe scenes: emit either a keyframe step (image) OR animate steps
    // depending on whether the scene already has a keyframeRefId
    const consistency = project.videoConsistency;
    const lockedPrefix = consistency?.lockedPrefix || "";
    const characterLock = consistency?.characterLock || "";
    const colorArc = consistency?.colorArc || [];

    // Track step → scene mapping so we can write keyframeRefId back after generation
    const stepMeta: Array<{ sceneIndex: number; isKeyframe: boolean }> = [];

    const steps: Array<{
      action: string;
      prompt: string;
      title: string;
      source_url?: string;
    }> = [];

    for (const scene of batch) {
      if (scene.action === "video_keyframe" && !scene.keyframeRefId) {
        // PHASE 1: Generate keyframe image
        const colorPhrase = colorArc[scene.index] || "";
        const visLang = scene.visualLanguage || "";
        const kfPrompt = [lockedPrefix, scene.prompt, colorPhrase, visLang]
          .filter((s) => s && s.length > 0)
          .join(" ")
          .slice(0, 800);
        stepMeta.push({ sceneIndex: scene.index, isKeyframe: true });
        steps.push({
          action: "generate",
          prompt: kfPrompt,
          title: `${scene.title} (keyframe)`,
        });
      } else if (scene.action === "video_keyframe" && scene.keyframeRefId) {
        // PHASE 2: Animate clips from the keyframe
        const clipCount = scene.clipsPerScene || 1;
        const beats = scene.beats || [scene.description];
        for (let c = 0; c < clipCount; c++) {
          const beat = beats[c] || beats[0] || scene.description;
          const motionPrompt = [characterLock, beat, scene.cameraNotes || ""]
            .filter((s) => s && s.length > 0)
            .join(" ")
            .slice(0, 500);
          stepMeta.push({ sceneIndex: scene.index, isKeyframe: false });
          steps.push({
            action: "animate",
            prompt: motionPrompt,
            title: `${scene.title} (clip ${c + 1}/${clipCount})`,
            source_url: scene.sourceUrl, // Set when keyframe was generated in previous batch
          });
        }
      } else {
        // Regular non-video scene
        stepMeta.push({ sceneIndex: scene.index, isKeyframe: false });
        steps.push({
          action: scene.action,
          prompt: `${stylePrefix}${scene.prompt}${styleSuffix}`,
          title: scene.title,
          source_url: scene.sourceUrl,
        });
      }
    }

    // Mark scenes as generating
    for (const scene of batch) {
      store.updateSceneStatus(projectId, scene.index, "generating");
    }

    // Execute via create_media tool
    const result = await executeTool("create_media", { steps });

    // Update scene statuses based on results
    const cardsCreated = (result.data as Record<string, unknown>)?.cards_created as string[] | undefined;
    const results = (result.data as Record<string, unknown>)?.results as Array<{ refId: string; error?: string }> | undefined;

    // Map step results back to scenes using stepMeta
    // Video scenes with keyframe phase stay "pending" for the next batch (animate phase)
    const sceneToStepResults = new Map<number, Array<{ refId?: string; error?: string; isKeyframe: boolean }>>();
    if (cardsCreated && results) {
      for (let i = 0; i < stepMeta.length; i++) {
        const meta = stepMeta[i];
        if (!sceneToStepResults.has(meta.sceneIndex)) {
          sceneToStepResults.set(meta.sceneIndex, []);
        }
        sceneToStepResults.get(meta.sceneIndex)!.push({
          refId: cardsCreated[i],
          error: results[i]?.error,
          isKeyframe: meta.isKeyframe,
        });
      }
    }

    for (const scene of batch) {
      const stepResults = sceneToStepResults.get(scene.index) || [];
      const hasError = stepResults.some((r) => r.error);

      if (hasError) {
        store.updateSceneStatus(projectId, scene.index, "pending");
        continue;
      }

      // Find keyframe step (if any)
      const keyframeResult = stepResults.find((r) => r.isKeyframe);
      if (keyframeResult?.refId) {
        // Phase 1 just completed: write keyframeRefId + sourceUrl, keep scene "pending" for animate phase
        const proj = store.getProject(projectId);
        if (proj) {
          const sceneObj = proj.scenes.find((s) => s.index === scene.index);
          if (sceneObj) {
            sceneObj.keyframeRefId = keyframeResult.refId;
            // Resolve URL from canvas store
            try {
              const { useCanvasStore } = await import("@/lib/canvas/store");
              const card = useCanvasStore.getState().cards.find((c) => c.refId === keyframeResult.refId);
              if (card?.url) sceneObj.sourceUrl = card.url;
            } catch { /* canvas not available */ }
            // First scene's keyframe becomes the style anchor
            if (scene.index === 0 && proj.videoConsistency && !proj.videoConsistency.styleAnchorRefId) {
              proj.videoConsistency.styleAnchorRefId = keyframeResult.refId;
            }
            // Trigger state update
            useProjectStore.setState({ projects: [...useProjectStore.getState().projects] });
          }
        }
        store.updateSceneStatus(projectId, scene.index, "pending"); // wait for animate phase
        continue;
      }

      // Phase 2 completed (or non-video scene): mark done with the first card refId
      const firstRefId = stepResults[0]?.refId;
      if (firstRefId) {
        store.updateSceneStatus(projectId, scene.index, "done", firstRefId);
      }
    }

    // Auto-layout completed scenes in timeline order on canvas
    const updatedProject = store.getProject(projectId)!;
    const doneRefIds = updatedProject.scenes
      .filter((s) => s.status === "done" && s.cardRefId)
      .sort((a, b) => a.index - b.index)
      .map((s) => s.cardRefId!);
    if (doneRefIds.length > 0) {
      try {
        const { organizeCanvas } = await import("@/lib/layout/agent");
        const positions = organizeCanvas();
        useCanvasStore.getState().applyLayout(positions);
      } catch { /* layout agent not available */ }
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

    // Return this batch's summary — the outer loop (project_generate
    // tool body) handles aggregation, working-memory sync, and the
    // final user-facing return message.
    const batchErrors: string[] = [];
    if (results) {
      for (const r of results) {
        if (r.error) batchErrors.push(r.error);
      }
    }
    return {
      success: result.success,
      batchSize: batch.length,
      cardsCreated: cardsCreated?.length ?? 0,
      errors: batchErrors,
    };
  }
}

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

    // Sync working memory
    const sceneIndices = indices;
    try {
      const { useWorkingMemory } = await import("@/lib/agents/working-memory");
      const mem = useWorkingMemory.getState();
      mem.recordAction({
        tool: "project_iterate",
        summary: `${sceneIndices.length} scenes re-generated`,
        outcome: result.success ? "iteration complete" : "iteration failed",
        success: result.success,
      });
      mem.syncFromProjectStore();
    } catch { /* non-critical */ }

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
