import { describe, it, expect, beforeEach } from "vitest";
import { WorkingMemoryStore } from "../../src/memory/working.js";
import { SessionMemoryStore } from "../../src/memory/session.js";
import { recallTool } from "../../src/tools/builtin/memory/recall.js";
import { showTool } from "../../src/tools/builtin/memory/show.js";
import { threadTool } from "../../src/tools/builtin/memory/thread.js";
import { pinTool } from "../../src/tools/builtin/memory/pin.js";
import { forgetTool } from "../../src/tools/builtin/memory/forget.js";
import { summarizeTool } from "../../src/tools/builtin/memory/summarize.js";

let ctx: { working: WorkingMemoryStore; session: SessionMemoryStore };

beforeEach(() => {
  ctx = { working: new WorkingMemoryStore(), session: new SessionMemoryStore() };
});

describe("memory tools", () => {
  it("recall finds an artifact by keyword", async () => {
    ctx.session.recordArtifact({ kind: "image", prompt: "rooftop garden in summer" });
    const result = await recallTool.execute({ query: "rooftop" }, ctx);
    expect(result).toContain("rooftop garden");
  });

  it("show fetches by id", async () => {
    const a = ctx.session.recordArtifact({ kind: "image", prompt: "test prompt" });
    const result = await showTool.execute({ id: a.id }, ctx);
    expect(result).toContain("test prompt");
  });

  it("thread returns artifacts and decisions for scope", async () => {
    const art = ctx.session.recordArtifact({ kind: "image", prompt: "scene 3 castle" });
    ctx.session.recordDecision({ kind: "accept", target_artifact_id: art.id });
    const result = await threadTool.execute({ scope: "castle" }, ctx);
    expect(result).toContain("artifacts");
    expect(JSON.parse(result).artifacts).toHaveLength(1);
  });

  it("pin then forget round-trips", async () => {
    const pinResult = await pinTool.execute({ fact: "warm lighting only" }, ctx);
    expect(pinResult).toContain("Pinned");
    const id = pinResult.split(": ")[1].split(" - ")[0];
    expect(ctx.working.snapshot().pinned).toHaveLength(1);
    const forgetResult = await forgetTool.execute({ id }, ctx);
    expect(forgetResult).toContain("Forgotten");
    expect(ctx.working.snapshot().pinned).toHaveLength(0);
  });

  it("summarize reports counts", async () => {
    ctx.session.recordArtifact({ kind: "image", prompt: "p1" });
    ctx.session.recordArtifact({ kind: "video", prompt: "p2" });
    const result = await summarizeTool.execute({}, ctx);
    expect(result).toContain("2 artifacts");
  });
});
