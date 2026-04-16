import type { MemoryToolContext } from "../../../memory/types.js";

export const recallTool = {
  name: "memory.recall",
  description: "Search the session's artifact and conversation history by keyword. Returns up to 10 matching items.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keyword or phrase to search for" },
    },
    required: ["query"],
  },
  async execute(args: { query: string }, ctx: MemoryToolContext): Promise<string> {
    const hits = ctx.session.recall(args.query, 10);
    if (hits.length === 0) return "No matches found.";
    return hits
      .map((h) => {
        if ("kind" in h && (h.kind === "image" || h.kind === "video" || h.kind === "audio" || h.kind === "stream")) {
          return `[artifact ${h.id}] ${h.kind}: ${h.prompt.slice(0, 100)}`;
        } else if ("message" in h) {
          return `[turn ${h.id}] ${h.message.role}: ${h.message.content.slice(0, 100)}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  },
};
