import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "../../dist/cli.js");

describe("T3 — CLI smoke", () => {
  it("starts, prints splash marker, exits cleanly on SIGTERM", async () => {
    const proc = spawn("node", [BIN], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    setTimeout(() => proc.kill("SIGTERM"), 800);
    await new Promise((r) => proc.on("exit", r));
    expect(stderr).toMatch(/splash:\d/);
  }, 5000);
});
