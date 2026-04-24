import { describe, it, expect } from "vitest";
import { buildRenderManifest, type RenderOptions } from "../agent/render-engine";

function makeOpts(cards: RenderOptions["cards"], overrides?: Partial<RenderOptions>): RenderOptions {
  return { cards, transition: "cut", ...overrides };
}

describe("buildRenderManifest", () => {
  it("orders cards by input order", () => {
    const manifest = buildRenderManifest(
      makeOpts([
        { refId: "img-1", url: "https://a.jpg", type: "image" },
        { refId: "vid-1", url: "https://b.mp4", type: "video" },
        { refId: "img-2", url: "https://c.jpg", type: "image" },
      ]),
    );
    expect(manifest).toHaveLength(3);
    expect(manifest[0].url).toBe("https://a.jpg");
    expect(manifest[1].url).toBe("https://b.mp4");
    expect(manifest[2].url).toBe("https://c.jpg");
  });

  it("assigns 4s default duration for images", () => {
    const manifest = buildRenderManifest(
      makeOpts([{ refId: "img-1", url: "https://a.jpg", type: "image" }]),
    );
    expect(manifest[0].duration).toBe(4);
    expect(manifest[0].type).toBe("image");
  });

  it("uses card.duration for videos, defaults to 5s", () => {
    const manifest = buildRenderManifest(
      makeOpts([
        { refId: "vid-1", url: "https://a.mp4", type: "video", duration: 12 },
        { refId: "vid-2", url: "https://b.mp4", type: "video" },
      ]),
    );
    expect(manifest[0].duration).toBe(12);
    expect(manifest[1].duration).toBe(5);
  });

  it("accepts custom imageHoldDuration", () => {
    const manifest = buildRenderManifest(
      makeOpts(
        [
          { refId: "img-1", url: "https://a.jpg", type: "image" },
          { refId: "img-2", url: "https://b.jpg", type: "image" },
        ],
        { imageHoldDuration: 7 },
      ),
    );
    expect(manifest[0].duration).toBe(7);
    expect(manifest[1].duration).toBe(7);
  });

  it("filters out audio-only cards", () => {
    const manifest = buildRenderManifest(
      makeOpts([
        { refId: "img-1", url: "https://a.jpg", type: "image" },
        { refId: "aud-1", url: "https://music.mp3", type: "audio" },
        { refId: "vid-1", url: "https://b.mp4", type: "video", duration: 3 },
      ]),
    );
    expect(manifest).toHaveLength(2);
    expect(manifest[0].type).toBe("image");
    expect(manifest[1].type).toBe("video");
  });

  it("returns empty array for empty cards", () => {
    const manifest = buildRenderManifest(makeOpts([]));
    expect(manifest).toEqual([]);
  });

  it("returns empty array when all cards are audio", () => {
    const manifest = buildRenderManifest(
      makeOpts([
        { refId: "aud-1", url: "https://a.mp3", type: "audio" },
        { refId: "aud-2", url: "https://b.wav", type: "audio" },
      ]),
    );
    expect(manifest).toEqual([]);
  });

  it("imageHoldDuration does not affect video duration", () => {
    const manifest = buildRenderManifest(
      makeOpts(
        [
          { refId: "img-1", url: "https://a.jpg", type: "image" },
          { refId: "vid-1", url: "https://b.mp4", type: "video", duration: 10 },
        ],
        { imageHoldDuration: 6 },
      ),
    );
    expect(manifest[0].duration).toBe(6);  // image uses custom hold
    expect(manifest[1].duration).toBe(10); // video keeps its own duration
  });
});
