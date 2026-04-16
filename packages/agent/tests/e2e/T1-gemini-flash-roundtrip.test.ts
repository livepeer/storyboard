/**
 * T1 — Live Gemini Flash round-trip.
 *
 * Protected invariant: the GeminiProvider correctly speaks the live
 * Gemini API. If Google ships a breaking change to the streaming
 * format or the function-call schema, this test catches it.
 *
 * Cost: ~1 cent per run. Skipped if GEMINI_API_KEY is not set.
 */

import { describe, it, expect } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini.js";

const HAS_KEY = !!process.env.GEMINI_API_KEY;

describe.skipIf(!HAS_KEY)("T1 GeminiProvider live", () => {
  it("returns a real text response from gemini-2.5-flash", async () => {
    const provider = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY! });
    const chunks = [];
    for await (const c of provider.call({
      messages: [{ role: "user", content: "Reply with exactly the word 'pong' and nothing else." }],
      tools: [],
      tier: 1,
    })) {
      chunks.push(c);
    }
    const text = chunks
      .filter((c) => c.kind === "text")
      .map((c: any) => c.text)
      .join("");
    expect(text.toLowerCase()).toContain("pong");
    const usage = chunks.find((c) => c.kind === "usage");
    expect(usage).toBeDefined();
  }, 30000);

  it("emits a tool_call when given a function declaration", async () => {
    const provider = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY! });
    const chunks = [];
    for await (const c of provider.call({
      messages: [{ role: "user", content: "Call the get_weather tool for San Francisco." }],
      tools: [
        {
          name: "get_weather",
          description: "Get the current weather for a city",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      ],
      tier: 1,
    })) {
      chunks.push(c);
    }
    const callStart = chunks.find((c) => c.kind === "tool_call_start");
    expect(callStart).toBeDefined();
    if (callStart?.kind === "tool_call_start") {
      expect(callStart.name).toBe("get_weather");
    }
  }, 30000);
});
