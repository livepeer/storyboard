import { readFileSync } from "node:fs";
import type { BenchTask } from "./types.js";

// When bundled into dist/cli.js, import.meta.url points to dist/cli.js so we
// navigate into the bench sub-directory explicitly. When loaded as a module
// from dist/bench/tasks.js the same relative path resolves correctly too
// because dist/bench/ shares the same parent.
const _fixturesBase = new URL(
  import.meta.url.endsWith("tasks.js") || import.meta.url.endsWith("tasks.ts")
    ? "./fixtures/storyboard-multi-scene.txt"
    : "./bench/fixtures/storyboard-multi-scene.txt",
  import.meta.url,
);
const MULTI_SCENE_FIXTURE = readFileSync(_fixturesBase, "utf8");

export const BENCH_TASKS: BenchTask[] = [
  {
    id: "B1-single-image",
    description: "single image creation",
    input: "create a watercolor cat",
    expectedTools: ["livepeer.create_media"],
    maxTokens: 800,
    category: "single-image",
  },
  {
    id: "B2-multi-scene",
    description: "4-scene storyboard",
    input: MULTI_SCENE_FIXTURE,
    expectedTools: ["livepeer.generate_storyboard"],
    maxTokens: 3500,
    category: "multi-scene",
  },
  {
    id: "B3-edit",
    description: "edit existing card",
    input: "make the cat blue",
    expectedTools: ["livepeer.create_media"],
    maxTokens: 600,
    category: "edit",
  },
  {
    id: "B4-stream-start",
    description: "start LV2V stream with preset",
    input: "stream my webcam in anime style",
    expectedTools: ["livepeer.start_stream"],
    maxTokens: 700,
    category: "stream",
  },
  {
    id: "B5-memory-recall",
    description: "recall a pinned fact",
    input: "what character did we use last time?",
    maxTokens: 400,
    category: "memory",
  },
  {
    id: "B6-skill-apply",
    description: "apply luxury-skincare skill",
    input: "ad for a new face cream, use the skincare skill",
    maxTokens: 1200,
    category: "skill",
  },
];
