export interface CommandHandler {
  name: string;
  aliases?: string[];
  description: string;
  execute(args: string): Promise<string>;
}

export interface CommandRouter {
  register(handler: CommandHandler): void;
  execute(input: string): Promise<string | null>; // null = not a command
  generateHelp(): string;
}

export function createCommandRouter(): CommandRouter {
  const handlers = new Map<string, CommandHandler>();

  function register(handler: CommandHandler): void {
    handlers.set(handler.name, handler);
    if (handler.aliases) {
      for (const alias of handler.aliases) {
        handlers.set(alias, handler);
      }
    }
  }

  function generateHelp(): string {
    const seen = new Set<string>();
    const lines: string[] = ["Available commands:"];
    for (const handler of handlers.values()) {
      if (seen.has(handler.name)) continue;
      seen.add(handler.name);
      const aliasStr = handler.aliases && handler.aliases.length > 0
        ? ` (aliases: /${handler.aliases.join(", /")})`
        : "";
      lines.push(`  /${handler.name}${aliasStr} — ${handler.description}`);
    }
    return lines.join("\n");
  }

  // Auto-register /help
  const helpHandler: CommandHandler = {
    name: "help",
    description: "Show all available commands",
    execute: async (_args: string) => generateHelp(),
  };

  async function execute(input: string): Promise<string | null> {
    const match = input.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
    if (!match) {
      return null;
    }

    const commandPart = match[1];
    const args = match[2] ?? "";

    // Auto-handle /help
    if (commandPart === "help") {
      return helpHandler.execute(args);
    }

    // Try exact match first (including subcommands like "project/list")
    if (handlers.has(commandPart)) {
      return handlers.get(commandPart)!.execute(args);
    }

    // Try subcommand routing: "/parent/sub" → handler "parent" with args "sub [rest]"
    const slashIdx = commandPart.indexOf("/");
    if (slashIdx !== -1) {
      const parentCommand = commandPart.slice(0, slashIdx);
      const subCommand = commandPart.slice(slashIdx + 1);
      if (handlers.has(parentCommand)) {
        const combinedArgs = args ? `${subCommand} ${args}` : subCommand;
        return handlers.get(parentCommand)!.execute(combinedArgs);
      }
    }

    return `Unknown command: /${commandPart}. Type /help for all commands.`;
  }

  return { register, execute, generateHelp };
}
