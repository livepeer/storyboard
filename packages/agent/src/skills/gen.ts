import { LLMProvider } from "../providers/types.js";
import { parseSkillFile } from "./loader.js";
import { Skill } from "./types.js";

const SYSTEM = `You generate a skill file as markdown with YAML frontmatter.
Output ONLY the file, no fences. Frontmatter MUST have name (kebab-case),
description (one line), prompt (≤600 chars, "Use this skill when ...").
Body is concise markdown reference.`;

export async function generateSkillFromDescription(
  provider: LLMProvider,
  description: string,
): Promise<Skill> {
  const stream = provider.call({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Generate a skill for: ${description}` },
    ],
    tools: [],
    tier: 2,
  });
  let raw = "";
  for await (const chunk of stream) {
    if (chunk.kind === "text") raw += chunk.text;
    if (chunk.kind === "error") throw new Error(chunk.error);
  }
  return parseSkillFile(raw, `<generated:${Date.now()}>.md`);
}
