import { describe, it, expectTypeOf } from "vitest";
import type { MemoryEvent, WorkingMemory, Artifact } from "../../src/memory/types.js";

describe("memory types", () => {
  it("MemoryEvent discriminated union covers all event kinds", () => {
    const events: MemoryEvent[] = [
      { kind: "session_start", session_id: "s1", ts: 0 },
      { kind: "context_set", context: { style: "", palette: "", characters: "", setting: "", rules: "", mood: "" }, ts: 0 },
      { kind: "context_patch", patch: { style: "ghibli" }, ts: 0 },
      { kind: "focus_set", focus: { project_id: "p1" }, ts: 0 },
      { kind: "pin", fact: { id: "f1", text: "warm", ts: 0 } },
      { kind: "unpin", id: "f1", ts: 0 },
      { kind: "undo", turn_id: "t1", ts: 0 },
      { kind: "rewind", n: 5, ts: 0, new_branch: "branch_2" },
      { kind: "branch", name: "what-if", from: "main", ts: 0 },
    ];
    expectTypeOf(events).toMatchTypeOf<MemoryEvent[]>();
  });

  it("Artifact requires branch field [INV-4]", () => {
    const a: Artifact = {
      id: "a1",
      kind: "image",
      prompt: "a cat",
      branch: "main",
      ts: 0,
    };
    expectTypeOf(a).toMatchTypeOf<Artifact>();
  });
});
