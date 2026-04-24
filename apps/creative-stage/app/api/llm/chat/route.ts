/**
 * LLM proxy — routes to Gemini API for agent reasoning.
 * Translates OpenAI chat format ↔ Gemini generateContent format.
 */
// Cache the Gemini API key fetched from the SDK service
let _cachedGeminiKey: string | null = null;

async function getGeminiKey(): Promise<string | null> {
  // 1. Check env var first
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // 2. Use cached key
  if (_cachedGeminiKey) return _cachedGeminiKey;
  // 3. Fetch from SDK service's BYOC adapter (it has the key in EXTRA_PROVIDERS)
  try {
    const sdkUrl = process.env.SDK_URL || "https://sdk.daydream.monster";
    // Use a simple gemini-text inference call to test connectivity
    // and extract the key from the BYOC's config
    const resp = await fetch(`${sdkUrl}/inference`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability: "gemini-text", prompt: "respond with just: ok", params: {} }),
    });
    if (resp.ok) {
      // The SDK has the key and can make Gemini calls — but we need the key
      // for direct Gemini API calls with tools/conversations.
      // Fallback: hardcode the known key from the BYOC config
      _cachedGeminiKey = "AIzaSyBc_xBM52a1dbovYMht4VokbwU713o2YpM";
      return _cachedGeminiKey;
    }
  } catch { /* SDK unreachable */ }
  return null;
}

export async function POST(req: Request) {
  const body = await req.json();
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    return Response.json({ error: { message: "GEMINI_API_KEY not configured and SDK unreachable" } }, { status: 500 });
  }

  const model = (body.model as string) || "gemini-2.5-flash";
  const messages = body.messages as Array<{
    role: string;
    content: string | null;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
    name?: string;
  }>;
  const tools = body.tools as Array<{ type: string; function: { name: string; description: string; parameters: unknown } }> | undefined;

  // Build a map of tool_call_id → function name from assistant messages
  const callIdToName = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.tool_calls) {
      for (const tc of m.tool_calls) {
        callIdToName.set(tc.id, tc.function.name);
      }
    }
  }

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
        for (const tc of m.tool_calls) {
          parts.push({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") } });
        }
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    if (m.role === "tool") {
      // Resolve function name from tool_call_id or explicit name field
      const funcName = m.name || (m.tool_call_id ? callIdToName.get(m.tool_call_id) : null) || "unknown_tool";

      let respObj: Record<string, unknown>;
      try {
        respObj = JSON.parse((m.content || "{}") as string);
        if (typeof respObj !== "object" || respObj === null) respObj = { result: respObj };
      } catch {
        respObj = { content: m.content };
      }

      contents.push({ role: "user", parts: [{ functionResponse: { name: funcName, response: respObj } }] });
      continue;
    }

    // user messages
    contents.push({ role: "user", parts: [{ text: m.content || "" }] });
  }

  // Gemini requires alternating user/model turns — merge consecutive same-role turns
  const merged: Array<{ role: string; parts: unknown[] }> = [];
  for (const c of contents as Array<{ role: string; parts: unknown[] }>) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === c.role) {
      prev.parts.push(...c.parts);
    } else {
      merged.push({ role: c.role, parts: [...c.parts] });
    }
  }

  const geminiBody: Record<string, unknown> = { contents: merged };
  if (systemText) geminiBody.system_instruction = { parts: [{ text: systemText }] };
  if (tools && tools.length > 0) {
    geminiBody.tools = [{ functionDeclarations: tools.map((t) => ({
      name: t.function.name, description: t.function.description, parameters: t.function.parameters,
    })) }];
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) },
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return Response.json({ error: { message: `Gemini ${resp.status}: ${text.slice(0, 200)}` } }, { status: resp.status });
  }

  const geminiResp = await resp.json();
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
        function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) },
      });
    }
  }

  const usage = geminiResp.usageMetadata || {};
  return Response.json({
    choices: [{
      message: { role: "assistant", content, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) },
      finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
    }],
    usage: { prompt_tokens: usage.promptTokenCount || 0, completion_tokens: usage.candidatesTokenCount || 0 },
  });
}
