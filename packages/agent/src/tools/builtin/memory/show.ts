import type { MemoryToolContext } from "../../../memory/types.js";

export const showTool = {
  name: "memory.show",
  description: "Fetch a specific artifact or conversation turn by id.",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  async execute(args: { id: string }, ctx: MemoryToolContext): Promise<string> {
    const item = ctx.session.show(args.id);
    if (!item) return `No item with id ${args.id}`;
    return JSON.stringify(item, null, 2);
  },
};
