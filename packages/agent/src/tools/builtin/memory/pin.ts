import type { MemoryToolContext } from "../../../memory/types.js";

export const pinTool = {
  name: "memory.pin",
  description: "Pin a fact into working memory so the agent remembers it for the rest of the session.",
  parameters: {
    type: "object",
    properties: { fact: { type: "string" } },
    required: ["fact"],
  },
  async execute(args: { fact: string }, ctx: MemoryToolContext): Promise<string> {
    const f = ctx.working.pin(args.fact);
    return `Pinned: ${f.id} - ${f.text}`;
  },
};
