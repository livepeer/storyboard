import { beforeEach, describe, expect, test } from "vitest";
import {
  classifyUserTurn,
  formatActiveRequest,
  useActiveRequest,
  type ActiveRequest,
} from "@/lib/agents/active-request";

const EMPTY: ActiveRequest = {
  subject: "",
  count: 0,
  modifiers: [],
  mediaType: null,
  lastUpdatedAt: 0,
};

describe("classifyUserTurn", () => {
  test("empty text -> unrelated", () => {
    expect(classifyUserTurn("", EMPTY).kind).toBe("unrelated");
    expect(classifyUserTurn("   ", EMPTY).kind).toBe("unrelated");
  });

  test("chit-chat -> unrelated", () => {
    expect(classifyUserTurn("thanks", EMPTY).kind).toBe("unrelated");
    expect(classifyUserTurn("ok cool", EMPTY).kind).toBe("unrelated");
    expect(classifyUserTurn("what's next?", EMPTY).kind).toBe("unrelated");
    expect(classifyUserTurn("got it", EMPTY).kind).toBe("unrelated");
  });

  test("stop commands -> unrelated", () => {
    expect(classifyUserTurn("stop", EMPTY).kind).toBe("unrelated");
    expect(classifyUserTurn("never mind", EMPTY).kind).toBe("unrelated");
    expect(classifyUserTurn("start over", EMPTY).kind).toBe("unrelated");
  });

  test("count+noun of X -> new with count, subject, image type", () => {
    const r = classifyUserTurn("5 pictures of cute cat playing with bulldog", EMPTY);
    expect(r.kind).toBe("new");
    expect(r.patch.count).toBe(5);
    expect(r.patch.subject).toContain("cat");
    expect(r.patch.subject).toContain("bulldog");
    expect(r.patch.mediaType).toBe("image");
  });

  test("create verb + subject -> new", () => {
    const r = classifyUserTurn("make a dragon flying over a castle", EMPTY);
    expect(r.kind).toBe("new");
    expect(r.patch.subject).toContain("dragon");
    expect(r.patch.subject).toContain("castle");
  });

  test("give me N of X -> new with count", () => {
    const r = classifyUserTurn("give me 3 videos of a robot dancing", EMPTY);
    expect(r.kind).toBe("new");
    expect(r.patch.count).toBe(3);
    expect(r.patch.mediaType).toBe("video");
    expect(r.patch.subject).toContain("robot");
  });

  test("short answer with active subject -> clarify", () => {
    const active: ActiveRequest = {
      ...EMPTY,
      subject: "cat playing with bulldog",
      count: 5,
      lastUpdatedAt: Date.now(),
    };
    const r = classifyUserTurn("outdoor", active);
    expect(r.kind).toBe("clarify");
    expect(r.patch.modifierToAppend).toBe("outdoor");
  });

  test("short answer with NO active subject -> unrelated", () => {
    const r = classifyUserTurn("outdoor", EMPTY);
    expect(r.kind).toBe("unrelated");
  });

  test("correction 'with X' -> correct", () => {
    const active: ActiveRequest = {
      ...EMPTY,
      subject: "cat playing",
      lastUpdatedAt: Date.now(),
    };
    const r = classifyUserTurn("with bulldog", active);
    expect(r.kind).toBe("correct");
    expect(r.patch.subjectAddendum).toContain("bulldog");
  });

  test("correction 'recreate with X' -> correct", () => {
    const active: ActiveRequest = {
      ...EMPTY,
      subject: "cat and bulldog",
      lastUpdatedAt: Date.now(),
    };
    const r = classifyUserTurn("recreate with bulldog", active);
    expect(r.kind).toBe("correct");
    expect(r.patch.subjectAddendum).toContain("bulldog");
  });

  test("medium-length feedback on active subject -> clarify", () => {
    const active: ActiveRequest = {
      ...EMPTY,
      subject: "cat playing with bulldog",
      lastUpdatedAt: Date.now(),
    };
    const r = classifyUserTurn("brighter colors please", active);
    expect(r.kind).toBe("clarify");
    expect(r.patch.modifierToAppend).toBe("brighter colors please");
  });

  test("long new subject overrides prior active", () => {
    const active: ActiveRequest = {
      ...EMPTY,
      subject: "cat playing with bulldog",
      lastUpdatedAt: Date.now(),
    };
    const r = classifyUserTurn("8 images of a spaceship landing on the moon", active);
    expect(r.kind).toBe("new");
    expect(r.patch.subject).toContain("spaceship");
    expect(r.patch.subject).not.toContain("cat");
    expect(r.patch.count).toBe(8);
  });

  test("explicit 'make it a video' on active subject -> correct with mediaType", () => {
    const active: ActiveRequest = {
      ...EMPTY,
      subject: "cat playing with bulldog",
      lastUpdatedAt: Date.now(),
    };
    // Phrase starts with 'make' which is also a create verb — so this
    // matches the new-request extractor first. We want it to treat as
    // new if the user is explicitly re-issuing the request.
    const r = classifyUserTurn("make it a video", active);
    // Either 'new' or 'correct' is acceptable here — verify mediaType lands.
    expect(r.kind === "new" || r.kind === "correct").toBe(true);
    const type = r.patch.mediaType;
    expect(type).toBe("video");
  });
});

