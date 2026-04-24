export async function POST(req: Request) {
  // Env var first, then shared BYOC key (same key used by the inference adapter)
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyBc_xBM52a1dbovYMht4VokbwU713o2YpM";


  const { contents, tools, model, system_instruction } = await req.json();
  const modelId = model || "gemini-2.5-flash";

  const body: Record<string, unknown> = { contents };
  // Only include tools/toolConfig if tools are actually provided
  if (tools && Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
    body.toolConfig = {
      functionCallingConfig: { mode: "AUTO" },
    };
  }
  if (system_instruction) {
    body.system_instruction = system_instruction;
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return Response.json(
      { error: `Gemini API error ${resp.status}: ${text.slice(0, 200)}` },
      { status: resp.status }
    );
  }

  return new Response(resp.body, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}
