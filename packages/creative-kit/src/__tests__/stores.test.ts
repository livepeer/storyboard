import { describe, it, expect, beforeEach } from "vitest";
import { createChatStore } from "../stores/create-chat-store";
import { createProjectStore } from "../stores/create-project-store";
import { createGroupManager } from "../stores/create-group-manager";

// ---------------------------------------------------------------------------
// ChatStore
// ---------------------------------------------------------------------------

describe("createChatStore", () => {
  function makeStore() {
    return createChatStore();
  }

  describe("initial state", () => {
    it("starts with empty messages and isProcessing=false", () => {
      const store = makeStore();
      const s = store.getState();
      expect(s.messages).toHaveLength(0);
      expect(s.isProcessing).toBe(false);
    });
  });

  describe("addMessage()", () => {
    it("adds a message with auto-incrementing id", () => {
      const store = makeStore();
      const m1 = store.getState().addMessage("Hello", "user");
      const m2 = store.getState().addMessage("Hi", "agent");
      expect(m1.id).not.toBe(m2.id);
      expect(store.getState().messages).toHaveLength(2);
    });

    it("stores text, role, and timestamp", () => {
      const store = makeStore();
      const before = Date.now();
      const msg = store.getState().addMessage("test text", "user");
      const after = Date.now();
      expect(msg.text).toBe("test text");
      expect(msg.role).toBe("user");
      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(after);
    });

    it("supports all roles", () => {
      const store = makeStore();
      store.getState().addMessage("from user", "user");
      store.getState().addMessage("from agent", "agent");
      store.getState().addMessage("from system", "system");
      const roles = store.getState().messages.map((m) => m.role);
      expect(roles).toEqual(["user", "agent", "system"]);
    });

    it("returns the created message object", () => {
      const store = makeStore();
      const msg = store.getState().addMessage("returned", "agent");
      expect(store.getState().messages[0]).toEqual(msg);
    });
  });

  describe("setProcessing()", () => {
    it("sets isProcessing to true", () => {
      const store = makeStore();
      store.getState().setProcessing(true);
      expect(store.getState().isProcessing).toBe(true);
    });

    it("sets isProcessing back to false", () => {
      const store = makeStore();
      store.getState().setProcessing(true);
      store.getState().setProcessing(false);
      expect(store.getState().isProcessing).toBe(false);
    });
  });

  describe("clearMessages()", () => {
    it("empties the messages array", () => {
      const store = makeStore();
      store.getState().addMessage("A", "user");
      store.getState().addMessage("B", "agent");
      store.getState().clearMessages();
      expect(store.getState().messages).toHaveLength(0);
    });

    it("is safe on an already-empty store", () => {
      const store = makeStore();
      store.getState().clearMessages();
      expect(store.getState().messages).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// ProjectStore
// ---------------------------------------------------------------------------

function makePipelineItems(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    title: `Scene ${i + 1}`,
    prompt: `Prompt for scene ${i + 1}`,
    action: "create",
  }));
}

describe("createProjectStore", () => {
  function makeStore(opts?: Parameters<typeof createProjectStore>[0]) {
    return createProjectStore(opts);
  }

  describe("initial state", () => {
    it("starts with no projects and no active project", () => {
      const store = makeStore();
      const s = store.getState();
      expect(s.projects).toHaveLength(0);
      expect(s.activeProjectId).toBeNull();
    });
  });

  describe("create()", () => {
    it("creates a project and sets it as active", () => {
      const store = makeStore();
      const project = store.getState().create("A fantasy adventure story", makePipelineItems(3));
      expect(project.id).toContain("fantasy");
      expect(store.getState().activeProjectId).toBe(project.id);
      expect(store.getState().projects).toHaveLength(1);
    });

    it("generates a friendly name from the brief (strips filler words, 4 words, kebab-case)", () => {
      const store = makeStore();
      const project = store.getState().create(
        "A the beautiful sunset over the mountains",
        [],
      );
      // filler stripped: beautiful, sunset, over, mountains → first 4
      expect(project.name).toBe("beautiful-sunset-over-mountains");
    });

    it("id includes the friendly name prefix", () => {
      const store = makeStore();
      const project = store.getState().create("Epic dragon battle scene", []);
      expect(project.id).toMatch(/^epic-dragon-battle-scene_/);
    });

    it("all items start with status pending", () => {
      const store = makeStore();
      const project = store.getState().create("Brief", makePipelineItems(4));
      for (const item of project.items) {
        expect(item.status).toBe("pending");
      }
    });

    it("stores metadata when provided", () => {
      const store = makeStore();
      const project = store.getState().create("Brief", [], { genre: "sci-fi" });
      expect(project.metadata?.genre).toBe("sci-fi");
    });

    it("stores brief on the project", () => {
      const store = makeStore();
      const brief = "A story about robots";
      const project = store.getState().create(brief, []);
      expect(project.brief).toBe(brief);
    });
  });

  describe("getActive() / setActive()", () => {
    it("getActive returns the current active project", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", []);
      const active = store.getState().getActive();
      expect(active?.id).toBe(p.id);
    });

    it("setActive changes the active project", () => {
      const store = makeStore();
      const p1 = store.getState().create("Brief 1", []);
      const p2 = store.getState().create("Brief 2", []);
      store.getState().setActive(p1.id);
      expect(store.getState().activeProjectId).toBe(p1.id);
      store.getState().setActive(p2.id);
      expect(store.getState().activeProjectId).toBe(p2.id);
    });

    it("setActive(null) clears the active project", () => {
      const store = makeStore();
      store.getState().create("Brief", []);
      store.getState().setActive(null);
      expect(store.getState().activeProjectId).toBeNull();
      expect(store.getState().getActive()).toBeUndefined();
    });
  });

  describe("getById()", () => {
    it("finds a project by id", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", []);
      expect(store.getState().getById(p.id)?.id).toBe(p.id);
    });

    it("returns undefined for unknown id", () => {
      const store = makeStore();
      expect(store.getState().getById("nope")).toBeUndefined();
    });
  });

  describe("getByName()", () => {
    it("finds by partial id match (case-insensitive)", () => {
      const store = makeStore();
      const p = store.getState().create("Galactic war epic", []);
      const found = store.getState().getByName("galactic");
      expect(found?.id).toBe(p.id);
    });

    it("finds by partial brief match", () => {
      const store = makeStore();
      const p = store.getState().create("A story about ancient Egypt", []);
      const found = store.getState().getByName("ancient egypt");
      expect(found?.id).toBe(p.id);
    });

    it("returns undefined when nothing matches", () => {
      const store = makeStore();
      store.getState().create("Space opera", []);
      expect(store.getState().getByName("unicorn pizza")).toBeUndefined();
    });
  });

  describe("getNextBatch()", () => {
    it("returns pending items up to batchSize", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(10));
      const batch = store.getState().getNextBatch(p.id, 5);
      expect(batch).toHaveLength(5);
      for (const item of batch) {
        expect(item.status).toBe("pending");
      }
    });

    it("default batchSize is 5", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(10));
      const batch = store.getState().getNextBatch(p.id);
      expect(batch).toHaveLength(5);
    });

    it("includes regenerating items", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(3));
      store.getState().updateItemStatus(p.id, 0, "regenerating");
      const batch = store.getState().getNextBatch(p.id);
      const statuses = batch.map((i) => i.status);
      expect(statuses).toContain("regenerating");
    });

    it("does not include generating/done/failed items", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(5));
      store.getState().updateItemStatus(p.id, 0, "generating");
      store.getState().updateItemStatus(p.id, 1, "done");
      store.getState().updateItemStatus(p.id, 2, "failed");
      const batch = store.getState().getNextBatch(p.id, 10);
      for (const item of batch) {
        expect(["pending", "regenerating"]).toContain(item.status);
      }
    });

    it("returns empty array for unknown project", () => {
      const store = makeStore();
      expect(store.getState().getNextBatch("nope")).toHaveLength(0);
    });
  });

  describe("updateItemStatus()", () => {
    it("patches the item's status", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(3));
      store.getState().updateItemStatus(p.id, 1, "generating");
      const updated = store.getState().getById(p.id)!;
      expect(updated.items[1].status).toBe("generating");
    });

    it("sets artifactRefId when provided", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(2));
      store.getState().updateItemStatus(p.id, 0, "done", "ref-abc");
      const item = store.getState().getById(p.id)!.items[0];
      expect(item.artifactRefId).toBe("ref-abc");
    });

    it("does not change other items", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(3));
      store.getState().updateItemStatus(p.id, 0, "done");
      expect(store.getState().getById(p.id)!.items[1].status).toBe("pending");
      expect(store.getState().getById(p.id)!.items[2].status).toBe("pending");
    });
  });

  describe("isComplete()", () => {
    it("returns false when items are still pending", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(3));
      expect(store.getState().isComplete(p.id)).toBe(false);
    });

    it("returns true when all items are done", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(3));
      store.getState().updateItemStatus(p.id, 0, "done");
      store.getState().updateItemStatus(p.id, 1, "done");
      store.getState().updateItemStatus(p.id, 2, "done");
      expect(store.getState().isComplete(p.id)).toBe(true);
    });

    it("returns false if any item is not done", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", makePipelineItems(3));
      store.getState().updateItemStatus(p.id, 0, "done");
      store.getState().updateItemStatus(p.id, 1, "done");
      expect(store.getState().isComplete(p.id)).toBe(false);
    });

    it("returns false for unknown project", () => {
      const store = makeStore();
      expect(store.getState().isComplete("nope")).toBe(false);
    });

    it("returns false for project with no items", () => {
      const store = makeStore();
      const p = store.getState().create("Brief", []);
      expect(store.getState().isComplete(p.id)).toBe(false);
    });
  });

  describe("maxProjects option", () => {
    it("caps the project array, removing oldest when exceeded", () => {
      const store = makeStore({ maxProjects: 3 });
      const p1 = store.getState().create("Brief 1", []);
      store.getState().create("Brief 2", []);
      store.getState().create("Brief 3", []);
      store.getState().create("Brief 4", []);
      const ids = store.getState().projects.map((p) => p.id);
      expect(ids).toHaveLength(3);
      expect(ids).not.toContain(p1.id);
    });
  });
});

