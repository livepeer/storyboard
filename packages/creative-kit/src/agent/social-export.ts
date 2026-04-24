/**
 * Social Export — smart-crop images for social platform specs.
 *
 * Supports Instagram (1:1), TikTok (9:16), YouTube (16:9), Twitter (16:9).
 * Uses center-crop with face-bias: when cropping vertically, biases toward
 * the top 1/3 of the image (where faces usually are).
 */

import { getSocialSpecs, type SocialPlatform } from "./export-pipeline";

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface SocialExportOptions {
  platform: SocialPlatform | "all";
  cards: Array<{ refId: string; url: string; type: "image" | "video" }>;
  watermark?: string;
  onProgress?: (pct: number) => void;
}

export interface SocialExportResult {
  platform: SocialPlatform;
  files: Array<{ name: string; blob: Blob; width: number; height: number }>;
}

const ALL_PLATFORMS: SocialPlatform[] = ["instagram", "tiktok", "youtube", "twitter"];

/**
 * Calculate center-crop rectangle with face-bias.
 *
 * When cropping vertically (removing top/bottom), biases toward the top 1/3
 * of the image where faces typically appear. When cropping horizontally
 * (removing left/right), uses true center. If aspect ratios already match
 * (within 0.01 tolerance), returns the full frame.
 */
export function calculateCrop(srcW: number, srcH: number, targetW: number, targetH: number): CropRect {
  const srcRatio = srcW / srcH;
  const targetRatio = targetW / targetH;

  // Aspect ratios match — full frame
  if (Math.abs(srcRatio - targetRatio) < 0.01) {
    return { sx: 0, sy: 0, sw: srcW, sh: srcH };
  }

  if (srcRatio > targetRatio) {
    // Source is wider than target — crop sides (horizontal center-crop)
    const cropW = srcH * (targetW / targetH);
    const sx = Math.round((srcW - cropW) / 2);
    return { sx, sy: 0, sw: Math.round(cropW), sh: srcH };
  } else {
    // Source is taller than target — crop top/bottom with face-bias
    // Bias toward top 1/3: instead of centering, shift crop region upward
    const cropH = srcW * (targetH / targetW);
    const maxSy = srcH - cropH;
    // Face-bias: position at 1/3 of the available offset instead of 1/2
    const sy = Math.round(maxSy / 3);
    return { sx: 0, sy, sw: srcW, sh: Math.round(cropH) };
  }
}

/**
 * Load an image, crop it to the target dimensions, and return a JPEG blob.
 * Requires browser APIs (Image, canvas).
 */
export async function cropImage(imageUrl: string, targetW: number, targetH: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const crop = calculateCrop(img.naturalWidth, img.naturalHeight, targetW, targetH);
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas 2d context"));
        return;
      }
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, targetW, targetH);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob returned null"));
        },
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
}

/**
 * Export cards for one or all social platforms.
 * Only image cards are cropped; video cards are skipped (would need server-side FFmpeg).
 */
export async function exportForSocial(opts: SocialExportOptions): Promise<SocialExportResult[]> {
  const platforms: SocialPlatform[] = opts.platform === "all" ? ALL_PLATFORMS : [opts.platform];
  const imageCards = opts.cards.filter((c) => c.type === "image");
  const total = platforms.length * imageCards.length;
  let done = 0;

  const results: SocialExportResult[] = [];

  for (const platform of platforms) {
    const spec = getSocialSpecs(platform);
    const files: SocialExportResult["files"] = [];

    for (const card of imageCards) {
      const blob = await cropImage(card.url, spec.width, spec.height);
      files.push({
        name: `${card.refId}-${platform}.jpg`,
        blob,
        width: spec.width,
        height: spec.height,
      });
      done++;
      opts.onProgress?.(Math.round((done / total) * 100));
    }

    results.push({ platform, files });
  }

  return results;
}
