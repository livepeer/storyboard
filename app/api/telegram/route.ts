/**
 * Telegram adapter — thin layer over the shared Bot Engine.
 * Translates Telegram webhook events → BotEngine → Telegram API responses.
 *
 * To add Discord/Slack/WhatsApp: create a new adapter that imports
 * createBotEngine and translates their webhook format the same way.
 */
import { NextRequest, NextResponse } from "next/server";
import { createBotEngine, type BotAction } from "@/lib/bot/engine";
import {
  sendMessage, sendPhoto, sendVideo,
  sendMessageWithButtons, answerCallback, setCommands,
} from "@/lib/telegram/bot";

// Bot config can come from env vars (production) or query params (UI setup).
// The Settings UI registers the webhook with token+key in the URL so the
// server-side handler can use them without Vercel env vars.
function getConfigFromReq(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  return {
    token: params.get("t") || process.env.TELEGRAM_BOT_TOKEN || "",
    sdkUrl: process.env.LIVEPEER_SDK_URL || process.env.NEXT_PUBLIC_SDK_URL || "https://sdk.daydream.monster",
    sdkKey: params.get("k") || process.env.LIVEPEER_API_KEY || process.env.DAYDREAM_API_KEY || "",
  };
}

/** Send BotActions to a Telegram chat. */
async function deliver(token: string, chatId: number | string, actions: BotAction[]) {
  for (const a of actions) {
    switch (a.type) {
      case "text":
        await sendMessage(token, chatId, a.text || "");
        break;
      case "photo":
        if (a.url) await sendPhoto(token, chatId, a.url, a.caption);
        break;
      case "video":
        if (a.url) await sendVideo(token, chatId, a.url, a.caption);
        break;
      case "audio":
        if (a.url) {
          await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, audio: a.url, title: a.caption }),
          });
        }
        break;
      case "buttons":
        if (a.buttons) {
          const keyboard = a.buttons.map((row) =>
            row.map((b) => ({ text: b.label, callback_data: b.data }))
          );
          await sendMessageWithButtons(token, chatId, a.text || "Choose:", keyboard);
        }
        break;
    }
  }
}

export async function POST(req: NextRequest) {
  const cfg = getConfigFromReq(req);
  console.log(`[Telegram] Webhook: token=${cfg.token ? cfg.token.slice(0, 8) + "..." : "NONE"}, key=${cfg.sdkKey ? cfg.sdkKey.slice(0, 6) + "..." : "NONE"}, url=${req.nextUrl.toString().slice(0, 100)}`);
  if (!cfg.token) return NextResponse.json({ ok: false, error: "No bot token" });

  const token = cfg.token;
  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // malformed body — ignore
  }
  const engine = createBotEngine({ sdkUrl: cfg.sdkUrl, sdkKey: cfg.sdkKey });

  // ── Callback query (button click) ──
  if (update.callback_query) {
    const cb = update.callback_query as Record<string, unknown>;
    const cbMsg = cb.message as Record<string, unknown> | undefined;
    const cbChat = cbMsg?.chat as Record<string, unknown> | undefined;
    const chatId = cbChat?.id as number | undefined;
    if (chatId) {
      await answerCallback(token, cb.id as string, "Working...");
      const response = await engine.handleCallback((cb.data as string) || "");
      await deliver(token, chatId, response.actions);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Voice message → transcribe placeholder ──
  const rawMsg = update.message as Record<string, unknown> | undefined;
  if (rawMsg?.voice) {
    const chatId = (rawMsg.chat as Record<string, unknown>)?.id as number;
    await sendMessage(token, chatId,
      "🎤 Voice received! Voice-to-creation coming soon.\n" +
      "For now, type your prompt or use /help for commands."
    );
    return NextResponse.json({ ok: true });
  }

  // ── Text message ──
  const msg = update.message as { text?: string; chat?: { id: number } } | undefined;
  if (!msg?.text || !msg?.chat?.id) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;

  try {
    // Register commands menu on first /start
    if (msg.text.trim() === "/start") {
      await setCommands(token).catch(() => {});
    }

    const response = await engine.handle(msg.text);
    await deliver(token, chatId, response.actions);
  } catch (e) {
    // Always return 200 to prevent Telegram retry storms
    console.error("[Telegram] Handler error:", (e as Error).message);
    await sendMessage(token, chatId, `Error: ${(e as Error).message?.slice(0, 100) || "unknown"}`).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
