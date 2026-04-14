import type { ToolRegistry } from "../registry.js";
import { createMediaTool } from "./create_media.js";
import { enrichPromptTool } from "./enrich_prompt.js";
import { extractScenesTool } from "./extract_scenes.js";
import { generateStoryboardTool } from "./generate_storyboard.js";
import { startStreamTool } from "./start_stream.js";
import { listCapabilitiesTool } from "./list_capabilities.js";
import { applySkillPackTool } from "./apply_skill_pack.js";
import { genSkillTool } from "./gen_skill.js";

import { recallTool } from "./memory/recall.js";
import { showTool } from "./memory/show.js";
import { threadTool } from "./memory/thread.js";
import { pinTool } from "./memory/pin.js";
import { forgetTool } from "./memory/forget.js";
import { summarizeTool } from "./memory/summarize.js";

/** The 8 curated tools exposed via MCP. [INV-7]: this list MUST be exactly 8. */
export const MCP_EXPOSED_TOOLS = [
  createMediaTool,
  enrichPromptTool,
  extractScenesTool,
  generateStoryboardTool,
  startStreamTool,
  listCapabilitiesTool,
  applySkillPackTool,
  genSkillTool,
];

/** Memory tools — internal, NOT exposed via MCP. */
export const MEMORY_TOOLS = [recallTool, showTool, threadTool, pinTool, forgetTool, summarizeTool];

export function registerBuiltinTools(registry: ToolRegistry): void {
  for (const t of MCP_EXPOSED_TOOLS) registry.register(t as any);
  for (const t of MEMORY_TOOLS) registry.register(t as any);
}
