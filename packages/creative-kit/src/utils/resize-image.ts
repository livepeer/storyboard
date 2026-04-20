/**
 * Resize an image URL to fit within max dimensions for video model input.
 * Fetches the image, resizes via canvas, uploads to get a public HTTP URL.
 * Handles cross-origin images (no tainted canvas), blob: URLs, data: URLs.
 *
 * Returns a public HTTPS URL that remote services (fal.ai) can download.
 * Falls back to the original URL if everything fails.
 */
export async function resizeImageForModel(
  imageUrl: string,
  opts: {
    maxWidth?: number;
    maxHeight?: number;
    maxBytes?: number;
    uploadUrl?: string;
  } = {},
): Promise<string> {
  const maxWidth = opts.maxWidth ?? 1024;
  const maxHeight = opts.maxHeight ?? 1024;
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const uploadEndpoint = opts.uploadUrl || "/api/upload";

  const isHttp = imageUrl.startsWith("http://") || imageUrl.startsWith("https://");
  const isData = imageUrl.startsWith("data:");

  // Step 1: Get the image as a Blob
  let blob: Blob;
  try {
    if (isData) {
      // data: URL → decode to blob
      const parts = imageUrl.split(",");
      const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
      const binary = atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: mime });
    } else {
      // HTTP or blob URL — fetch it
      const resp = await fetch(imageUrl);
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
      blob = await resp.blob();
    }
  } catch (e) {
    // Can't fetch the image — return original and hope for the best
    console.warn("[resizeImageForModel] Can't fetch source:", (e as Error).message);
    return imageUrl;
  }

  // Step 2: Check if resize is needed
  const needsResize = blob.size > maxBytes;

  // Step 3: Create a local object URL from the blob (avoids CORS/tainted canvas)
  const localUrl = URL.createObjectURL(blob);
  try {
    // Load into Image from the local object URL (always same-origin, never tainted)
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = localUrl;
    });

    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const oversized = w > maxWidth || h > maxHeight;

    // If already HTTP, right size, and right file size — return as-is
    if (isHttp && !oversized && !needsResize) {
      return imageUrl;
    }

    // Step 4: Resize via canvas
    if (oversized) {
      if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
      if (h > maxHeight) { w = Math.round(w * (maxHeight / h)); h = maxHeight; }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

    // Step 5: Export as JPEG, reduce quality if too large
    let quality = 0.85;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length * 0.75 > maxBytes && quality > 0.3) {
      quality -= 0.15;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }

    // Step 6: Upload to get public HTTPS URL
    try {
      const resp = await fetch(uploadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, fileName: `resized-${Date.now()}.jpg` }),
      });
      if (resp.ok) {
        const { url } = (await resp.json()) as { url: string };
        if (url?.startsWith("http")) return url;
      }
    } catch {
      // Upload failed
    }

    // Fallback: if original was HTTP and just needed resize, return the data URL
    // (SDK may handle it via image_data)
    return isHttp ? imageUrl : dataUrl;
  } finally {
    URL.revokeObjectURL(localUrl);
  }
}
