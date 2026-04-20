/**
 * Resize an image URL to fit within max dimensions.
 * Uses canvas to downscale, returns a data URL.
 * Preserves aspect ratio. No-op if already within limits.
 */
export async function resizeImageForModel(
  imageUrl: string,
  maxWidth = 1024,
  maxHeight = 1024,
  maxBytes = 5_000_000,
): Promise<string> {
  // Load the image
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for resize"));
    img.src = imageUrl;
  });

  // Check if resize is needed
  if (img.naturalWidth <= maxWidth && img.naturalHeight <= maxHeight) {
    // Still might be too large in bytes — check by fetching
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      if (blob.size <= maxBytes) return imageUrl; // already fine
    } catch {
      // Can't check size — resize anyway to be safe
    }
  }

  // Calculate target dimensions (preserve aspect ratio)
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
  if (h > maxHeight) { w = Math.round(w * (maxHeight / h)); h = maxHeight; }

  // Draw to canvas
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(img, 0, 0, w, h);

  // Export as JPEG (smaller than PNG, good enough for video input)
  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  // If still too large, reduce quality
  while (dataUrl.length * 0.75 > maxBytes && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  return dataUrl;
}
