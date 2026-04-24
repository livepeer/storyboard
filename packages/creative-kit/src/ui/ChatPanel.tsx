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
  /** Activity text shown with spinner (e.g. "Generating scenes…", "Starting stream…") */
  activityText?: string | null;
  onSend: (text: string) => void;
  placeholder?: string;
  cardRenderers?: Record<string, (text: string) => ReactNode>;
  children?: ReactNode;
}

export function ChatPanel({
  messages,
  isProcessing = false,
  activityText,
  onSend,
  placeholder = "Type a message…",
  cardRenderers,
  children,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
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
        {(isProcessing || activityText) && (
          <div
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <span style={{
              display: "inline-block", width: 10, height: 10, borderRadius: "50%",
              border: "2px solid rgba(129,140,248,0.3)", borderTopColor: "rgba(129,140,248,0.8)",
              animation: "spin 1s linear infinite",
            }} />
            <span>{activityText || "Thinking…"}</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
          gap: 6,
          alignItems: "flex-end",
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            // Auto-resize
            const ta = e.target;
            ta.style.height = "auto";
            ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
          }}
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
        {/* Expand button */}
        <button
          onClick={() => setExpanded(true)}
          title="Expand editor for long prompts"
          style={{
            padding: "7px 8px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "transparent",
            color: "rgba(255,255,255,0.4)",
            cursor: "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2H3a1 1 0 00-1 1v3M10 2h3a1 1 0 011 1v3M6 14H3a1 1 0 01-1-1v-3M10 14h3a1 1 0 001-1v-3" />
          </svg>
        </button>
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

      {/* Expanded editor modal */}
      {expanded && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}
        >
          <div style={{
            width: "90vw", maxWidth: 700,
            display: "flex", flexDirection: "column",
            borderRadius: 16, overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(20,20,20,0.98)",
            boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              padding: "12px 16px",
            }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>
                Compose Prompt
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                {draft.length > 0 ? `${draft.split(/\s+/).filter(Boolean).length} words` : ""}
              </span>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 4, border: "none", background: "transparent",
                  color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
            {/* Editor */}
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  setExpanded(false);
                  send();
                }
                if (e.key === "Escape") setExpanded(false);
              }}
              placeholder={`Paste your full creative brief or multi-scene prompt here...\n\nExample:\nCreate a 6-scene journey showing...\nScene 1 — Dawn in the mountains\nScene 2 — River at midday\n...`}
              style={{
                minHeight: 300, maxHeight: "60vh", flex: 1, resize: "vertical",
                background: "transparent", border: "none", outline: "none",
                padding: "12px 16px", fontSize: 14, lineHeight: 1.6,
                color: "rgba(255,255,255,0.9)", fontFamily: "inherit",
              }}
            />
            {/* Footer */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              padding: "12px 16px",
            }}>
              <span style={{ flex: 1, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                {draft.length > 500 ? "Long prompt — will be auto-structured" : ""}
                {" "}Cmd+Enter to send · Esc to close
              </span>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  padding: "6px 12px", borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "transparent", color: "rgba(255,255,255,0.5)",
                  cursor: "pointer", fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setExpanded(false); send(); }}
                disabled={!draft.trim() || isProcessing}
                style={{
                  padding: "6px 16px", borderRadius: 6, border: "none",
                  background: draft.trim() && !isProcessing ? "#3b82f6" : "rgba(59,130,246,0.3)",
                  color: "#fff", cursor: draft.trim() && !isProcessing ? "pointer" : "not-allowed",
                  fontSize: 12, fontWeight: 500,
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
