import React from "react";
import { render } from "ink";
import { Splash } from "./splash.js";

export async function runCli(): Promise<void> {
  const t0 = performance.now();
  const { unmount, waitUntilExit } = render(<Splash version="0.1.0-alpha.0" />);
  // First paint marker — fires immediately after render() returns, before any await.
  console.error(`splash:${(performance.now() - t0).toFixed(2)}`);

  // Lazy bootstrap — heavy modules MUST be loaded after the splash mounts.
  const { AgentRunner } = await import("../agent/runner.js");
  const { ToolRegistry } = await import("../tools/registry.js");
  const { WorkingMemoryStore } = await import("../memory/working.js");
  const { SessionMemoryStore } = await import("../memory/session.js");
  const { GeminiProvider } = await import("../providers/gemini.js");
  const { SlashRegistry } = await import("../skills/commands.js");
  const { Repl } = await import("./repl.js");

  const provider = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY ?? "" });
  const tools = new ToolRegistry();
  const working = new WorkingMemoryStore();
  const session = new SessionMemoryStore();
  const runner = new AgentRunner(provider, tools, working, session);
  const slash = new SlashRegistry();

  unmount();
  const replInstance = render(<Repl runner={runner} slash={slash} />);
  await replInstance.waitUntilExit();
}
