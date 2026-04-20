/**
 * Resize an image URL to fit within max dimensions for video model input.
 * Uses canvas to downscale, then uploads to get a public HTTP URL.
 * Preserves aspect ratio. No-op if already within limits AND already HTTP.
 *
 * @param uploadUrl - endpoint that accepts {dataUrl, fileName} POST and returns {url}
 */
export async function resizeImageForModel(
  imageUrl: string,
  opts: {
    maxWidth?: number;
    maxHeight?: number;
    maxBytes?: number;
    /** Upload endpoint URL. If provided, uploads resized result to get public HTTP URL. */
    uploadUrl?: string;
  } = {},
): Promise<string> {
  const maxWidth = opts.maxWidth ?? 1024;
  const maxHeight = opts.maxHeight ?? 1024;
  const maxBytes = opts.maxBytes ?? 5_000_000;

  // Load the image
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for resize"));
    img.src = imageUrl;
  });

  // Check if resize is needed
  const fitsInDimensions = img.naturalWidth <= maxWidth && img.naturalHeight <= maxHeight;
  const isHttpUrl = imageUrl.startsWith("http://") || imageUrl.startsWith("https://");

  if (fitsInDimensions && isHttpUrl) {
    // Check byte size
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      if (blob.size <= maxBytes) return imageUrl; // already fine
    } catch {
      // Can't check size — resize to be safe
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

  // Export as JPEG
  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length * 0.75 > maxBytes && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  // Upload to get a public HTTP URL that fal.ai can download
  const uploadEndpoint = opts.uploadUrl || "/api/upload";
  try {
    const resp = await fetch(uploadEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, fileName: `resized-${Date.now()}.jpg` }),
    });
    if (resp.ok) {
      const { url } = (await resp.json()) as { url: string };
      if (url && url.startsWith("http")) return url;
    }
  } catch {
    // Upload failed — fall through to data URL
  }

  // Fallback: return data URL (SDK may accept it via image_data path)
  return dataUrl;
}
