import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { Skill, SKILL_PROMPT_BUDGET } from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export function parseSkillFile(raw: string, path: string): Skill {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) throw new Error(`Skill ${path} missing frontmatter`);
  const [, fmRaw, body] = match;
  const fm = parseFrontmatter(fmRaw);
  const prompt = String(fm.prompt ?? "");
  if (prompt.length > SKILL_PROMPT_BUDGET) {
    throw new Error(
      `Skill ${path} prompt is ${prompt.length} chars; max ${SKILL_PROMPT_BUDGET} [INV-3]`,
    );
  }
  return {
    name: String(fm.name ?? basename(path, ".md")),
    description: String(fm.description ?? ""),
    prompt,
    body: body.trim(),
    path,
  };
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export function loadSkillDir(dir: string): Skill[] {
  const out: Skill[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...loadSkillDir(p));
    } else if (name.endsWith(".md")) {
      out.push(parseSkillFile(readFileSync(p, "utf8"), p));
    }
  }
  return out;
}
