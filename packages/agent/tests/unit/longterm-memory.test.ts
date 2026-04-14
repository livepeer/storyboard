import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { LongtermMemory } from "../../src/memory/longterm.js";

let tmpRoot: string;
let lt: LongtermMemory;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "livepeer-test-"));
  lt = new LongtermMemory({ rootDir: tmpRoot });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("LongtermMemory", () => {
  it("creates project dir on first append [INV-4 append-only]", async () => {
    const log = lt.log("p1");
    await log.append({ kind: "session_start", session_id: "s1", ts: 0 });
    expect(await log.exists()).toBe(true);
  });

  it("readAll returns events in order", async () => {
    const log = lt.log("p1");
    await log.append({ kind: "session_start", session_id: "s1", ts: 0 });
    await log.append({
      kind: "context_set",
      context: { style: "ghibli", palette: "", characters: "", setting: "", rules: "", mood: "" },
      ts: 1,
    });
    const events = await log.readAll();
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("session_start");
    expect(events[1].kind).toBe("context_set");
  });

  it("resume replays events into working + session stores", async () => {
    const log = lt.log("p1");
    await log.append({ kind: "session_start", session_id: "s1", ts: 0 });
    await log.append({
      kind: "context_set",
      context: { style: "ghibli", palette: "warm", characters: "girl", setting: "village", rules: "", mood: "" },
      ts: 1,
    });
    await log.append({
      kind: "artifact",
      artifact: { id: "a1", kind: "image", prompt: "test", branch: "main", ts: 2 },
    });
    const { working, session, eventCount } = await lt.resume("p1");
    expect(eventCount).toBe(3);
    expect(working.snapshot().context.style).toBe("ghibli");
    expect(session.snapshot().artifact_registry).toHaveLength(1);
    // Resumed artifact must keep its original id, ts, and branch — show() depends on it.
    const restored = session.snapshot().artifact_registry[0];
    expect(restored.id).toBe("a1");
    expect(restored.ts).toBe(2);
    expect(restored.branch).toBe("main");
    expect(session.show("a1")).toBeDefined();
  });

  it("listProjects returns all project dirs", async () => {
    await lt.log("p1").append({ kind: "session_start", session_id: "s1", ts: 0 });
    await lt.log("p2").append({ kind: "session_start", session_id: "s2", ts: 0 });
    const list = await lt.listProjects();
    expect(list.sort()).toEqual(["p1", "p2"]);
  });

  it("readAll on nonexistent file returns empty array, not error", async () => {
    const events = await lt.log("never-existed").readAll();
    expect(events).toEqual([]);
  });
});
