/**
 * Detect locally installed claude / codex CLIs for [Q3b-Hybrid] offload.
 * Probes $PATH for the binaries and returns a capability report.
 */

import { spawn } from "node:child_process";

export interface LocalAgent {
  name: "claude" | "codex";
  binary: string;
  version?: string;
}

async function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn("which", [cmd]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", (code) => resolve(code === 0 ? out.trim() : null));
    p.on("error", () => resolve(null));
  });
}

async function getVersion(binary: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const p = spawn(binary, ["--version"]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => resolve(out.trim() || undefined));
    p.on("error", () => resolve(undefined));
    setTimeout(() => resolve(undefined), 2000);
  });
}

export async function detectLocalAgents(): Promise<LocalAgent[]> {
  const found: LocalAgent[] = [];
  const claude = await which("claude");
  if (claude) found.push({ name: "claude", binary: claude, version: await getVersion(claude) });
  const codex = await which("codex");
  if (codex) found.push({ name: "codex", binary: codex, version: await getVersion(codex) });
  return found;
}
