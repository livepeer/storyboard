import { describe, it, expect, beforeEach } from "vitest";
import { translateIntent, parseSlashCommand } from "@/lib/stream/cockpit-agent";
import { useCockpitStore } from "@/lib/stream/cockpit-store";

describe("parseSlashCommand", () => {
  it("parses /preset", () => {
    const result = parseSlashCommand("/preset dreamy");
    expect(result?.tool).toBe("scope_apply_preset");
    expect(result?.params.preset).toBe("dreamy");
  });

  it("parses /noise", () => {
    const result = parseSlashCommand("/noise 0.7");
    expect(result?.tool).toBe("scope_control");
    expect(result?.params.noise_scale).toBe(0.7);
  });

  it("parses /reset", () => {
    const result = parseSlashCommand("/reset");
    expect(result?.tool).toBe("scope_control");
    expect(result?.params.reset_cache).toBe(true);
  });

  it("returns null for non-slash", () => {
    expect(parseSlashCommand("make it dreamy")).toBeNull();
  });
});

describe("translateIntent", () => {
  beforeEach(() => {
    useCockpitStore.setState({ history: [], pinnedSkills: [] });
  });

  it("returns pinned skill match without LLM call", async () => {
    const skill = useCockpitStore.getState().pinAction("anime style", {
      tool: "scope_apply_preset",
      params: { preset: "anime" },
      summary: "anime preset",
      kind: "preset",
    });
    const result = await translateIntent("make it anime");
    expect(result.applied.tool).toBe("scope_apply_preset");
    expect(result.applied.params.preset).toBe("anime");
    const updated = useCockpitStore.getState().pinnedSkills.find((s) => s.id === skill.id);
    expect(updated?.uses).toBe(1);
  });

  it("falls back to slash command parser", async () => {
    const result = await translateIntent("/preset cinematic");
    expect(result.applied.tool).toBe("scope_apply_preset");
    expect(result.applied.params.preset).toBe("cinematic");
  });

  it("matches preset by keyword", async () => {
    const result = await translateIntent("dreamy soft");
    expect(result.applied.tool).toBe("scope_apply_preset");
    expect(result.applied.params.preset).toBe("dreamy");
  });

  it("returns alternatives", async () => {
    const result = await translateIntent("/preset dreamy");
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it("falls back to prompt update for non-matching intent", async () => {
    const result = await translateIntent("xyz random nonsense");
    expect(result.applied.tool).toBe("scope_control");
    expect(result.applied.params.prompts).toBe("xyz random nonsense");
  });
});
