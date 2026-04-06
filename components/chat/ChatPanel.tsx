"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/lib/chat/store";
import { getActivePlugin } from "@/lib/agents/registry";
import { useCanvasStore } from "@/lib/canvas/store";
import { MessageBubble } from "./MessageBubble";
import type { AgentEvent, CanvasContext } from "@/lib/agents/types";

function buildCanvasContext(): CanvasContext {
  const state = useCanvasStore.getState();
  return {
    cards: state.cards.map((c) => ({
      id: c.id,
      refId: c.refId,
      type: c.type,
      title: c.title,
      url: c.url,
    })),
    selectedCard: state.selectedCardId
      ? state.cards.find((c) => c.id === state.selectedCardId)?.refId
      : undefined,
    capabilities: [],
  };
}

export function ChatPanel() {
  const { messages, isProcessing, addMessage } = useChatStore();
  const [input, setInput] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>([]);
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

  // --- Consume agent events ---
  const consumeEvents = useCallback(
    async (gen: AsyncGenerator<AgentEvent>) => {
      const tools: string[] = [];
      try {
        for await (const event of gen) {
          switch (event.type) {
            case "tool_call":
              if (event.name) {
                tools.push(event.name);
                setActiveTools([...tools]);
              }
              break;
            case "tool_result":
              // Remove completed tool from active list
              if (event.name) {
                const idx = tools.indexOf(event.name);
                if (idx >= 0) tools.splice(idx, 1);
                setActiveTools([...tools]);
              }
              break;
            case "done":
              setActiveTools([]);
              break;
            // text, card_created, error events are handled by the plugin
            // writing directly to chat/canvas stores (backward compatible)
          }
        }
      } catch (e) {
        addMessage(
          `Agent error: ${e instanceof Error ? e.message : "Unknown"}`,
          "system"
        );
      } finally {
        setActiveTools([]);
      }
    },
    [addMessage]
  );

  // --- Send ---
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isProcessing) return;
    addMessage(text, "user");
    setInput("");
    const plugin = getActivePlugin();
    if (plugin) {
      const context = buildCanvasContext();
      const gen = plugin.sendMessage(text, context);
      consumeEvents(gen);
    }
  }, [input, isProcessing, addMessage, consumeEvents]);

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
          {minimized ? "\u25A1" : "\u2014"}
        </button>
      </div>

      {/* Messages */}
      {!minimized && (
        <>
          <div className="flex max-h-[360px] flex-1 flex-col gap-1.5 overflow-y-auto p-3 scrollbar-thin">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Active tool pills */}
            {activeTools.length > 0 && (
              <div className="flex flex-wrap gap-1 self-start">
                {activeTools.map((tool, i) => (
                  <span
                    key={`${tool}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                  >
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                    {tool}
                  </span>
                ))}
              </div>
            )}

            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--border)] p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Create a dragon as image, then animate it..."
              rows={1}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
            />
          </div>
        </>
      )}
    </div>
  );
}
