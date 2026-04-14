import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "../../dist/cli.js");

describe("T2 — MCP stdio roundtrip", () => {
  it("livepeer --mcp answers tools/list with 8 tools", async () => {
    const proc = spawn("node", [BIN, "--mcp"], { stdio: ["pipe", "pipe", "inherit"] });

    const reqs = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ];
    for (const r of reqs) proc.stdin.write(JSON.stringify(r) + "\n");

    const out = await new Promise<string>((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => reject(new Error("timeout")), 8000);
      proc.stdout.on("data", (d) => {
        buf += d.toString();
        if (buf.split("\n").filter(Boolean).length >= 2) {
          clearTimeout(timer);
          resolve(buf);
        }
      });
    });
    proc.kill();

    const lines = out.trim().split("\n");
    const listRes = JSON.parse(lines[1]);
    expect(listRes.result.tools).toHaveLength(8);
    expect(listRes.result.tools.map((t: any) => t.name)).toContain("livepeer.create_media");
  }, 10_000);
});
