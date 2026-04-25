/**
 * Discord setup — register slash commands.
 * POST with { appId, token } to register all commands globally.
 */
import { NextRequest, NextResponse } from "next/server";
import { registerCommands } from "@/lib/discord/bot";

export async function POST(req: NextRequest) {
  const { appId, token } = await req.json() as { appId?: string; token?: string };
  const finalAppId = appId || process.env.DISCORD_APP_ID || "";
  const finalToken = token || process.env.DISCORD_BOT_TOKEN || "";

  if (!finalAppId || !finalToken) {
    return NextResponse.json({ ok: false, error: "appId and token required" }, { status: 400 });
  }

  const result = await registerCommands(finalAppId, finalToken);
  return NextResponse.json(result);
}
