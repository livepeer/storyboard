import { describe, it, expect, vi } from "vitest";
import { SlashRegistry } from "../../../src/skills/commands.js";

describe("SlashRegistry", () => {
  it("returns null for non-slash input", async () => {
    const registry = new SlashRegistry();
    const result = await registry.run("hello world");
    expect(result).toBeNull();
  });

  it("dispatches to registered handler with args", async () => {
    const registry = new SlashRegistry();
    const handler = vi.fn(async (args: string) => ({
      output: `handled: ${args}`,
    }));
    registry.register("test", handler);

    const result = await registry.run("/test foo bar");
    expect(result).not.toBeNull();
    expect(result!.output).toBe("handled: foo bar");
    expect(handler).toHaveBeenCalledWith("foo bar");
  });

  it("reports unknown commands", async () => {
    const registry = new SlashRegistry();
    const result = await registry.run("/unknown-command");
    expect(result).not.toBeNull();
    expect(result!.output).toContain("Unknown command");
    expect(result!.output).toContain("/unknown-command");
  });
});
