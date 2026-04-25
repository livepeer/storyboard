/**
 * Discord adapter — webhook for Discord Interactions (slash commands).
 * Thin layer over the shared Bot Engine.
 *
 * Setup:
 *   1. Create app at discord.com/developers
 *   2. Set env: DISCORD_APP_ID, DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY
 *   3. Set Interactions Endpoint URL to: https://your-domain/api/discord
 *   4. POST /api/discord/setup to register slash commands
 */
import { NextRequest, NextResponse } from "next/server";
import { createBotEngine, type BotAction } from "@/lib/bot/engine";
import {
  verifyInteraction,
  interactionDefer,
  interactionFollowup,
  sendEmbed,
} from "@/lib/discord/bot";

const getAppId = () => process.env.DISCORD_APP_ID || "";
const getBotToken = () => process.env.DISCORD_BOT_TOKEN || "";
const getPublicKey = () => process.env.DISCORD_PUBLIC_KEY || "";
const getConfig = () => ({
  sdkUrl: process.env.LIVEPEER_SDK_URL || process.env.NEXT_PUBLIC_SDK_URL || "https://sdk.daydream.monster",
  sdkKey: process.env.LIVEPEER_API_KEY || process.env.DAYDREAM_API_KEY || "",
});

/** Deliver BotActions as Discord follow-up messages. */
async function deliver(appId: string, interactionToken: string, botToken: string, channelId: string, actions: BotAction[]) {
  for (const a of actions) {
    switch (a.type) {
      case "text":
        await interactionFollowup(appId, interactionToken, a.text || "");
        break;
      case "photo":
        if (a.url) {
          await interactionFollowup(appId, interactionToken, "", [
            { image: { url: a.url }, description: a.caption, color: 0x6366f1 },
          ]);
        }
        break;
      case "video":
        // Discord embeds don't auto-play video — send as link
        await interactionFollowup(appId, interactionToken, `🎬 ${a.caption || "Video"}: ${a.url}`);
        break;
      case "audio":
        await interactionFollowup(appId, interactionToken, `🎵 ${a.caption || "Audio"}: ${a.url}`);
        break;
      case "buttons":
        // Discord uses components — simplified to text for now
        await interactionFollowup(appId, interactionToken, a.text || "");
        break;
    }
  }
}

export async function POST(req: NextRequest) {
  const publicKey = getPublicKey();
  const rawBody = await req.text();

  // Verify signature (required by Discord)
  if (publicKey) {
    const sig = req.headers.get("x-signature-ed25519") || "";
    const ts = req.headers.get("x-signature-timestamp") || "";
    const valid = await verifyInteraction(publicKey, sig, ts, rawBody);
    if (!valid) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  const body = JSON.parse(rawBody);

  // Discord PING verification (type 1)
  if (body.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Slash command (type 2)
  if (body.type === 2) {
    const appId = getAppId();
    const botToken = getBotToken();
    const commandName = body.data?.name;
    const options = body.data?.options || [];
    const prompt = options.find((o: { name: string }) => o.name === "prompt")?.value || "";
    const channelId = body.channel_id;
    const interactionId = body.id;
    const interactionToken = body.token;

    // Defer immediately (generation takes time)
    await interactionDefer(interactionId, interactionToken);

    // Map Discord slash command → bot engine text
    let engineInput = prompt;
    if (commandName === "create") engineInput = prompt;
    else if (commandName && commandName !== "create") engineInput = `/${commandName} ${prompt}`.trim();

    const engine = createBotEngine(getConfig());
    const response = await engine.handle(engineInput);
    await deliver(appId, interactionToken, botToken, channelId, response.actions);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
