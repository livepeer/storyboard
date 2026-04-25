/**
 * Telegram Bot helpers — thin wrapper around the Bot API.
 */

const TG_API = "https://api.telegram.org/bot";

export function tgUrl(token: string, method: string): string {
  return `${TG_API}${token}/${method}`;
}

export async function sendMessage(token: string, chatId: number | string, text: string): Promise<void> {
  // Try Markdown first, fallback to plain text if Telegram rejects it
  const resp = await fetch(tgUrl(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  if (!resp.ok) {
    // Markdown failed (unbalanced * or _) — retry as plain text
    await fetch(tgUrl(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}

export async function sendPhoto(token: string, chatId: number | string, photoUrl: string, caption?: string): Promise<void> {
  await fetch(tgUrl(token, "sendPhoto"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption?.slice(0, 200) }),
  });
}

export async function sendVideo(token: string, chatId: number | string, videoUrl: string, caption?: string): Promise<void> {
  await fetch(tgUrl(token, "sendVideo"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, video: videoUrl, caption: caption?.slice(0, 200) }),
  });
}

export async function setWebhook(token: string, webhookUrl: string): Promise<{ ok: boolean; description?: string }> {
  const resp = await fetch(tgUrl(token, "setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  return resp.json();
}

export async function deleteWebhook(token: string): Promise<{ ok: boolean }> {
  const resp = await fetch(tgUrl(token, "deleteWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return resp.json();
}

export async function getMe(token: string): Promise<{ ok: boolean; result?: { username: string; first_name: string } }> {
  const resp = await fetch(tgUrl(token, "getMe"));
  return resp.json();
}

/** Send a message with inline keyboard buttons. */
export async function sendMessageWithButtons(
  token: string,
  chatId: number | string,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
): Promise<void> {
  await fetch(tgUrl(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    }),
  });
}

/** Answer a callback query (button click). */
export async function answerCallback(token: string, callbackId: string, text?: string): Promise<void> {
  await fetch(tgUrl(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

/** Register bot commands menu. */
export async function setCommands(token: string): Promise<void> {
  await fetch(tgUrl(token, "setMyCommands"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Welcome + quick start" },
        { command: "help", description: "All commands and tips" },
        { command: "compare", description: "Compare AI models side by side" },
        { command: "vary", description: "Generate 4 variations" },
        { command: "styles", description: "Same prompt in 4 styles" },
        { command: "models", description: "List available AI models" },
        { command: "video", description: "Generate a video clip" },
        { command: "music", description: "Generate music" },
      ],
    }),
  });
}
