"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/lib/chat/store";
import { getActivePlugin } from "@/lib/agents/registry";
import { useCanvasStore } from "@/lib/canvas/store";
import { MessageBubble } from "./MessageBubble";
import { ToolPill } from "./ToolPill";
import { QuickActions } from "./QuickActions";
import { parseCommand, executeCommand } from "@/lib/skills/commands";
import type { AgentEvent, CanvasContext } from "@/lib/agents/types";

/** Tracked tool call with status and optional result summary */
export interface TrackedTool {
  name: string;
  status: "running" | "done" | "error";
  input?: Record<string, unknown>;
  resultSummary?: string;
  elapsed?: number;
}

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

/** Summarize a tool result for display in the pill */
function summarizeResult(name: string, result: unknown): string {
  if (!result || typeof result !== "object") return "done";
  const r = result as Record<string, unknown>;
  if (r.error) return `error: ${String(r.error).slice(0, 60)}`;
  const data = (r.data ?? r) as Record<string, unknown>;
  if (data.cards_created) {
    const cards = data.cards_created as string[];
    return `${cards.length} card${cards.length > 1 ? "s" : ""} created`;
  }
  if (data.summary) return String(data.summary).slice(0, 80);
  if (data.skill_id) return `loaded ${data.skill_id}`;
  if (data.url) return "media ready";
  if (name === "canvas_get") {
    const cards = data.cards as unknown[] | undefined;
    return cards ? `${cards.length} cards` : "canvas data";
  }
  return "done";
}

export function ChatPanel() {
  const { messages, isProcessing, addMessage } = useChatStore();
  const [input, setInput] = useState("");
  const [trackedTools, setTrackedTools] = useState<TrackedTool[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Removed: messageQueue + processingRef — prompts now run concurrently
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, trackedTools]);

  // --- Consume agent events ---
  const consumeEvents = useCallback(
    async (gen: AsyncGenerator<AgentEvent>) => {
      const tools: TrackedTool[] = [];
      setIsThinking(true);
      try {
        for await (const event of gen) {
          switch (event.type) {
            case "text":
              // First text means thinking is done
              setIsThinking(false);
              break;
            case "tool_call":
              setIsThinking(false);
              if (event.name) {
                tools.push({
                  name: event.name,
                  status: "running",
                  input: event.input,
                });
                setTrackedTools([...tools]);
              }
              break;
            case "tool_result": {
              setIsThinking(false);
              if (event.name) {
                const t = tools.find(
                  (t) => t.name === event.name && t.status === "running"
                );
                if (t) {
                  t.status = event.result &&
                    typeof event.result === "object" &&
                    (event.result as Record<string, unknown>).error
                    ? "error"
                    : "done";
                  t.resultSummary = summarizeResult(event.name, event.result);
                }
                setTrackedTools([...tools]);
              }
              break;
            }
            case "done":
              setIsThinking(false);
              // Keep completed tools visible briefly, then clear
              setTimeout(() => setTrackedTools([]), 2000);
              break;
          }
        }
      } catch (e) {
        addMessage(
          `Agent error: ${e instanceof Error ? e.message : "Unknown"}`,
          "system"
        );
      } finally {
        setIsThinking(false);
        setTimeout(() => setTrackedTools([]), 2000);
      }
    },
    [addMessage]
  );

  // --- Track active tasks for concurrency indicator ---
  const activeCount = useRef(0);

  // --- Process one message (fire-and-forget, concurrent) ---
  const processOne = useCallback(
    async (text: string) => {
      activeCount.current++;
      addMessage(text, "user");
      const plugin = getActivePlugin();
      if (plugin) {
        const context = buildCanvasContext();
        const gen = plugin.sendMessage(text, context);
        await consumeEvents(gen);
      }
      activeCount.current--;
    },
    [addMessage, consumeEvents]
  );

  // --- Send: handle /commands or send to agent ---
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      // Check for /command
      const cmd = parseCommand(text.trim());
      if (cmd) {
        addMessage(text.trim(), "user");
        executeCommand(cmd).then((result) => addMessage(result, "system"));
        return;
      }
      setInput("");
      // Fire concurrently — no queue, no blocking
      processOne(text.trim());
    },
    [processOne]
  );

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

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

  // --- Focus input (called from QuickActions and context menu) ---
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // --- Listen for prefill events (from context menu / quick actions) ---
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        text: string;
        autoSend?: boolean;
      };
      if (detail.autoSend) {
        sendMessage(detail.text);
      } else {
        setInput(detail.text);
        setMinimized(false);
        setTimeout(() => focusInput(), 50);
      }
    };
    window.addEventListener("chat-prefill", handler);
    return () => window.removeEventListener("chat-prefill", handler);
  }, [sendMessage, focusInput]);

  return (
    <div
      ref={panelRef}
      style={{ resize: minimized ? "none" : "both", minWidth: 300, minHeight: 200 }}
      className={`fixed bottom-4 right-4 z-[1500] flex w-[380px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[rgba(20,20,20,0.95)] shadow-[var(--shadow-lg)] backdrop-blur-xl backdrop-saturate-[1.2] ${
        minimized ? "max-h-10" : "h-[520px]"
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
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3 scrollbar-thin">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Thinking indicator */}
            {isThinking && (
              <div className="flex items-center gap-1.5 self-start px-1 py-1">
                <span className="thinking-dot" />
                <span className="thinking-dot [animation-delay:0.15s]" />
                <span className="thinking-dot [animation-delay:0.3s]" />
              </div>
            )}

            {/* Tool call pills */}
            {trackedTools.length > 0 && (
              <div className="flex flex-col gap-1 self-start">
                {trackedTools.map((tool, i) => (
                  <ToolPill key={`${tool.name}-${i}`} tool={tool} />
                ))}
              </div>
            )}

            <div ref={messagesEnd} />
          </div>

          {/* Input + Quick Actions */}
          <div className="border-t border-[var(--border)] p-2">
            <QuickActions onSend={sendMessage} setInput={setInput} focusInput={focusInput} />
            <textarea
              ref={inputRef}
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
