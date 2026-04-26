"use client";
import { useCanvasStore } from "@/lib/canvas/store";

const MARKER = "@@focusable@@";
const END = "@@/focusable@@";

export function hasFocusableLinks(text: string): boolean {
  return text.includes(MARKER);
}

export function FocusableText({ text }: { text: string }) {
  // Split text on @@focusable@@{...}@@/focusable@@ and render links
  const parts: Array<{ type: "text" | "link"; content: string; name?: string; cardIds?: string[] }> = [];
  let remaining = text;
  while (remaining.includes(MARKER)) {
    const start = remaining.indexOf(MARKER);
    if (start > 0) parts.push({ type: "text", content: remaining.slice(0, start) });
    const jsonStart = start + MARKER.length;
    const end = remaining.indexOf(END, jsonStart);
    if (end === -1) { parts.push({ type: "text", content: remaining.slice(start) }); break; }
    try {
      const data = JSON.parse(remaining.slice(jsonStart, end));
      parts.push({ type: "link", content: data.name, name: data.name, cardIds: data.cardIds });
    } catch { parts.push({ type: "text", content: remaining.slice(start, end + END.length) }); }
    remaining = remaining.slice(end + END.length);
  }
  if (remaining) parts.push({ type: "text", content: remaining });

  return (
    <span>
      {parts.map((p, i) => p.type === "link" ? (
        <button key={i} onClick={() => {
          if (p.cardIds?.length) {
            useCanvasStore.getState().fitCards(p.cardIds, window.innerWidth, window.innerHeight);
            useCanvasStore.getState().selectCards(p.cardIds.slice(0, 20));
          }
        }} style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", textDecoration: "underline", fontSize: "inherit", fontFamily: "inherit", padding: 0 }}>
          {p.content}
        </button>
      ) : <span key={i}>{p.content}</span>)}
    </span>
  );
}
