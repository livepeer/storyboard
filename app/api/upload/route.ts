/**
 * Upload API — accepts base64 image/video data and uploads to GCP
 * Cloud Storage, returning a public URL that the BYOC orch can fetch.
 *
 * Why: imported local files are stored as data URLs (base64) which
 * the BYOC orch can't download. This route converts them to public
 * HTTP URLs via GCP Cloud Storage.
 *
 * Env vars:
 *   GCS_BUCKET — bucket name (default: storyboard-uploads)
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service account key
 *     (or use default credentials on GCP VMs)
 *
 * Fallback: if GCS is not configured, stores in-memory and serves
 * via /api/upload/[id] (works for localhost dev, not production).
 */

// In-memory fallback store (dev only — cleared on server restart)
const memoryStore = new Map<string, { data: Buffer; contentType: string }>();

export async function POST(req: Request) {
  const { dataUrl, fileName } = (await req.json()) as {
    dataUrl: string;
    fileName?: string;
  };

  if (!dataUrl) {
    return Response.json({ error: "dataUrl is required" }, { status: 400 });
  }

  // Parse data URL → Buffer
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return Response.json({ error: "Invalid data URL format" }, { status: 400 });
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = contentType.split("/")[1]?.split("+")[0] || "bin";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Try GCP Cloud Storage
  const bucket = process.env.GCS_BUCKET;
  if (bucket) {
    try {
      // Use GCS JSON API directly (no SDK needed)
      const token = process.env.GCS_ACCESS_TOKEN || "";
      const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=uploads/${id}`;
      const gcsResp = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: buffer,
      });
      if (gcsResp.ok) {
        const publicUrl = `https://storage.googleapis.com/${bucket}/uploads/${id}`;
        return Response.json({ url: publicUrl, id });
      }
      console.warn("[Upload] GCS upload failed:", gcsResp.status, await gcsResp.text().catch(() => ""));
    } catch (e) {
      console.warn("[Upload] GCS upload failed, falling back to memory:", e);
    }
  }

  // Fallback: in-memory store with local URL
  memoryStore.set(id, { data: buffer, contentType });
  // Clean up old entries (keep last 50)
  if (memoryStore.size > 50) {
    const oldest = memoryStore.keys().next().value;
    if (oldest) memoryStore.delete(oldest);
  }

  const origin = req.headers.get("origin") || req.headers.get("host") || "http://localhost:3000";
  const protocol = origin.startsWith("http") ? "" : "http://";
  const url = `${protocol}${origin}/api/upload/${id}`;
  return Response.json({ url, id, storage: "memory" });
}

// Serve in-memory files
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();
  if (!id || !memoryStore.has(id)) {
    return new Response("Not found", { status: 404 });
  }
  const { data, contentType } = memoryStore.get(id)!;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
