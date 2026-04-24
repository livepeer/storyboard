/**
 * Export Pipeline — convert canvas artifacts into deliverables.
 *
 * Supported formats:
 * - video: stitch scene images/videos into a single movie
 * - pdf: storyboard deck with scene descriptions
 * - social: optimized crops for Instagram/TikTok/YouTube
 * - json: raw export of all artifact data
 */

export type ExportFormat = "video" | "pdf" | "social" | "json";
export type SocialPlatform = "instagram" | "tiktok" | "youtube" | "twitter";

export interface ExportableScene {
  index: number;
  title: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  duration?: number;
}

export interface ExportOptions {
  format: ExportFormat;
  scenes: ExportableScene[];
  title: string;
  style?: string;
  /** For social format */
  platform?: SocialPlatform;
  /** For video format */
  transitionDuration?: number;
  /** Background music URL */
  musicUrl?: string;
}

export interface ExportResult {
  format: ExportFormat;
  /** Download URL or blob URL */
  url: string;
  /** File name suggestion */
  fileName: string;
  /** File size in bytes (if known) */
  size?: number;
}

/** Social platform aspect ratios and max durations. */
const SOCIAL_SPECS: Record<SocialPlatform, { width: number; height: number; maxDuration: number; label: string }> = {
  instagram: { width: 1080, height: 1080, maxDuration: 60, label: "Instagram (1:1)" },
  tiktok: { width: 1080, height: 1920, maxDuration: 180, label: "TikTok (9:16)" },
  youtube: { width: 1920, height: 1080, maxDuration: 600, label: "YouTube (16:9)" },
  twitter: { width: 1200, height: 675, maxDuration: 140, label: "Twitter/X (16:9)" },
};

/** Get social platform specs. */
export function getSocialSpecs(platform: SocialPlatform) {
  return SOCIAL_SPECS[platform];
}

/** Get all available social platforms. */
export function listSocialPlatforms(): Array<{ id: SocialPlatform; label: string }> {
  return Object.entries(SOCIAL_SPECS).map(([id, spec]) => ({ id: id as SocialPlatform, label: spec.label }));
}

/**
 * Export to JSON — dumps all scene data as a downloadable file.
 */
export function exportToJson(opts: ExportOptions): ExportResult {
  const data = {
    title: opts.title,
    style: opts.style,
    exportedAt: new Date().toISOString(),
    scenes: opts.scenes,
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  return {
    format: "json",
    url,
    fileName: `${slugify(opts.title)}.json`,
    size: blob.size,
  };
}

/**
 * Build the FFmpeg-compatible scene list for video stitching.
 * Returns the ordered list of media URLs with durations.
 * Actual stitching requires server-side FFmpeg or browser MediaRecorder.
 */
export function buildVideoManifest(opts: ExportOptions): Array<{ url: string; duration: number; type: "image" | "video" }> {
  const manifest: Array<{ url: string; duration: number; type: "image" | "video" }> = [];
  const transitionDur = opts.transitionDuration ?? 1;

  for (const scene of opts.scenes) {
    if (scene.videoUrl) {
      manifest.push({ url: scene.videoUrl, duration: scene.duration ?? 5, type: "video" });
    } else if (scene.imageUrl) {
      // Images become still frames for their duration
      manifest.push({ url: scene.imageUrl, duration: scene.duration ?? 4, type: "image" });
    }
    // Add transition gap (if not last scene)
    if (scene !== opts.scenes[opts.scenes.length - 1] && transitionDur > 0) {
      // Transition is handled by the stitcher, just note the gap
    }
  }

  return manifest;
}

/**
 * Generate a PDF storyboard deck.
 * Returns HTML that can be printed to PDF via window.print().
 */
export function buildStoryboardHtml(opts: ExportOptions): string {
  const scenes = opts.scenes.map((s) => `
    <div style="page-break-inside:avoid;margin:20px 0;display:flex;gap:20px;align-items:flex-start">
      ${s.imageUrl ? `<img src="${s.imageUrl}" style="width:300px;height:200px;object-fit:cover;border-radius:8px" crossorigin="anonymous" />` : '<div style="width:300px;height:200px;background:#333;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#666">No image</div>'}
      <div style="flex:1">
        <h3 style="margin:0 0 8px;font-size:16px">Scene ${s.index}: ${s.title}</h3>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#555">${s.description}</p>
        ${s.duration ? `<p style="margin:8px 0 0;font-size:11px;color:#999">Duration: ${s.duration}s</p>` : ""}
      </div>
    </div>
  `).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <title>${opts.title} — Storyboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1 style="font-size:24px;margin:0">${opts.title}</h1>
  ${opts.style ? `<p style="color:#888;font-size:13px;margin:4px 0 20px">${opts.style}</p>` : ""}
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
  ${scenes}
  <footer style="margin-top:40px;font-size:10px;color:#ccc;text-align:center">
    Generated by Storyboard · ${new Date().toLocaleDateString()}
  </footer>
</body>
</html>`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "export";
}
