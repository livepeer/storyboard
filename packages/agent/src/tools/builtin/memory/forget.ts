import type { MemoryToolContext } from "../../../memory/types.js";

export const forgetTool = {
  name: "memory.forget",
  description: "Remove a pinned fact from working memory.",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  async execute(args: { id: string }, ctx: MemoryToolContext): Promise<string> {
    ctx.working.unpin(args.id);
    return `Forgotten: ${args.id}`;
  },
};
