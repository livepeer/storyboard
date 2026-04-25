/**
 * Discord Bot helpers — thin wrapper around the Discord API.
 *
 * Uses webhook-based interactions (no gateway/WebSocket needed).
 * Works with Discord Interactions endpoint for slash commands,
 * and bot token for sending messages/files.
 */

const DISCORD_API = "https://discord.com/api/v10";

export async function sendMessage(
  token: string,
  channelId: string,
  text: string,
): Promise<void> {
  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  });
}

export async function sendEmbed(
  token: string,
  channelId: string,
  opts: { title?: string; description?: string; imageUrl?: string; color?: number },
): Promise<void> {
  const embed: Record<string, unknown> = {};
  if (opts.title) embed.title = opts.title;
  if (opts.description) embed.description = opts.description;
  if (opts.imageUrl) embed.image = { url: opts.imageUrl };
  if (opts.color) embed.color = opts.color;

  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

/** Reply to an interaction (slash command / button click). */
export async function interactionReply(
  interactionId: string,
  interactionToken: string,
  text: string,
  ephemeral = false,
): Promise<void> {
  await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: { content: text, flags: ephemeral ? 64 : 0 },
    }),
  });
}

/** Deferred reply — tells Discord "I'm working on it" (gives 15 min to respond). */
export async function interactionDefer(
  interactionId: string,
  interactionToken: string,
): Promise<void> {
  await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 5 }), // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  });
}

/** Follow-up message after deferring. */
export async function interactionFollowup(
  appId: string,
  interactionToken: string,
  text: string,
  embeds?: Array<Record<string, unknown>>,
): Promise<void> {
  await fetch(`${DISCORD_API}/webhooks/${appId}/${interactionToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, embeds }),
  });
}

/** Register global slash commands for the bot. */
export async function registerCommands(
  appId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const commands = [
    { name: "create", description: "Generate an image from a prompt", options: [{ name: "prompt", description: "What to create", type: 3, required: true }] },
    { name: "compare", description: "Compare 4 AI models side by side", options: [{ name: "prompt", description: "What to compare", type: 3, required: true }] },
    { name: "vary", description: "Generate 4 variations", options: [{ name: "prompt", description: "What to vary", type: 3, required: true }] },
    { name: "styles", description: "Same prompt in 4 art styles", options: [{ name: "prompt", description: "Subject to style", type: 3, required: true }] },
    { name: "video", description: "Generate a video clip", options: [{ name: "prompt", description: "Video description", type: 3, required: true }] },
    { name: "music", description: "Generate music", options: [{ name: "prompt", description: "Music description", type: 3, required: true }] },
    { name: "models", description: "List available AI models" },
    { name: "help", description: "Show all commands" },
  ];

  const resp = await fetch(`${DISCORD_API}/applications/${appId}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { ok: false, error: err.slice(0, 200) };
  }
  return { ok: true };
}

/** Verify Discord interaction signature (Ed25519). */
export async function verifyInteraction(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    // Ed25519 types are not fully stable in all TS versions — use any escape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subtle = crypto.subtle as any;
    const encoder = new TextEncoder();
    const key = await subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await subtle.verify("Ed25519", key, hexToBytes(signature), encoder.encode(timestamp + body));
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
