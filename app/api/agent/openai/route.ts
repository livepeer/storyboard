export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { messages, tools, model } = await req.json();

  const body: Record<string, unknown> = {
    model: model || "gpt-4o",
    messages,
    tools,
    tool_choice: "auto",
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return Response.json(
      { error: `OpenAI API error ${resp.status}: ${text.slice(0, 200)}` },
      { status: resp.status }
    );
  }

  return new Response(resp.body, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}
