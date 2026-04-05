"use client";

import type { ChatMessage } from "@/lib/chat/store";

const roleStyles: Record<string, string> = {
  user: "self-end bg-white/[0.08] text-[var(--text)]",
  agent: "self-start bg-transparent text-[var(--text-muted)]",
  system: "self-center font-mono text-[10px] text-[var(--text-dim)]",
};

export function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div
      className={`max-w-[90%] break-words rounded-lg px-3 py-2 text-xs ${
        roleStyles[message.role] || roleStyles.agent
      }`}
    >
      {message.text}
    </div>
  );
}
