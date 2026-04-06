import type { Card, CardType } from "@/lib/canvas/types";

// --- Agent Events (yielded by plugins as they execute) ---

export type AgentEventType =
  | "text"
  | "tool_call"
  | "tool_result"
  | "card_created"
  | "error"
  | "done";

export interface AgentEvent {
  type: AgentEventType;
  /** Human-readable text (for 'text' and 'error' events) */
  content?: string;
  /** Tool name (for 'tool_call' and 'tool_result' events) */
  name?: string;
  /** Tool input parameters (for 'tool_call' events) */
  input?: Record<string, unknown>;
  /** Tool result (for 'tool_result' events) */
  result?: unknown;
  /** Card/step reference ID (for 'card_created' events) */
  refId?: string;
}

// --- Canvas context passed to plugins ---

export interface CardSummary {
  id: string;
  refId: string;
  type: CardType;
  title: string;
  url?: string;
}

export interface CanvasContext {
  cards: CardSummary[];
  selectedCard?: string; // refId of selected/right-clicked card
  capabilities: CapabilitySummary[];
}

export interface CapabilitySummary {
  id: string;
  name?: string;
  type?: string;
}

// --- Config fields for settings panel ---

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  required?: boolean;
}

// --- Plugin interface ---

export interface AgentPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly configFields: ConfigField[];

  /**
   * Process a user message and yield events as the agent executes.
   * Implementations should yield events progressively (text, tool_call,
   * tool_result, card_created, error) and finish with a 'done' event.
   */
  sendMessage(
    text: string,
    context: CanvasContext
  ): AsyncGenerator<AgentEvent, void, undefined>;

  /**
   * Configure the plugin with key/value pairs from settings.
   */
  configure(config: Record<string, string>): void;

  /**
   * Stop any in-progress execution.
   */
  stop(): void;
}

// --- Legacy types (still used by built-in agent enrichment) ---

export interface AgentStep {
  id: string;
  type: "image" | "video" | "audio" | "music";
  prompt: string;
  capability: string;
  depends_on?: string;
  params?: Record<string, unknown>;
  title?: string;
}

export interface EnrichResponse {
  steps: AgentStep[];
  reasoning?: {
    intent?: string;
    narrative?: string;
  };
}
