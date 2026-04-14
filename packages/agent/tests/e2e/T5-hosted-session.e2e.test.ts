// T5 will start passing once the simple-infra feat/agent-layer-5 PR
// is merged and deployed. Until then, even with DAYDREAM_API_KEY set,
// the test will fail with 404 on /agent/session. That's expected —
// T5 is a coordinated-deploy gate.

import { describe, it, expect } from "vitest";
import { HostedSdkClient } from "../../src/capabilities/client.js";

const SDK = "https://sdk.daydream.monster";
const KEY = process.env.DAYDREAM_API_KEY ?? "";
const HAS_KEY = !!process.env.DAYDREAM_API_KEY;
const T5_ENABLED = process.env.RUN_T5 === "1";

describe.skipIf(!HAS_KEY || !T5_ENABLED)("T5 — hosted session [L5a]", () => {
  const client = new HostedSdkClient({ baseUrl: SDK, apiKey: KEY });

  it("creates a session and sets context", async () => {
    const { session_id } = await client.createSession();
    expect(session_id).toMatch(/^[A-Za-z0-9_-]+$/);
    const ok = await client.setContext(session_id, {
      style: "watercolor",
      characters: "fox",
    });
    expect((ok as { ok: boolean }).ok).toBe(true);
  }, 15_000);

  it("enrich prepends context to raw prompt", async () => {
    const { session_id } = await client.createSession();
    await client.setContext(session_id, { style: "anime", characters: "wolf" });
    const { prompt } = await client.enrich(session_id, "in a forest");
    expect(prompt).toContain("anime");
    expect(prompt).toContain("wolf");
    expect(prompt).toContain("in a forest");
  }, 15_000);
});
