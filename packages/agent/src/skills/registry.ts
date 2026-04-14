import { Skill } from "./types.js";

export class SkillRegistry {
  private skills = new Map<string, Skill>();

  add(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  list(): Skill[] {
    return [...this.skills.values()];
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getBody(name: string): string | undefined {
    return this.skills.get(name)?.body;
  }

  systemBlock(): string {
    if (this.skills.size === 0) return "";
    const lines = ["## Skills"];
    for (const s of this.skills.values()) {
      lines.push(`- **${s.name}**: ${s.prompt}`);
    }
    return lines.join("\n");
  }
}
