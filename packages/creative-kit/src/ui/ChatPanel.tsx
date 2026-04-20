"use client";

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import type { ChatMessage } from "../interfaces/chat-bus";
import { MessageBubble } from "./MessageBubble";

export interface ChatPanelProps {
  messages: ChatMessage[];
  isProcessing?: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
  cardRenderers?: Record<string, (text: string) => ReactNode>;
  children?: ReactNode;
}

export function ChatPanel({
  messages,
  isProcessing = false,
  onSend,
  placeholder = "Type a message…",
  cardRenderers,
  children,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isProcessing]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSend(text);
  }, [draft, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  const renderMessage = (msg: ChatMessage): ReactNode => {
    // Check cardRenderers for any matching key — render directly (no bubble wrapper)
    if (cardRenderers) {
      for (const [key, renderer] of Object.entries(cardRenderers)) {
        if (msg.text.includes(key)) {
          return <React.Fragment key={msg.id}>{renderer(msg.text)}</React.Fragment>;
        }
      }
    }
    return <MessageBubble key={msg.id} message={msg} />;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {messages.map(renderMessage)}
        {isProcessing && (
          <div
            style={{
              alignSelf: "flex-start",
              fontSize: 12,
              color: "rgba(255,255,255,0.4)",
              padding: "4px 10px",
              fontStyle: "italic",
            }}
          >
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {children}

      {/* Input area */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "8px 10px",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            padding: "7px 10px",
            color: "rgba(255,255,255,0.9)",
            fontSize: 13,
            outline: "none",
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: "auto",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={send}
          disabled={!draft.trim() || isProcessing}
          style={{
            padding: "7px 14px",
            borderRadius: 6,
            border: "none",
            background: draft.trim() && !isProcessing ? "#3b82f6" : "rgba(59,130,246,0.3)",
            color: "#fff",
            cursor: draft.trim() && !isProcessing ? "pointer" : "not-allowed",
            fontSize: 13,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
