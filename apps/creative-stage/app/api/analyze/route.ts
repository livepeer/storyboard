/**
 * Image analysis API — analyzes an image via Gemini Vision and returns
 * style, palette, mood, setting, description as JSON.
 *
 * Keeps the GEMINI_API_KEY server-side.
 */
export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  const { imageBase64, mimeType } = await req.json() as {
    imageBase64: string;
    mimeType: string;
  };

  if (!imageBase64) {
    return Response.json({ ok: false, error: "imageBase64 required" }, { status: 400 });
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: 'Analyze this image. Reply JSON only: {"style":"artistic style","palette":"3-5 dominant colors","mood":"emotional tone","setting":"environment/location","description":"one sentence, under 40 words"}' },
              { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
        }),
      },
    );

    if (!resp.ok) {
      return Response.json({ ok: false, error: `Gemini ${resp.status}` });
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ ok: false, error: "No JSON in Gemini response" });
    }

    return Response.json({ ok: true, analysis: JSON.parse(jsonMatch[0]) });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message });
  }
}
