// Interfaces
export type {
  Artifact, ArtifactEdge, Viewport, ArtifactStore,
} from "./interfaces/artifact-store";

// Stores
export { createArtifactStore, type ArtifactStoreOptions } from "./stores/create-artifact-store";
export { createChatStore } from "./stores/create-chat-store";
export { createProjectStore, type ProjectStoreOptions } from "./stores/create-project-store";
export { createGroupManager } from "./stores/create-group-manager";
export { createConversationContext, type WorkItem, type WorkItemType, type ConversationContextState } from "./stores/create-conversation-context";
export type {
  PipelineItem, Project, ProjectPipeline, ItemStatus, ProjectStatus,
} from "./interfaces/project-pipeline";
export type {
  MessageRole, ChatMessage, ChatBus,
} from "./interfaces/chat-bus";
export type {
  ArtifactGroup, GroupManager,
} from "./interfaces/group-manager";

// Routing
export { createCommandRouter, type CommandHandler, type CommandRouter } from "./routing/command-router";
export { createCapabilityResolver, type CapabilityResult, type CapabilityResolverConfig, type CapabilityResolver } from "./routing/capability-resolver";
export { extractFalError, isRecoverableFailure } from "./routing/fal-errors";
export { createIntentClassifier, type IntentRule, type IntentClassifier, type IntentContext } from "./routing/intent-classifier";
export { routeModel, getModelProfiles, registerModelProfile, recordModelLatency, getModelStats, type ModelProfile, type RouteRequest, type RouteResult } from "./routing/model-router";

// Streaming — Pipeline Registry & Recipes
export { createPipelineRegistry } from "./streaming/pipeline-registry";
export { BUILTIN_RECIPES, KNOWN_PIPELINES } from "./streaming/recipes";
export { buildSimpleGraph, buildTextOnlyGraph, buildPreprocessorGraph, buildPostprocessorGraph } from "./streaming/graph-builder";
export type { PipelineInfo, PipelineRegistry, StreamRecipe, RecipeGraph, RecipeGraphNode, RecipeGraphEdge } from "./streaming/types";

// Agent
export { createRequestContext, type RequestContext } from "./agent/request-context";
export { createRequestQueue, type RequestQueue, type ProcessFn } from "./agent/request-queue";
export { humanizeError, classifyError, isRecoverable, type AgentError } from "./agent/errors";
export { resolveStyle, buildPrefix, buildMotionPrefix, mergeWithEpisode, type StyleResolution, type CreativeContextLike, type SkillOverride } from "./agent/context-merger";
export { buildAttemptChain, executeWithFallback, type FallbackChains, type InferenceCall, type InferenceResult, type FallbackOptions } from "./routing/fallback-handler";
export { checkSceneGate, checkRegenerateGate, checkModelGate, configureGates, type GateCheck, type GateConfig } from "./agent/confirmation-gates";
export { ConfirmationCard, type ConfirmationRequest } from "./ui/ConfirmationCard";
export { PipelineTraceView } from "./ui/PipelineTrace";
export { createTrace, tracePhase, traceCompleted, traceError, finalizeTrace, formatTraceSummary, type PipelineTrace, type TraceEvent } from "./agent/trace";
export { canTransition, transition, fromLegacyStatus, toLegacyStatus, isActionable, isTerminal, stateLabel, type SceneState } from "./agent/scene-state-machine";
export { resolveSkills, wouldConflict, type SkillEntry, type SkillConflict, type ResolvedSkills } from "./routing/skill-resolver";
export { recordPositive, recordNegative, getTopPreferences, getPreferredModel, getPreferredStyle, buildPreferencePrefix, clearMemory, applyDecay, type CreativePreference } from "./agent/creative-memory";

// Utils
export { resizeImageForModel } from "./utils/resize-image";
export { mixVideoAudio, mixMedia, type MixOptions } from "./utils/media-mixer";

// UI Components
export { InfiniteBoard } from "./ui/InfiniteBoard";
export { ArtifactCard } from "./ui/ArtifactCard";
export { EdgeLayer } from "./ui/EdgeLayer";
export { ChatPanel } from "./ui/ChatPanel";
export { MessageBubble } from "./ui/MessageBubble";
export { ToolPill } from "./ui/ToolPill";
export { useStyledPrompt } from "./ui/StyledPrompt";
export { planRemix, detectRemixIntent, type RemixRequest, type RemixPlan, type RemixMode } from "./agent/visual-remix";
