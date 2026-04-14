import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "../../dist/cli.js");

describe("T4 — Splash first paint [INV-10]", () => {
  it("renders splash within 30ms of process start (median of 5)", async () => {
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const proc = spawn("bun", [BIN], { stdio: ["pipe", "pipe", "pipe"] });
      let stderr = "";
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          proc.kill();
          resolve();
        }, 5000);
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
          const m = stderr.match(/splash:([\d.]+)/);
          if (m) {
            samples.push(parseFloat(m[1]));
            clearTimeout(timer);
            proc.kill();
            resolve();
          }
        });
        proc.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    expect(samples.length).toBeGreaterThanOrEqual(5);
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    console.log(
      `splash samples (ms): ${samples.map((s) => s.toFixed(2)).join(", ")}, median=${median.toFixed(2)}`,
    );
    expect(median).toBeLessThan(30);
  }, 30_000);
});
