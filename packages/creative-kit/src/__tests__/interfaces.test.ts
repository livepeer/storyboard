import { describe, it, expect } from "vitest";
import type {
  Artifact, ArtifactStore,
  Project, ProjectPipeline,
  ChatMessage, ChatBus,
  ArtifactGroup, GroupManager,
} from "../index";

describe("Interface contracts", () => {
  it("Artifact has required fields", () => {
    const a: Artifact = {
      id: "1", refId: "img-1", type: "image", title: "Test",
      x: 0, y: 0, w: 320, h: 280,
    };
    expect(a.id).toBe("1");
    expect(a.type).toBe("image");
  });

  it("Artifact supports optional fields", () => {
    const a: Artifact = {
      id: "2", refId: "vid-1", type: "video", title: "Video",
      x: 0, y: 0, w: 320, h: 280,
      url: "https://example.com/video.mp4",
      error: undefined,
      metadata: { capability: "seedance-i2v" },
    };
    expect(a.url).toBe("https://example.com/video.mp4");
    expect(a.metadata?.capability).toBe("seedance-i2v");
  });

  it("Project has required fields", () => {
    const p: Project = {
      id: "p1", name: "test", brief: "Test project",
      items: [], status: "planning", createdAt: Date.now(),
    };
    expect(p.status).toBe("planning");
    expect(p.items).toHaveLength(0);
  });

  it("Project items have status workflow", () => {
    const p: Project = {
      id: "p2", name: "demo", brief: "Demo",
      items: [
        { index: 0, title: "Scene 1", prompt: "a cat", action: "generate", status: "pending" },
        { index: 1, title: "Scene 2", prompt: "a dog", action: "generate", status: "done", artifactRefId: "img-1" },
      ],
      status: "generating", createdAt: Date.now(),
    };
    expect(p.items[0].status).toBe("pending");
    expect(p.items[1].artifactRefId).toBe("img-1");
  });

  it("ChatMessage has required fields", () => {
    const m: ChatMessage = { id: "1", role: "user", text: "hello", timestamp: 0 };
    expect(m.role).toBe("user");
  });

  it("ChatMessage supports all roles", () => {
    const roles: ChatMessage["role"][] = ["user", "agent", "system"];
    for (const role of roles) {
      const m: ChatMessage = { id: "1", role, text: "test", timestamp: 0 };
      expect(m.role).toBe(role);
    }
  });

  it("ArtifactGroup has required fields", () => {
    const g: ArtifactGroup = { id: "g1", name: "Episode 1", artifactIds: ["c1", "c2"], color: "#8b5cf6" };
    expect(g.name).toBe("Episode 1");
    expect(g.artifactIds).toHaveLength(2);
  });

  it("ArtifactGroup supports metadata", () => {
    const g: ArtifactGroup = {
      id: "g2", name: "Scene Group", artifactIds: [],
      color: "#06b6d4", metadata: { style: "cinematic" },
    };
    expect(g.metadata?.style).toBe("cinematic");
  });
});
