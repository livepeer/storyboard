import { describe, it, expect } from "vitest";
import { detectLocalAgents } from "../../src/local-agent/detect.js";
import { runLocalAgent } from "../../src/local-agent/run.js";

describe("detectLocalAgents", () => {
  it("returns an array (may be empty if claude/codex not installed)", async () => {
    const agents = await detectLocalAgents();
    expect(Array.isArray(agents)).toBe(true);
    for (const a of agents) {
      expect(a.binary.length).toBeGreaterThan(0);
      expect(["claude", "codex"]).toContain(a.name);
    }
  });
});

describe("runLocalAgent", () => {
  it("runs `echo` as a stand-in and captures output", async () => {
    const result = await runLocalAgent(
      { name: "claude", binary: "/bin/echo" },
      "hello world",
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("hello world");
  });

  it("returns ok=false when the binary doesn't exist", async () => {
    const result = await runLocalAgent(
      { name: "claude", binary: "/nope/does/not/exist" },
      "test",
    );
    expect(result.ok).toBe(false);
  });

  it("times out long-running processes", async () => {
    const result = await runLocalAgent(
      { name: "claude", binary: "/bin/sleep" },
      "10",
      100,
    );
    // sleep doesn't read prompt, so it'll either timeout or exit
    expect(result.duration_ms).toBeLessThan(2000);
  });
});
