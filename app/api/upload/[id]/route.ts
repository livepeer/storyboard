/**
 * Serve uploaded files from the in-memory store.
 * Handles GET /api/upload/{id} — returns the file with correct content type.
 */

import { memoryStore } from "../route";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entry = memoryStore.get(id);
  if (!entry) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(entry.data), {
    headers: {
      "Content-Type": entry.contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
