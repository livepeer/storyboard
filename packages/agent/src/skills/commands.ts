export interface SlashResult {
  output: string;
  effect?: { kind: "context_set" | "memory_pin" | "skill_apply"; payload: unknown };
}

export type SlashHandler = (args: string) => Promise<SlashResult>;

export class SlashRegistry {
  private handlers = new Map<string, SlashHandler>();

  register(name: string, h: SlashHandler): void {
    this.handlers.set(name, h);
  }

  async run(line: string): Promise<SlashResult | null> {
    if (!line.startsWith("/")) return null;
    const [cmd, ...rest] = line.slice(1).split(" ");
    const h = this.handlers.get(cmd);
    if (!h) return { output: `Unknown command: /${cmd}` };
    return h(rest.join(" "));
  }
}
