import { spawn } from "node:child_process";
import type { LocalAgent } from "./detect.js";

export interface LocalAgentResult {
  ok: boolean;
  output: string;
  exit_code: number | null;
  duration_ms: number;
}

/**
 * Run a local agent CLI with a one-shot prompt and return its
 * captured output. Used for [Q3b-Hybrid] b1 offload — SDK-internal
 * reasoning tasks delegate to the user's local Claude Code or Codex
 * instead of paying for an API call.
 */
export async function runLocalAgent(agent: LocalAgent, prompt: string, timeoutMs = 60000): Promise<LocalAgentResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const args = agent.name === "claude" ? ["--print", prompt] : [prompt];
    const child = spawn(agent.binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        output: stdout.trim() || stderr.trim(),
        exit_code: code,
        duration_ms: Date.now() - start,
      });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        output: e.message,
        exit_code: null,
        duration_ms: Date.now() - start,
      });
    });
  });
}
