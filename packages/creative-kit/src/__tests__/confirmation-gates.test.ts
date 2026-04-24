import { describe, it, expect } from "vitest";
import { checkSceneGate, checkRegenerateGate, checkModelGate, configureGates } from "../agent/confirmation-gates";

describe("checkSceneGate", () => {
  it("returns null for small scene counts", () => {
    expect(checkSceneGate(3, "flux-dev")).toBeNull();
    expect(checkSceneGate(5, "flux-dev")).toBeNull();
  });

  it("returns gate for 6+ scenes", () => {
    const gate = checkSceneGate(8, "flux-dev", "Ghibli watercolor");
    expect(gate).not.toBeNull();
    expect(gate!.action).toContain("8 scenes");
    expect(gate!.details).toContain("8 scenes will be generated");
    expect(gate!.details).toContainEqual(expect.stringContaining("Ghibli"));
  });

  it("includes cost for expensive models", () => {
    const gate = checkSceneGate(6, "kling-o3-i2v");
    expect(gate).not.toBeNull();
    expect(gate!.cost).toBeTruthy();
    expect(gate!.cost).toContain("$");
  });

  it("no cost for standard models", () => {
    const gate = checkSceneGate(10, "flux-dev");
    expect(gate).not.toBeNull();
    expect(gate!.cost).toBeUndefined();
  });
});

describe("checkRegenerateGate", () => {
  it("returns null for small batches", () => {
    expect(checkRegenerateGate(2, 2)).toBeNull();
  });

  it("returns gate for 3+ scenes with existing cards", () => {
    const gate = checkRegenerateGate(5, 5);
    expect(gate).not.toBeNull();
    expect(gate!.action).toContain("Regenerate 5");
    expect(gate!.details[0]).toContain("5 existing images");
  });
});

describe("checkModelGate", () => {
  it("returns null for standard models", () => {
    expect(checkModelGate("flux-dev", 10)).toBeNull();
  });

  it("returns gate for Kling O3 with multiple items", () => {
    const gate = checkModelGate("kling-o3-i2v", 5);
    expect(gate).not.toBeNull();
    expect(gate!.action).toContain("Kling");
    expect(gate!.cost).toBeTruthy();
  });

  it("returns null for single item even with expensive model", () => {
    expect(checkModelGate("kling-o3-i2v", 1)).toBeNull();
  });
});

describe("configureGates", () => {
  it("can disable gates", () => {
    configureGates({ enabled: false });
    expect(checkSceneGate(100, "flux-dev")).toBeNull();
    expect(checkModelGate("kling-o3-i2v", 10)).toBeNull();
    configureGates({ enabled: true }); // restore
  });

  it("can adjust scene threshold", () => {
    configureGates({ sceneThreshold: 20 });
    expect(checkSceneGate(15, "flux-dev")).toBeNull(); // under 20
    expect(checkSceneGate(25, "flux-dev")).not.toBeNull(); // over 20
    configureGates({ sceneThreshold: 6 }); // restore
  });
});
