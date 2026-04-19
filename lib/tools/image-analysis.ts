/**
 * Image analysis via Gemini Vision — extracts style, characters,
 * setting, mood, palette from an image. Returns a CreativeContext
 * that can be applied to the session or displayed to the user.
 */

import type { CreativeContext } from "@/lib/agents/session-context";

const ANALYSIS_PROMPT = `Analyze this image/video frame and extract a creative brief. Return STRICT JSON only — no preamble, no markdown fences.

{
  "style": "visual technique and artistic style (e.g. 'photorealistic cinematic', 'Studio Ghibli watercolor', 'noir high-contrast')",
  "palette": "3-5 dominant colors (e.g. 'warm gold, deep navy, ivory white')",
  "characters": "describe any people/characters: age, clothing, pose, expression. If none, say 'none'",
  "setting": "environment/location (e.g. 'urban rooftop at sunset', 'enchanted forest clearing')",
  "mood": "emotional tone (e.g. 'serene, contemplative', 'energetic, joyful')",
  "description": "one-paragraph description of what's in the image, under 60 words"
}`;

export interface ImageAnalysis extends CreativeContext {
  description: string;
}

/**
 * Send an image URL to Gemini Vision for analysis.
 * Returns extracted creative context + description.
 */
export async function analyzeImage(imageUrl: string): Promise<
  | { ok: true; analysis: ImageAnalysis; tokens: { input: number; output: number } }
  | { ok: false; error: string }
> {
  // Fetch media as base64 for Gemini inline_data
  let base64: string;
  let mimeType: string;
  try {
    // For data: URLs, extract base64 directly without fetch
    if (imageUrl.startsWith("data:")) {
      const commaIdx = imageUrl.indexOf(",");
      if (commaIdx === -1) return { ok: false, error: "Invalid data URL" };
      mimeType = imageUrl.slice(5, imageUrl.indexOf(";")) || "image/jpeg";
      base64 = imageUrl.slice(commaIdx + 1);
    } else {
      const resp = await fetch(imageUrl);
      if (!resp.ok) return { ok: false, error: `Can't fetch media: HTTP ${resp.status}` };
      const blob = await resp.blob();
      mimeType = blob.type || "image/jpeg";
      if (blob.size > 15_000_000) {
        return { ok: false, error: "Media too large for analysis (>15MB). Try with an image instead." };
      }
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      base64 = btoa(binary);
    }
  } catch (e) {
    return { ok: false, error: `Media fetch failed: ${e instanceof Error ? e.message : "unknown"}` };
  }

  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: ANALYSIS_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `Gemini error ${resp.status}: ${text.slice(0, 100)}` };
    }

    const payload = await resp.json();
    const tokens = {
      input: payload.usageMetadata?.promptTokenCount || 0,
      output: payload.usageMetadata?.candidatesTokenCount || 0,
    };

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("") || "";

    if (!text) return { ok: false, error: "Gemini returned empty response" };

    // Parse JSON (tolerate code fences)
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      return { ok: false, error: "Response was not JSON" };
    }
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));

    const analysis: ImageAnalysis = {
      style: parsed.style || "",
      palette: parsed.palette || "",
      characters: parsed.characters || "",
      setting: parsed.setting || "",
      mood: parsed.mood || "",
      rules: "",
      description: parsed.description || "",
    };

    return { ok: true, analysis, tokens };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Analysis failed" };
  }
}
