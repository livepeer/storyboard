import React from "react";
import { render } from "ink";
import { Splash } from "./splash.js";

export async function runCli(): Promise<void> {
  const t0 = performance.now();
  const { unmount, waitUntilExit } = render(<Splash version="1.0.0-rc.1" />);
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

  // Creative Pipeline — classify intent before the agent
  // Uses SDK for inference, console for output (CLI mode)
  let pipeline: import("@livepeer/creative-kit").CreativePipeline | undefined;
  try {
    const { createCreativePipeline } = await import("@livepeer/creative-kit");
    const { HostedSdkClient } = await import("../capabilities/client.js");

    const sdkUrl = process.env.LIVEPEER_SDK_URL || "https://sdk.daydream.monster";
    const apiKey = process.env.LIVEPEER_API_KEY || "";
    const sdkClient = new HostedSdkClient({ baseUrl: sdkUrl, apiKey });

    pipeline = createCreativePipeline({
      executor: {
        async infer(prompt, model) {
          try {
            const result = await sdkClient.inference("cli", model, { prompt });
            const r = result as Record<string, unknown>;
            const d = (r.data ?? r) as Record<string, unknown>;
            const images = d.images as Array<{ url: string }> | undefined;
            const url = (r.image_url as string) ?? images?.[0]?.url ?? (d.url as string);
            return url ? { url } : null;
          } catch { return null; }
        },
        addResult({ title, url, model }) {
          console.log(`  ✦ ${model}: ${url}`);
        },
        say(msg) {
          console.log(`  ⚙ ${msg}`);
        },
      },
    });
  } catch {
    // creative-kit not available — pipeline disabled
  }

  unmount();
  const replInstance = render(<Repl runner={runner} slash={slash} pipeline={pipeline} />);
  await replInstance.waitUntilExit();
}
