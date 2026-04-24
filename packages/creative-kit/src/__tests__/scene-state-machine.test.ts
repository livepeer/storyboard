import { describe, it, expect } from "vitest";
import {
  canTransition, transition, fromLegacyStatus, toLegacyStatus,
  isActionable, isTerminal, stateLabel,
} from "../agent/scene-state-machine";

describe("Scene State Machine", () => {
  describe("canTransition", () => {
    it("planning → generating_image", () => {
      expect(canTransition("planning", "generating_image")).toBe(true);
    });

    it("planning → done is invalid", () => {
      expect(canTransition("planning", "done")).toBe(false);
    });

    it("generating_image → image_done", () => {
      expect(canTransition("generating_image", "image_done")).toBe(true);
    });

    it("generating_image → failed", () => {
      expect(canTransition("generating_image", "failed")).toBe(true);
    });

    it("image_done → generating_video (video project)", () => {
      expect(canTransition("image_done", "generating_video")).toBe(true);
    });

    it("image_done → done (image-only project)", () => {
      expect(canTransition("image_done", "done")).toBe(true);
    });

    it("image_done → generating_image (regenerate)", () => {
      expect(canTransition("image_done", "generating_image")).toBe(true);
    });

    it("failed → generating_image (retry)", () => {
      expect(canTransition("failed", "generating_image")).toBe(true);
    });

    it("failed → generating_video (retry video phase)", () => {
      expect(canTransition("failed", "generating_video")).toBe(true);
    });

    it("done → generating_image (full regenerate)", () => {
      expect(canTransition("done", "generating_image")).toBe(true);
    });
  });

  describe("transition", () => {
    it("valid transition returns new state", () => {
      expect(transition("planning", "generating_image")).toBe("generating_image");
    });

    it("invalid transition throws", () => {
      expect(() => transition("planning", "done")).toThrow("Invalid scene transition");
    });
  });

  describe("fromLegacyStatus", () => {
    it("pending without keyframe → planning", () => {
      expect(fromLegacyStatus("pending", false)).toBe("planning");
    });

    it("pending with keyframe → image_done", () => {
      expect(fromLegacyStatus("pending", true)).toBe("image_done");
    });

    it("generating without keyframe → generating_image", () => {
      expect(fromLegacyStatus("generating", false)).toBe("generating_image");
    });

    it("generating with keyframe → generating_video", () => {
      expect(fromLegacyStatus("generating", true)).toBe("generating_video");
    });

    it("done → done", () => {
      expect(fromLegacyStatus("done", false)).toBe("done");
    });
  });

  describe("toLegacyStatus", () => {
    it("planning → pending", () => {
      expect(toLegacyStatus("planning")).toBe("pending");
    });

    it("generating_image → generating", () => {
      expect(toLegacyStatus("generating_image")).toBe("generating");
    });

    it("image_done → pending (waiting for next phase)", () => {
      expect(toLegacyStatus("image_done")).toBe("pending");
    });

    it("done → done", () => {
      expect(toLegacyStatus("done")).toBe("done");
    });
  });

  describe("isActionable / isTerminal", () => {
    it("planning is actionable", () => {
      expect(isActionable("planning")).toBe(true);
    });

    it("image_done is actionable (needs video or mark done)", () => {
      expect(isActionable("image_done")).toBe(true);
    });

    it("failed is actionable (can retry)", () => {
      expect(isActionable("failed")).toBe(true);
    });

    it("generating_image is not actionable", () => {
      expect(isActionable("generating_image")).toBe(false);
    });

    it("done is terminal", () => {
      expect(isTerminal("done")).toBe(true);
    });

    it("image_done is not terminal", () => {
      expect(isTerminal("image_done")).toBe(false);
    });
  });

  describe("stateLabel", () => {
    it("returns human-readable labels", () => {
      expect(stateLabel("planning")).toBe("Planned");
      expect(stateLabel("generating_image")).toContain("Generating");
      expect(stateLabel("done")).toBe("Complete");
      expect(stateLabel("failed")).toBe("Failed");
    });
  });
});
