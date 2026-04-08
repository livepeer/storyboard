"use client";

import type { ChatMessage } from "@/lib/chat/store";
import { RatingWidget } from "./RatingWidget";

const roleStyles: Record<string, string> = {
  user: "self-end bg-white/[0.08] text-[var(--text)]",
  agent: "self-start bg-transparent text-[var(--text-muted)]",
  system: "self-center font-mono text-[10px] text-[var(--text-dim)]",
};

// Detect rating prompts like "[rate:ref_id:capability:prompt]"
const RATING_RE = /\[rate:([^:]+):([^:]*):([^\]]*)\]/;

export function MessageBubble({ message }: { message: ChatMessage }) {
  const ratingMatch = message.role === "agent" ? RATING_RE.exec(message.text) : null;

  return (
    <div
      className={`max-w-[90%] break-words rounded-lg px-3 py-2 text-xs ${
        roleStyles[message.role] || roleStyles.agent
      }`}
    >
      {ratingMatch ? (
        <>
          {message.text.replace(RATING_RE, "").trim()}
          <div className="mt-1">
            <RatingWidget
              refId={ratingMatch[1]}
              capability={ratingMatch[2]}
              prompt={ratingMatch[3]}
            />
          </div>
        </>
      ) : (
        message.text
      )}
    </div>
  );
}
