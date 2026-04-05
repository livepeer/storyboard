"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/lib/chat/store";
import { getActivePlugin } from "@/lib/agents/registry";
import { MessageBubble } from "./MessageBubble";

export function ChatPanel() {
  const { messages, isProcessing, addMessage } = useChatStore();
  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Send ---
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isProcessing) return;
    addMessage(text, "user");
    setInput("");
    const plugin = getActivePlugin();
    if (plugin) {
      plugin.handleMessage(text);
    }
  }, [input, isProcessing, addMessage]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // --- Drag ---
  const onDragStart = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !panelRef.current) return;
    const { startX, startY, origX, origY } = dragRef.current;
    const panel = panelRef.current;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = `${origX + (e.clientX - startX)}px`;
    panel.style.top = `${origY + (e.clientY - startY)}px`;
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={panelRef}
      className={`fixed bottom-4 right-4 z-[1500] flex w-[380px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[rgba(20,20,20,0.95)] shadow-[var(--shadow-lg)] backdrop-blur-xl backdrop-saturate-[1.2] ${
        minimized ? "max-h-10" : "max-h-[520px]"
      }`}
    >
      {/* Header */}
      <div
        className="flex h-10 shrink-0 cursor-move items-center gap-2 border-b border-[var(--border)] px-3"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            isProcessing ? "animate-pulse bg-yellow-400" : "bg-emerald-400"
          }`}
        />
        <span className="flex-1 text-xs font-medium text-[var(--text-muted)]">
          Agent
        </span>
        <button
          onClick={() => setMinimized(!minimized)}
          className="flex h-[22px] w-[22px] items-center justify-center rounded border-none bg-transparent text-xs text-[var(--text-dim)] transition-all hover:bg-white/[0.08] hover:text-[var(--text-muted)]"
        >
          {minimized ? "□" : "—"}
        </button>
      </div>

      {/* Messages */}
      {!minimized && (
        <>
          <div className="flex max-h-[360px] flex-1 flex-col gap-1.5 overflow-y-auto p-3 scrollbar-thin">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--border)] p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Create a dragon as image, then animate it…"
              rows={1}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
            />
          </div>
        </>
      )}
    </div>
  );
}
