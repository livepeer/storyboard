/**
 * LLM proxy — routes to Gemini API for agent reasoning.
 * Same pattern as storyboard's /api/llm/chat.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: { message: "GEMINI_API_KEY not configured" } }, { status: 500 });
  }

  const model = (body.model as string) || "gemini-2.5-flash";
  const messages = body.messages as Array<{ role: string; content: string | null; tool_calls?: unknown[] }>;
  const tools = body.tools as Array<{ type: string; function: { name: string; description: string; parameters: unknown } }> | undefined;

  // Translate OpenAI → Gemini
  const contents: unknown[] = [];
  let systemText = "";
  for (const m of messages) {
    if (m.role === "system") { systemText += (systemText ? "\n" : "") + (m.content || ""); continue; }
    if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls as Array<{ function: { name: string; arguments: string } }>) {
          parts.push({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") } });
        }
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }
    if (m.role === "tool") {
      const raw = m as Record<string, unknown>;
      let respObj: Record<string, unknown>;
      try { respObj = JSON.parse((m.content || "{}") as string); if (typeof respObj !== "object") respObj = { result: respObj }; }
      catch { respObj = { content: m.content }; }
      contents.push({ role: "user", parts: [{ functionResponse: { name: (raw.name as string) || "", response: respObj } }] });
      continue;
    }
    contents.push({ role: "user", parts: [{ text: m.content || "" }] });
  }

  const geminiBody: Record<string, unknown> = { contents };
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
