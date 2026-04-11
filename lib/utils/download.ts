/**
 * Download utilities for saving cards as files.
 */

import type { Card } from "@/lib/canvas/types";

/** File extension from URL or card type */
function getExtension(url: string, type: string): string {
  // Try to extract from URL path
  const urlPath = url.split("?")[0];
  const match = urlPath.match(/\.(\w{2,5})$/);
  if (match) return match[1];

  // Fallback by type
  switch (type) {
    case "image": return "png";
    case "video": return "mp4";
    case "audio": return "mp3";
    default: return "bin";
  }
}

/** Build a clean filename from card title and refId */
function buildFilename(card: Card): string {
  const clean = card.title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 40);
  const ext = card.url ? getExtension(card.url, card.type) : "png";
  return `${card.refId}-${clean}.${ext}`;
}

/** Download a single card's media as a file */
export async function downloadCard(card: Card): Promise<boolean> {
  if (!card.url) return false;

  try {
    const resp = await fetch(card.url);
    if (!resp.ok) return false;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildFilename(card);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Download multiple cards as individual files (sequential to avoid browser blocking) */
export async function downloadCards(cards: Card[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  for (const card of cards) {
    if (!card.url) { fail++; continue; }
    const success = await downloadCard(card);
    if (success) ok++;
    else fail++;
    // Small delay to avoid browser popup blockers
    if (cards.length > 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return { ok, fail };
}

/** Get cards that can be saved (have a URL) */
export function getSavableCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.url && !c.error);
}
