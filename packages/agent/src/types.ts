/**
 * Core type vocabulary used everywhere in @livepeer/agent.
 *
 * Kept deliberately small — anything that's used by exactly one
 * subsystem lives in that subsystem's own types file. Only types
 * that cross subsystem boundaries belong here.
 */

export type ArtifactId = string;
export type ToolCallId = string;
export type SessionId = string;
export type ProjectId = string;

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  tool_call_id?: ToolCallId;
  tool_name?: string;
  content: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: ToolCallId;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: ToolCallId;
  content: string;
  ok: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cached?: number;
}

export type Tier = 0 | 1 | 2 | 3;

export interface ConversationTurn {
  id: string;
  ts: number;
  message: Message;
  provider?: string;
  model?: string;
  tier?: Tier;
  usage?: TokenUsage;
}

/**
 * Final result returned by AgentRunner.run().
 * Also embedded in the terminal RunEvent { kind: "done" }.
 */
export interface RunResult {
  finalText: string;
  turns: ConversationTurn[];
  totalUsage: TokenUsage;
  iterations: number;
}

/**
 * Streaming event emitted by AgentRunner.runStream() as the tool-use
 * loop executes. Consumers (CLI, browser plugins) can render these
 * progressively instead of waiting for the final RunResult.
 */
export type RunEvent =
  | { kind: "text"; text: string }
  | { kind: "tool_call"; id: ToolCallId; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; id: ToolCallId; name: string; ok: boolean; content: string }
  | { kind: "turn_done"; turn: ConversationTurn }
  | { kind: "usage"; usage: TokenUsage }
  | { kind: "done"; result: RunResult }
  | { kind: "error"; error: string };
