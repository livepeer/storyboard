/**
 * /api/llm/chat — Proxy for Livepeer LLM calls.
 *
 * Accepts OpenAI chat completions format, forwards to the SDK service
 * /llm/chat endpoint (which translates to the backend-specific format).
 *
 * Fallback: if the SDK doesn't have /llm/chat yet, translates to the
 * appropriate direct API call based on the model name:
 * - gemini-* → Gemini generateContent API
 * - claude-* → Anthropic messages API
 * - gpt-* → OpenAI chat completions API
 * - otherwise → SDK /inference with gemini-text capability
 */

export async function POST(req: Request) {
  const body = await req.json();
  const model = (body.model as string) || "gemini-2.5-flash";

  const sdkUrl = process.env.SDK_URL || "https://sdk.daydream.monster";
  const daydreamKey = process.env.DAYDREAM_API_KEY || "";

  // Try SDK /llm/chat first — routes through Livepeer infrastructure
  if (daydreamKey) {
    try {
      const sdkResp = await fetch(`${sdkUrl}/llm/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${daydreamKey}`,
        },
        body: JSON.stringify(body),
      });
      if (sdkResp.ok) {
        return new Response(sdkResp.body, {
          status: sdkResp.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      // SDK /llm/chat not available or error — fall through to direct API
      console.log(`[llm/chat] SDK /llm/chat returned ${sdkResp.status}, falling back to direct API`);
    } catch {
      // SDK unreachable — fall through
      console.log("[llm/chat] SDK /llm/chat unreachable, falling back to direct API");
    }
  }

  // Fallback: route based on model name to the appropriate direct API
  if (model.startsWith("gemini")) {
    return proxyToGemini(body, model);
  }
  if (model.startsWith("claude")) {
    return proxyToClaude(body, model);
  }
  if (model.startsWith("gpt")) {
    return proxyToOpenAI(body, model);
  }

  // Default: try SDK /inference with gemini-text capability
  return proxyToSDKInference(body, sdkUrl, daydreamKey);
}

// ── Gemini translation ──

async function proxyToGemini(body: Record<string, unknown>, model: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: { message: "GEMINI_API_KEY not configured" } }, { status: 500 });
  }

  const modelId = model || "gemini-2.5-flash";
  const messages = body.messages as Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }>;
  const tools = body.tools as Array<{ type: string; function: { name: string; description: string; parameters: unknown } }> | undefined;

  // Translate OpenAI → Gemini
  const contents: unknown[] = [];
  let systemText = "";

  for (const m of messages) {
    if (m.role === "system") {
      systemText += (systemText ? "\n" : "") + (m.content || "");
      continue;
    }
    if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>) {
          parts.push({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") } });
        }
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }
    if (m.role === "tool") {
      let responseObj: Record<string, unknown>;
      try {
        const parsed = JSON.parse(m.content || "{}");
        responseObj = typeof parsed === "object" && parsed !== null ? parsed : { result: parsed };
      } catch {
        responseObj = { content: m.content };
      }
      contents.push({ role: "user", parts: [{ functionResponse: { name: "", response: responseObj } }] });
      continue;
    }
    // user
    contents.push({ role: "user", parts: [{ text: m.content || "" }] });
  }

  const geminiBody: Record<string, unknown> = { contents };
  if (systemText) {
    geminiBody.system_instruction = { parts: [{ text: systemText }] };
  }
  if (tools && tools.length > 0) {
    geminiBody.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) },
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return Response.json({ error: { message: `Gemini ${resp.status}: ${text.slice(0, 200)}` } }, { status: resp.status });
  }

  const geminiResp = await resp.json();

  // Translate Gemini → OpenAI
  const candidate = geminiResp.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  let content: string | null = null;
  const toolCalls: unknown[] = [];

  for (const part of parts) {
    if (typeof part.text === "string") content = (content || "") + part.text;
    if (part.functionCall) {
      toolCalls.push({
        id: `call_${Math.random().toString(36).slice(2, 10)}`,
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {}),
        },
      });
    }
  }

  const usageMeta = geminiResp.usageMetadata || {};
  const oaiResp: Record<string, unknown> = {
    choices: [{
      message: {
        role: "assistant",
        content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
    }],
    usage: {
      prompt_tokens: usageMeta.promptTokenCount || 0,
      completion_tokens: usageMeta.candidatesTokenCount || 0,
    },
  };

  return Response.json(oaiResp);
}

// ── Claude translation (placeholder — needs ANTHROPIC_API_KEY) ──

async function proxyToClaude(body: Record<string, unknown>, model: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: { message: "ANTHROPIC_API_KEY not configured — use gemini model instead" } }, { status: 500 });
  }

  const messages = body.messages as Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }>;
  const tools = body.tools as Array<{ type: string; function: { name: string; description: string; parameters: unknown } }> | undefined;

  // Extract system message
  let system = "";
  const anthropicMessages: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") { system += (system ? "\n" : "") + (m.content || ""); continue; }
    if (m.role === "assistant" && m.tool_calls) {
      const blocks: unknown[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments || "{}") });
      }
      anthropicMessages.push({ role: "assistant", content: blocks });
    } else if (m.role === "tool") {
      anthropicMessages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id || "", content: m.content || "" }] });
    } else {
      anthropicMessages.push({ role: m.role, content: m.content || "" });
    }
  }

  const claudeTools = tools?.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-6",
      max_tokens: (body.max_tokens as number) || 4096,
      system,
      messages: anthropicMessages,
      ...(claudeTools && claudeTools.length > 0 ? { tools: claudeTools } : {}),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return Response.json({ error: { message: `Claude ${resp.status}: ${text.slice(0, 200)}` } }, { status: resp.status });
  }

  const claudeResp = await resp.json();

  // Translate Claude → OpenAI
  let content: string | null = null;
  const toolCalls: unknown[] = [];
  for (const block of claudeResp.content || []) {
    if (block.type === "text") content = (content || "") + block.text;
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input || {}) },
      });
    }
  }

  return Response.json({
    choices: [{
      message: { role: "assistant", content, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) },
      finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
    }],
    usage: {
      prompt_tokens: claudeResp.usage?.input_tokens || 0,
      completion_tokens: claudeResp.usage?.output_tokens || 0,
    },
  });
}

// ── OpenAI passthrough ──

async function proxyToOpenAI(body: Record<string, unknown>, model: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: { message: "OPENAI_API_KEY not configured — use gemini model instead" } }, { status: 500 });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, model: model || "gpt-4o" }),
  });

  return new Response(resp.body, { status: resp.status, headers: { "Content-Type": "application/json" } });
}

// ── SDK /inference fallback ──

async function proxyToSDKInference(body: Record<string, unknown>, sdkUrl: string, apiKey: string) {
  const messages = body.messages as Array<{ role: string; content: string }>;
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  const resp = await fetch(`${sdkUrl}/inference`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ capability: "gemini-text", prompt }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return Response.json({ error: { message: text.slice(0, 200) } }, { status: resp.status });
  }

  const result = await resp.json();
  const text = result.data?.text || result.text || "";

  return Response.json({
    choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: Math.ceil(text.length / 4) },
  });
}