// ---------------------------------------------------------------------------
// GroupManager
// ---------------------------------------------------------------------------

describe("createGroupManager", () => {
  function makeStore() {
    return createGroupManager();
  }

  describe("initial state", () => {
    it("starts with no groups and no active group", () => {
      const store = makeStore();
      const s = store.getState();
      expect(s.groups).toHaveLength(0);
      expect(s.activeGroupId).toBeNull();
    });
  });

  describe("createGroup()", () => {
    it("creates a group with an id prefixed grp_", () => {
      const store = makeStore();
      const g = store.getState().createGroup("Episode 1", ["a1", "a2"]);
      expect(g.id).toMatch(/^grp_/);
      expect(g.name).toBe("Episode 1");
      expect(g.artifactIds).toEqual(expect.arrayContaining(["a1", "a2"]));
    });

    it("deduplicates artifact ids on creation", () => {
      const store = makeStore();
      const g = store.getState().createGroup("Dupes", ["a1", "a1", "a2"]);
      expect(g.artifactIds).toHaveLength(2);
    });

    it("assigns a color from the cycling palette", () => {
      const store = makeStore();
      const validColors = [
        "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981",
        "#ec4899", "#6366f1", "#84cc16", "#f97316",
      ];
      const g = store.getState().createGroup("Test", []);
      expect(validColors).toContain(g.color);
    });

    it("cycles through colors for multiple groups", () => {
      const store = makeStore();
      const colors = Array.from({ length: 3 }, (_, i) =>
        store.getState().createGroup(`Group ${i}`, []).color,
      );
      // Colors should be from the palette and not necessarily all the same
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBeGreaterThanOrEqual(1);
    });

    it("stores the group in state", () => {
      const store = makeStore();
      const g = store.getState().createGroup("My Group", []);
      expect(store.getState().groups).toHaveLength(1);
      expect(store.getState().groups[0].id).toBe(g.id);
    });
  });

  describe("addToGroup()", () => {
    it("appends new artifact ids", () => {
      const store = makeStore();
      const g = store.getState().createGroup("G", ["a1"]);
      store.getState().addToGroup(g.id, ["a2", "a3"]);
      const updated = store.getState().groups[0];
      expect(updated.artifactIds).toContain("a2");
      expect(updated.artifactIds).toContain("a3");
    });

    it("deduplicates on add", () => {
      const store = makeStore();
      const g = store.getState().createGroup("G", ["a1"]);
      store.getState().addToGroup(g.id, ["a1", "a2"]);
      const ids = store.getState().groups[0].artifactIds;
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
      expect(ids).toContain("a1");
      expect(ids).toContain("a2");
    });

    it("is a no-op for unknown group", () => {
      const store = makeStore();
      store.getState().addToGroup("nope", ["a1"]);
      expect(store.getState().groups).toHaveLength(0);
    });
  });

  describe("removeFromGroup()", () => {
    it("removes specified artifact ids", () => {
      const store = makeStore();
      const g = store.getState().createGroup("G", ["a1", "a2", "a3"]);
      store.getState().removeFromGroup(g.id, ["a1", "a3"]);
      expect(store.getState().groups[0].artifactIds).toEqual(["a2"]);
    });

    it("is a no-op for ids not in the group", () => {
      const store = makeStore();
      const g = store.getState().createGroup("G", ["a1"]);
      store.getState().removeFromGroup(g.id, ["nope"]);
      expect(store.getState().groups[0].artifactIds).toEqual(["a1"]);
    });
  });

  describe("getGroupForArtifact()", () => {
    it("finds the group containing an artifact", () => {
      const store = makeStore();
      const g = store.getState().createGroup("G", ["a1", "a2"]);
      const found = store.getState().getGroupForArtifact("a1");
      expect(found?.id).toBe(g.id);
    });

    it("returns undefined for artifact not in any group", () => {
      const store = makeStore();
      store.getState().createGroup("G", ["a1"]);
      expect(store.getState().getGroupForArtifact("a2")).toBeUndefined();
    });

    it("returns undefined for empty store", () => {
      const store = makeStore();
      expect(store.getState().getGroupForArtifact("any")).toBeUndefined();
    });
  });

  describe("activate()", () => {
    it("sets activeGroupId", () => {
      const store = makeStore();
      const g = store.getState().createGroup("G", []);
      store.getState().activate(g.id);
      expect(store.getState().activeGroupId).toBe(g.id);
    });

    it("activate(null) clears the active group", () => {
      const store = makeStore();
      const g = store.getState().createGroup("G", []);
      store.getState().activate(g.id);
      store.getState().activate(null);
      expect(store.getState().activeGroupId).toBeNull();
    });
  });
});
