import { describe, it, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "../..");

describe("T9 — bun --compile binary", () => {
  it.skipIf(process.env.SKIP_T9 === "1")("compiles to a single file and runs", () => {
    execSync("bun run build:binary", { cwd: PACKAGE_ROOT, stdio: "inherit" });
    const bin = join(PACKAGE_ROOT, "dist/livepeer");
    expect(existsSync(bin)).toBe(true);
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10_000 });
    expect(r.stdout).toMatch(/livepeer/);
  }, 120_000);
});
