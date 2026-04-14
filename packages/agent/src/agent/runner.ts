/**
 * Agent runner: tool-use loop. Consumes any LLMProvider via the
 * single LLMProvider interface. [INV-9]: zero provider-specific code
 * here; every behavior delta lives in the provider plugin.
 *
 * Phase 3.3: basic loop. Streaming, retry, and ContextVar
 * propagation land in 3.4-3.6.
 */

import type { LLMProvider, LLMRequest, ToolSchema } from "../providers/types.js";
import type { Message, ConversationTurn, ToolCall, ToolResult, Tier, TokenUsage } from "../types.js";
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

export interface RunResult {
  finalText: string;
  turns: ConversationTurn[];
  totalUsage: TokenUsage;
  iterations: number;
}

export class AgentRunner {
  constructor(
    private provider: LLMProvider,
    private registry: ToolRegistry,
    private working: WorkingMemoryStore,
    private session: SessionMemoryStore,
  ) {}

  async run(options: RunOptions): Promise<RunResult> {
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

      // Collect chunks from the provider stream
      let textBuf = "";
      const partialCalls = new Map<string, { name: string; argsStr: string }>();
      let usage: TokenUsage | undefined;

      for await (const chunk of stream) {
        switch (chunk.kind) {
          case "text":
            textBuf += chunk.text;
            break;
          case "tool_call_start":
            partialCalls.set(chunk.id, { name: chunk.name, argsStr: "" });
            break;
          case "tool_call_args":
            partialCalls.get(chunk.id)!.argsStr += chunk.args_delta;
            break;
          case "tool_call_end":
            // Args are complete; nothing to do here, finalization happens after stream ends
            break;
          case "usage":
            usage = chunk.usage;
            break;
          case "done":
            break;
          case "error":
            throw new Error(`Provider error: ${chunk.error}`);
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
        }
      }
    }

    return { finalText, turns, totalUsage, iterations: iter };
  }
}
