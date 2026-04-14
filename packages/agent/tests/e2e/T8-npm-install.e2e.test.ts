import { describe, it, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "../..");

describe("T8 — npm install -g smoke", () => {
  it.skipIf(process.env.SKIP_T8 === "1")("packs and installs the binary", () => {
    const dir = mkdtempSync(join(tmpdir(), "npm-i-"));
    try {
      // Build first so dist/ is fresh
      execSync("bun run build", { cwd: PACKAGE_ROOT, stdio: "inherit" });
      const tarball = execSync("npm pack --silent", { cwd: PACKAGE_ROOT }).toString().trim();
      const tarballPath = join(PACKAGE_ROOT, tarball);
      try {
        execSync(`npm install -g --prefix ${dir} ${tarballPath}`, { stdio: "inherit" });
        // The npm bin entry is dist/cli.js — a JS file invoked via node
        const binPath = join(dir, "bin/livepeer");
        const r = spawnSync("node", [binPath, "--mcp"], {
          input: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n',
          encoding: "utf8",
          timeout: 10_000,
        });
        const lines = r.stdout.trim().split("\n").filter(Boolean);
        expect(lines.length).toBeGreaterThan(0);
        const res = JSON.parse(lines[0]);
        expect(res.result.tools).toHaveLength(8);
      } finally {
        // Remove the tarball regardless of test outcome
        rmSync(tarballPath, { force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