describe("formatActiveRequest", () => {
  test("empty -> empty string", () => {
    expect(formatActiveRequest(EMPTY)).toBe("");
  });

  test("subject only", () => {
    expect(
      formatActiveRequest({ ...EMPTY, subject: "cat playing with bulldog" })
    ).toBe('"cat playing with bulldog"');
  });

  test("count + image + subject + modifiers", () => {
    const r: ActiveRequest = {
      subject: "cat playing with bulldog",
      count: 5,
      modifiers: ["outdoor", "city"],
      mediaType: "image",
      lastUpdatedAt: Date.now(),
    };
    const formatted = formatActiveRequest(r);
    expect(formatted).toContain("5");
    expect(formatted).toContain("images");
    expect(formatted).toContain("cat playing with bulldog");
    expect(formatted).toContain("outdoor");
    expect(formatted).toContain("city");
  });
});

describe("useActiveRequest store — integration with cat/bulldog flow", () => {
  beforeEach(() => {
    useActiveRequest.getState().reset();
  });

  test("full cat/bulldog flow preserves subject across 5 turns", () => {
    const store = useActiveRequest.getState();

    // Turn 1: initial request
    store.applyTurn("5 pictures of cute cat playing with bulldog");
    expect(useActiveRequest.getState().subject).toContain("cat");
    expect(useActiveRequest.getState().subject).toContain("bulldog");
    expect(useActiveRequest.getState().count).toBe(5);

    // Turn 2: user answers "outdoor"
    store.applyTurn("outdoor");
    expect(useActiveRequest.getState().subject).toContain("cat");
    expect(useActiveRequest.getState().subject).toContain("bulldog");
    expect(useActiveRequest.getState().modifiers).toContain("outdoor");

    // Turn 3: user says "recreate with bulldog" (the buggy case)
    store.applyTurn("recreate with bulldog");
    expect(useActiveRequest.getState().subject).toContain("cat");
    expect(useActiveRequest.getState().subject).toContain("bulldog");

    // Turn 4: user answers "city"
    store.applyTurn("city");
    const final = useActiveRequest.getState();
    expect(final.subject).toContain("cat");
    expect(final.subject).toContain("bulldog");
    expect(final.modifiers).toContain("outdoor");
    expect(final.modifiers).toContain("city");
    expect(final.count).toBe(5);
  });

  test("chit-chat between turns does not clear state", () => {
    const store = useActiveRequest.getState();
    store.applyTurn("make a dragon flying over a castle");
    const before = useActiveRequest.getState().subject;
    store.applyTurn("thanks");
    store.applyTurn("cool");
    expect(useActiveRequest.getState().subject).toBe(before);
  });

  test("new clearly-different request replaces subject", () => {
    const store = useActiveRequest.getState();
    store.applyTurn("5 pictures of a cat");
    store.applyTurn("outdoor");
    store.applyTurn("8 videos of a spaceship landing on the moon");
    const s = useActiveRequest.getState();
    expect(s.subject).toContain("spaceship");
    expect(s.subject).not.toContain("cat");
    expect(s.count).toBe(8);
    expect(s.modifiers).toHaveLength(0); // reset on new subject
  });

  test("isStale is true when empty or >30min old", () => {
    expect(useActiveRequest.getState().isStale()).toBe(true);
    useActiveRequest.getState().applyTurn("make a cat");
    expect(useActiveRequest.getState().isStale()).toBe(false);
  });
});

describe("context-builder integration: Active request line in system prompt", () => {
  beforeEach(() => {
    useActiveRequest.getState().reset();
  });

  test("system prompt contains the active request after cat/bulldog flow", async () => {
    const { buildAgentContext } = await import("@/lib/agents/context-builder");

    // Replay the bug flow
    useActiveRequest.getState().applyTurn("5 pictures of cute cat playing with bulldog");
    useActiveRequest.getState().applyTurn("outdoor");
    useActiveRequest.getState().applyTurn("recreate with bulldog");
    useActiveRequest.getState().applyTurn("city");

    const system = buildAgentContext(
      { type: "none" },
      {
        project: null,
        digest: "",
        recentActions: [],
        preferences: {},
        canvasCards: [],
        activeEpisodeId: null,
      }
    );

    expect(system).toContain("Active request:");
    expect(system).toContain("cat");
    expect(system).toContain("bulldog");
    expect(system).toContain("outdoor");
    expect(system).toContain("city");
    expect(system).toContain("Preserve subject");
  });

  test("system prompt has NO Active request line when store is empty/stale", async () => {
    const { buildAgentContext } = await import("@/lib/agents/context-builder");
    useActiveRequest.getState().reset();
    const system = buildAgentContext(
      { type: "none" },
      {
        project: null,
        digest: "",
        recentActions: [],
        preferences: {},
        canvasCards: [],
        activeEpisodeId: null,
      }
    );
    expect(system).not.toContain("Active request:");
  });
});
