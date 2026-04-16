import type { MemoryToolContext } from "../../../memory/types.js";

export const summarizeTool = {
  name: "memory.summarize",
  description: "Get a one-line summary of the current session (turn count, artifact count, branch).",
  parameters: { type: "object", properties: {} },
  async execute(_args: Record<string, never>, ctx: MemoryToolContext): Promise<string> {
    return ctx.session.summarize();
  },
};
