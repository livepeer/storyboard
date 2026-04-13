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

/** Download multiple cards as a single ZIP file */
export async function downloadCards(cards: Card[]): Promise<{ ok: number; fail: number }> {
  const savable = cards.filter((c) => c.url);
  if (savable.length === 0) return { ok: 0, fail: cards.length };

  // Single card — download directly
  if (savable.length === 1) {
    const success = await downloadCard(savable[0]);
    return { ok: success ? 1 : 0, fail: success ? 0 : 1 };
  }

  // Multiple cards — bundle into a ZIP
  // Build ZIP using minimal ZIP format (no compression, just store)
  try {
    const files: Array<{ name: string; data: Uint8Array }> = [];
    let ok = 0;
    let fail = 0;

    for (const card of savable) {
      try {
        const resp = await fetch(card.url!);
        if (!resp.ok) { fail++; continue; }
        const blob = await resp.blob();
        const buffer = await blob.arrayBuffer();
        files.push({ name: buildFilename(card), data: new Uint8Array(buffer) });
        ok++;
      } catch {
        fail++;
      }
    }

    if (files.length > 0) {
      const zip = buildZip(files);
      const blob = new Blob([zip as unknown as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `storyboard-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    return { ok, fail };
  } catch {
    // Fallback: download first card only
    const success = await downloadCard(savable[0]);
    return { ok: success ? 1 : 0, fail: savable.length - (success ? 1 : 0) };
  }
}

/** Minimal ZIP builder (store method, no compression — fast and dependency-free) */
function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const entries: Array<{ offset: number; nameBytes: Uint8Array; data: Uint8Array; crc: number }> = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);

    // Local file header (30 bytes + name + data)
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // signature
    view.setUint16(4, 20, true);          // version needed
    view.setUint16(6, 0, true);           // flags
    view.setUint16(8, 0, true);           // compression (store)
    view.setUint16(10, 0, true);          // mod time
    view.setUint16(12, 0, true);          // mod date
    view.setUint32(14, crc, true);        // crc32
    view.setUint32(18, file.data.length, true); // compressed size
    view.setUint32(22, file.data.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true); // name length
    view.setUint16(28, 0, true);          // extra length
    header.set(nameBytes, 30);

    entries.push({ offset, nameBytes, data: file.data, crc });
    parts.push(header, file.data);
    offset += header.length + file.data.length;
  }

  // Central directory
  const centralStart = offset;
  for (const entry of entries) {
    const cd = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(cd.buffer);
    view.setUint32(0, 0x02014b50, true);  // signature
    view.setUint16(4, 20, true);           // version made by
    view.setUint16(6, 20, true);           // version needed
    view.setUint16(8, 0, true);            // flags
    view.setUint16(10, 0, true);           // compression
    view.setUint16(12, 0, true);           // mod time
    view.setUint16(14, 0, true);           // mod date
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.data.length, true);
    view.setUint32(24, entry.data.length, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true);           // extra length
    view.setUint16(32, 0, true);           // comment length
    view.setUint16(34, 0, true);           // disk number
    view.setUint16(36, 0, true);           // internal attrs
    view.setUint32(38, 0, true);           // external attrs
    view.setUint32(42, entry.offset, true);
    cd.set(entry.nameBytes, 46);
    parts.push(cd);
    offset += cd.length;
  }

  // End of central directory
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, offset - centralStart, true);
  endView.setUint32(16, centralStart, true);
  endView.setUint16(20, 0, true);
  parts.push(end);

  // Concatenate
  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  return result;
}

/** CRC32 for ZIP */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Get cards that can be saved (have a URL) */
export function getSavableCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.url && !c.error);
}
