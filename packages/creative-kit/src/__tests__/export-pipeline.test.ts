import { describe, it, expect } from "vitest";
import { buildVideoManifest, buildStoryboardHtml, listSocialPlatforms, getSocialSpecs, type ExportableScene } from "../agent/export-pipeline";

const scenes: ExportableScene[] = [
  { index: 1, title: "Dawn", description: "Sunrise over mountains", imageUrl: "https://img1.jpg", duration: 5 },
  { index: 2, title: "Storm", description: "Dark clouds gathering", videoUrl: "https://vid2.mp4", duration: 8 },
  { index: 3, title: "Night", description: "Starry sky", imageUrl: "https://img3.jpg", duration: 4 },
];

describe("buildVideoManifest", () => {
  it("builds ordered list with correct types", () => {
    const manifest = buildVideoManifest({ format: "video", scenes, title: "Test" });
    expect(manifest).toHaveLength(3);
    expect(manifest[0].type).toBe("image");
    expect(manifest[0].url).toBe("https://img1.jpg");
    expect(manifest[1].type).toBe("video");
    expect(manifest[1].url).toBe("https://vid2.mp4");
    expect(manifest[2].type).toBe("image");
  });

  it("uses scene durations", () => {
    const manifest = buildVideoManifest({ format: "video", scenes, title: "Test" });
    expect(manifest[0].duration).toBe(5);
    expect(manifest[1].duration).toBe(8);
  });

  it("defaults duration for scenes without it", () => {
    const noTime: ExportableScene[] = [{ index: 1, title: "X", description: "Y", imageUrl: "img.jpg" }];
    const manifest = buildVideoManifest({ format: "video", scenes: noTime, title: "Test" });
    expect(manifest[0].duration).toBe(4); // default
  });

  it("skips scenes without any media", () => {
    const noMedia: ExportableScene[] = [{ index: 1, title: "X", description: "Y" }];
    const manifest = buildVideoManifest({ format: "video", scenes: noMedia, title: "Test" });
    expect(manifest).toHaveLength(0);
  });
});

describe("buildStoryboardHtml", () => {
  it("includes title", () => {
    const html = buildStoryboardHtml({ format: "pdf", scenes, title: "Dragon Story" });
    expect(html).toContain("Dragon Story");
  });

  it("includes all scenes", () => {
    const html = buildStoryboardHtml({ format: "pdf", scenes, title: "Test" });
    expect(html).toContain("Scene 1: Dawn");
    expect(html).toContain("Scene 2: Storm");
    expect(html).toContain("Scene 3: Night");
  });

  it("includes image tags for scenes with images", () => {
    const html = buildStoryboardHtml({ format: "pdf", scenes, title: "Test" });
    expect(html).toContain('src="https://img1.jpg"');
  });

  it("shows 'No image' placeholder for scenes without media", () => {
    const noImg: ExportableScene[] = [{ index: 1, title: "X", description: "Y" }];
    const html = buildStoryboardHtml({ format: "pdf", scenes: noImg, title: "Test" });
    expect(html).toContain("No image");
  });

  it("includes style if provided", () => {
    const html = buildStoryboardHtml({ format: "pdf", scenes, title: "Test", style: "Ghibli watercolor" });
    expect(html).toContain("Ghibli watercolor");
  });
});

describe("Social Platforms", () => {
  it("lists all platforms", () => {
    const platforms = listSocialPlatforms();
    expect(platforms.length).toBeGreaterThanOrEqual(4);
    expect(platforms.map((p) => p.id)).toContain("instagram");
    expect(platforms.map((p) => p.id)).toContain("tiktok");
  });

  it("returns correct specs", () => {
    const ig = getSocialSpecs("instagram");
    expect(ig.width).toBe(1080);
    expect(ig.height).toBe(1080);
    const yt = getSocialSpecs("youtube");
    expect(yt.width).toBe(1920);
    expect(yt.height).toBe(1080);
  });
});
