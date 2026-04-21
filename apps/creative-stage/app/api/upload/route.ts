/**
 * Upload — accepts { dataUrl, fileName } and returns { url }.
 * Proxies to the storyboard SDK upload if STORYBOARD_URL is set,
 * otherwise returns the data URL directly.
 */

export async function POST(req: Request) {
  const { dataUrl, fileName } = (await req.json()) as { dataUrl: string; fileName: string };
  if (!dataUrl) return Response.json({ error: "No dataUrl" }, { status: 400 });

  // Try proxy to storyboard's upload endpoint (which has GCS)
  const storyboardUrl = process.env.STORYBOARD_URL || "http://localhost:3000";
  try {
    const resp = await fetch(`${storyboardUrl}/api/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, fileName }),
    });
    if (resp.ok) {
      const result = await resp.json();
      if (result.url?.startsWith("https://")) return Response.json(result);
    }
  } catch { /* storyboard not available */ }

  // Fallback: return data URL directly
  return Response.json({ url: dataUrl });
}
