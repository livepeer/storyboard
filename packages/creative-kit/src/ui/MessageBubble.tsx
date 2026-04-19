"use client";

import React, { useCallback, type ReactNode } from "react";
import type { ChatMessage } from "../interfaces/chat-bus";

export interface MessageBubbleProps {
  message: ChatMessage;
  children?: ReactNode;
}

const isError = (text: string) =>
  /\b(failed|error|blocked)\b/i.test(text);

const isSlashCommand = (text: string) => /^\s*\/\w/.test(text);

export function MessageBubble({ message, children }: MessageBubbleProps) {
  const { role, text } = message;

  const handleClick = useCallback(() => {
    if (role === "user" || role === "agent") {
      navigator.clipboard.writeText(text).catch(() => undefined);
    }
  }, [role, text]);

  if (role === "system") {
    return (
      <div
        style={{
          textAlign: "center",
          fontSize: 11,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.35)",
          padding: "2px 0",
        }}
      >
        {children ?? text}
      </div>
    );
  }

  const isUser = role === "user";
  const hasError = isError(text);
  const isCmd = isSlashCommand(text);

  const borderColor = hasError
    ? "#ef4444"
    : isCmd
    ? "#3b82f6"
    : "transparent";

  const background = hasError
    ? "rgba(239,68,68,0.12)"
    : isUser
    ? "rgba(255,255,255,0.08)"
    : isCmd
    ? "rgba(59,130,246,0.08)"
    : "transparent";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        padding: "2px 0",
      }}
    >
      <div
        onClick={handleClick}
        title="Click to copy"
        style={{
          maxWidth: "85%",
          padding: "6px 10px",
          borderRadius: 8,
          border: `1px solid ${borderColor}`,
          background,
          color: hasError ? "#fca5a5" : "rgba(255,255,255,0.88)",
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          cursor: "pointer",
        }}
      >
        {children ?? text}
      </div>
    </div>
  );
}
