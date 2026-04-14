import type { MemoryToolContext } from "../../../memory/types.js";

export const threadTool = {
  name: "memory.thread",
  description: "Get all artifacts and decisions related to a scope (project id, scene number, character name).",
  parameters: {
    type: "object",
    properties: { scope: { type: "string" } },
    required: ["scope"],
  },
  async execute(args: { scope: string }, ctx: MemoryToolContext): Promise<string> {
    const t = ctx.session.thread(args.scope);
    return JSON.stringify(
      {
        artifacts: t.artifacts.map((a) => ({ id: a.id, kind: a.kind, prompt: a.prompt.slice(0, 80) })),
        decisions: t.decisions.map((d) => ({ id: d.id, kind: d.kind, target: d.target_artifact_id })),
      },
      null,
      2,
    );
  },
};
