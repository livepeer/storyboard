/**
 * Telegram Bot setup — register/unregister webhook.
 *
 * POST: { action: "register", token, webhookUrl } or { action: "unregister", token }
 * GET: check status
 */
import { NextRequest, NextResponse } from "next/server";
import { setWebhook, deleteWebhook, getMe } from "@/lib/telegram/bot";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, token, webhookUrl } = body as {
    action: "register" | "unregister" | "test";
    token: string;
    webhookUrl?: string;
  };

  if (!token) {
    return NextResponse.json({ ok: false, error: "Token required" }, { status: 400 });
  }

  if (action === "test") {
    const me = await getMe(token);
    return NextResponse.json(me);
  }

  if (action === "register") {
    if (!webhookUrl) {
      return NextResponse.json({ ok: false, error: "webhookUrl required" }, { status: 400 });
    }
    const result = await setWebhook(token, webhookUrl);
    return NextResponse.json(result);
  }

  if (action === "unregister") {
    const result = await deleteWebhook(token);
    return NextResponse.json(result);
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
