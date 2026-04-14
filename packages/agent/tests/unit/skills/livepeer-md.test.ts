import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLivepeerMd } from "../../../src/skills/livepeer-md.js";

describe("loadLivepeerMd", () => {
  it("loads livepeer.md from a temp project root", () => {
    const dir = mkdtempSync(join(tmpdir(), "livepeer-md-test-"));
    const content = "# Project Config\n\nTEST_MARKER: unique-string-12345\n\nSome project instructions.";
    writeFileSync(join(dir, "livepeer.md"), content);

    const result = loadLivepeerMd(dir);
    expect(result).toContain("TEST_MARKER: unique-string-12345");
    expect(result).toBe(content);
  });

  it("returns empty string when livepeer.md is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "livepeer-md-missing-"));
    // Don't create livepeer.md
    const result = loadLivepeerMd(dir);
    expect(result).toBe("");
  });
});
