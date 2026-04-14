/**
 * Agent runner: tool-use loop. Consumes any LLMProvider via the
 * single LLMProvider interface. [INV-9]: zero provider-specific code
 * here; every behavior delta lives in the provider plugin.
 *
 * Phase 3.3: basic loop. Streaming, retry, and ContextVar
 * propagation land in 3.4-3.6.
 */

import type { LLMProvider, LLMRequest, ToolSchema } from "../providers/types.js";
import type { Message, ConversationTurn, ToolCall, ToolResult, Tier, TokenUsage, RunResult, RunEvent } from "../types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { WorkingMemoryStore } from "../memory/working.js";
import type { SessionMemoryStore } from "../memory/session.js";
import { retry } from "./retry.js";
import { compressOldToolResults } from "./compress.js";

export interface RunOptions {
  user: string;
  /** Maximum number of tool-use round-trips per user turn. */
  maxIterations?: number;
  /** Override default tier for this call. */
  tier?: Tier;
  /** Tool execution context — passed to each tool's execute(). */
  toolContext?: unknown;
}

// Re-export RunResult so existing imports (`import { RunResult } from "./runner"`) still work.
export type { RunResult } from "../types.js";

export class AgentRunner {
  constructor(
    private provider: LLMProvider,
    private registry: ToolRegistry,
    private working: WorkingMemoryStore,
    private session: SessionMemoryStore,
  ) {}

  /**
   * Streaming variant: yields RunEvent values as the tool-use loop
   * executes. Consumers (CLI, browser plugins) render progressively
   * instead of waiting for the final RunResult.
   *
   * The terminal event is always { kind: "done", result } unless an
   * unrecoverable error occurs, in which case { kind: "error", error }
   * is yielded and the generator terminates without "done".
   */
  async *runStream(options: RunOptions): AsyncGenerator<RunEvent> {
    const maxIter = options.maxIterations ?? 10;
    const tier = options.tier ?? 1;
    const toolContext = options.toolContext ?? {};
    const turns: ConversationTurn[] = [];
    const totalUsage: TokenUsage = { input: 0, output: 0, cached: 0 };

    // Build initial message list: system prompt from working memory + user message
    const wmMarshal = this.working.marshal();
    const messages: Message[] = [];
    if (wmMarshal.text.length > 0) {
      messages.push({ role: "system", content: wmMarshal.text });
    }
    messages.push({ role: "user", content: options.user });

    // Record user turn
    const userTurn: ConversationTurn = {
      id: `t_${Date.now()}_u`,
      ts: Date.now(),
      message: { role: "user", content: options.user },
    };
    turns.push(userTurn);
    this.working.addTurn(userTurn);
    this.session.recordTurn(userTurn);

    let finalText = "";
    let iter = 0;

    while (iter < maxIter) {
      iter++;
      const tools: ToolSchema[] = this.registry.schemas();
      const req: LLMRequest = {
        messages,
        tools,
        tier,
        cacheable_prefix_count: messages.length > 0 && messages[0].role === "system" ? 1 : 0,
      };

      // Compress old tool results before sending the request (Layer 3)
      req.messages = compressOldToolResults(req.messages);

      // Wrap provider call in retry (Layer 2 resilience)
      const stream = await retry(async () => this.provider.call(req));

      // Collect chunks from the provider stream, yielding events as we go
      let textBuf = "";
      const partialCalls = new Map<string, { name: string; argsStr: string }>();
      let usage: TokenUsage | undefined;

      for await (const chunk of stream) {
        switch (chunk.kind) {
          case "text":
            textBuf += chunk.text;
            yield { kind: "text", text: chunk.text };
            break;
          case "tool_call_start":
            partialCalls.set(chunk.id, { name: chunk.name, argsStr: "" });
            break;
          case "tool_call_args":
            partialCalls.get(chunk.id)!.argsStr += chunk.args_delta;
            break;
          case "tool_call_end": {
            // Args are complete — emit the assembled tool_call event
            const partial = partialCalls.get(chunk.id);
            if (partial) {
              let args: Record<string, unknown>;
              try {
                args = JSON.parse(partial.argsStr || "{}");
              } catch {
                args = {};
              }
              yield { kind: "tool_call", id: chunk.id, name: partial.name, args };
            }
            break;
          }
          case "usage":
            usage = chunk.usage;
            yield { kind: "usage", usage: chunk.usage };
            break;
          case "done":
            break;
          case "error":
            yield { kind: "error", error: `Provider error: ${chunk.error}` };
            return;
        }
      }

      if (usage) {
        totalUsage.input += usage.input;
        totalUsage.output += usage.output;
        totalUsage.cached = (totalUsage.cached ?? 0) + (usage.cached ?? 0);
      }

      const finalCalls: ToolCall[] = [];
      for (const [id, partial] of partialCalls) {
        try {
          finalCalls.push({ id, name: partial.name, args: JSON.parse(partial.argsStr || "{}") });
        } catch {
          finalCalls.push({ id, name: partial.name, args: {} });
        }
      }

      // Record assistant turn
      const assistantTurn: ConversationTurn = {
        id: `t_${Date.now()}_a${iter}`,
        ts: Date.now(),
        message: {
          role: "assistant",
          content: textBuf,
          tool_calls: finalCalls.length > 0 ? finalCalls : undefined,
        },
        provider: this.provider.name,
        tier,
        usage,
      };
      turns.push(assistantTurn);
      this.working.addTurn(assistantTurn);
      this.session.recordTurn(assistantTurn);
      messages.push(assistantTurn.message);

      yield { kind: "turn_done", turn: assistantTurn };

      if (finalCalls.length === 0) {
        // No more tool calls — we're done
        finalText = textBuf;
        break;
      }

      // Execute every tool call and append results
      for (const call of finalCalls) {
        const tool = this.registry.get(call.name);
        if (!tool) {
          const errResult: ToolResult = {
            tool_call_id: call.id,
            content: `Unknown tool: ${call.name}`,
            ok: false,
          };
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            tool_name: call.name,
            content: errResult.content,
          });
          this.session.recordToolCall(call, errResult);
          yield { kind: "tool_result", id: call.id, name: call.name, ok: false, content: errResult.content };
          continue;
        }
        try {
          const out = await tool.execute(call.args, toolContext);
          const result: ToolResult = { tool_call_id: call.id, content: out, ok: true };
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            tool_name: call.name,
            content: out,
          });
          this.session.recordToolCall(call, result);
          yield { kind: "tool_result", id: call.id, name: call.name, ok: true, content: out };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          const errResult: ToolResult = { tool_call_id: call.id, content: errMsg, ok: false };
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            tool_name: call.name,
            content: errMsg,
          });
          this.session.recordToolCall(call, errResult);
          yield { kind: "tool_result", id: call.id, name: call.name, ok: false, content: errMsg };
        }
      }
    }

    yield { kind: "done", result: { finalText, turns, totalUsage, iterations: iter } };
  }

  /**
   * One-shot variant: collects all runStream events and returns the
   * terminal RunResult. All existing callers continue to work unchanged.
   */
  async run(options: RunOptions): Promise<RunResult> {
    let finalResult: RunResult | undefined;
    for await (const event of this.runStream(options)) {
      if (event.kind === "done") {
        finalResult = event.result;
      }
      if (event.kind === "error") {
        throw new Error(event.error);
      }
    }
    if (!finalResult) {
      throw new Error("runStream ended without emitting 'done'");
    }
    return finalResult;
  }
}
