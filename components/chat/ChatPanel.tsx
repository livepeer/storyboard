"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/lib/chat/store";
import { getActivePlugin } from "@/lib/agents/registry";
import { useCanvasStore } from "@/lib/canvas/store";
import { MessageBubble } from "./MessageBubble";
import { ToolPill } from "./ToolPill";
import { QuickActions } from "./QuickActions";
import { parseCommand, executeCommand } from "@/lib/skills/commands";
import { isApplyPendingIntent, applyPendingStory } from "@/lib/story/commands";
import { isFilmApplyIntent, applyPendingFilm } from "@/lib/film/commands";
import { isStreamApplyIntent, applyPendingStream } from "@/lib/stream-cmd/commands";
import { preprocessPrompt } from "@/lib/agents/preprocessor";
import { useSessionContext } from "@/lib/agents/session-context";
import { EpisodeSwitcher } from "./EpisodeSwitcher";
import { classifyIntent } from "@/lib/agents/intent";
import { useWorkingMemory } from "@/lib/agents/working-memory";
import type { AgentEvent, CanvasContext } from "@/lib/agents/types";

/** Map tool name + input to a human-friendly present-progressive verb */
function toolVerb(name: string, input?: Record<string, unknown>): string {
  switch (name) {
    case "create_media": {
      const steps = input?.steps as Array<{ action: string }> | undefined;
      const count = steps?.length || 1;
      const action = steps?.[0]?.action || "generate";
      const actionVerb: Record<string, string> = {
        generate: "Generating",
        restyle: "Restyling",
        animate: "Animating",
        upscale: "Upscaling",
        remove_bg: "Removing background",
        tts: "Creating narration",
      };
      const verb = actionVerb[action] || "Creating";
      return count > 1 ? `${verb} ${count} images` : `${verb} image`;
    }
    case "project_create": return "Planning project";
    case "project_generate": return "Generating scenes";
    case "project_iterate": return "Revising scenes";
    case "project_status": return "Checking progress";
    case "scope_start": return "Starting stream";
    case "scope_control": return "Updating stream";
    case "scope_stop": return "Stopping stream";
    case "scope_preset": return "Loading preset";
    case "scope_graph": return "Building graph";
    case "scope_status": return "Checking stream";
    case "inference": return "Running inference";
    case "canvas_get": return "Reading canvas";
    case "canvas_create": return "Adding to canvas";
    case "canvas_update": return "Updating card";
    case "canvas_remove": return "Removing card";
    case "canvas_organize": return "Organizing canvas";
    case "load_skill": return `Loading ${input?.skill_id || "skill"}`;
    case "capabilities": return "Checking models";
    case "memory_style": return "Saving style";
    case "memory_rate": return "Rating result";
    case "stream_start": return "Starting stream";
    case "stream_control": return "Updating stream";
    case "stream_stop": return "Stopping stream";
    default: return "Working";
  }
}

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
    selectedCard: state.selectedCardIds.size === 1
      ? state.cards.find((c) => c.id === Array.from(state.selectedCardIds)[0])?.refId
      : undefined,
    capabilities: [],
  };
}

/** Summarize a tool result for display in the pill */
function summarizeResult(name: string, result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;
  if (r.error) return String(r.error).slice(0, 60);
  const data = (r.data ?? r) as Record<string, unknown>;

  switch (name) {
    case "create_media": {
      const cards = data.cards_created as string[] | undefined;
      const results = data.results as Array<{ capability?: string; elapsed_ms?: number }> | undefined;
      if (!cards) return "";
      const cap = results?.[0]?.capability;
      const time = results?.[0]?.elapsed_ms;
      const parts = [`${cards.length} card${cards.length > 1 ? "s" : ""}`];
      if (cap) parts.push(cap);
      if (time) parts.push(`${(time / 1000).toFixed(1)}s`);
      return parts.join(" · ");
    }
    case "project_create":
      return data.total_scenes ? `${data.total_scenes} scenes planned` : "";
    case "project_generate": {
      const completed = data.completed as number | undefined;
      const total = data.total as number | undefined;
      return completed !== undefined && total ? `${completed}/${total} done` : "";
    }
    case "project_iterate":
      return data.completed ? `${data.completed}/${data.total} done` : "";
    case "scope_start":
      return data.message ? String(data.message).slice(0, 50) : "";
    case "scope_control": {
      const applied = data.applied as string[] | undefined;
      return applied ? applied.join(", ") : "";
    }
    case "canvas_get": {
      const cards = data.cards as unknown[] | undefined;
      return cards ? `${cards.length} cards` : "";
    }
    case "load_skill":
      return data.skill_id ? `${data.skill_id}` : "";
    default:
      if (data.summary) return String(data.summary).slice(0, 60);
      return "";
  }
}

export function ChatPanel() {
  const { messages, isProcessing, addMessage } = useChatStore();
  const [input, setInput] = useState("");
  const [trackedTools, setTrackedTools] = useState<TrackedTool[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingVerb, setThinkingVerb] = useState("Thinking");
  const [expandedEditor, setExpandedEditor] = useState(false);
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
      setThinkingVerb("Thinking");
      setIsThinking(true);
      try {
        for await (const event of gen) {
          switch (event.type) {
            case "text":
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
                // Update thinking verb based on what tool is running
                setThinkingVerb(toolVerb(event.name, event.input));
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

      // Step 1: Classify intent
      const { useProjectStore } = await import("@/lib/projects/store");
      const projStore = useProjectStore.getState();
      const activeProject = projStore.getActiveProject();
      const pendingScenes = activeProject
        ? activeProject.scenes.filter((s: { status: string }) => s.status === "pending" || s.status === "regenerating").length
        : 0;
      const intent = classifyIntent(text, !!activeProject, pendingScenes);

      // Step 2: Sync working memory
      const memory = useWorkingMemory.getState();
      memory.syncFromProjectStore();

      // Step 3: Preprocess (extraction only for new_project; direct handling for continue/status)
      let agentText = text;
      let skipAgent = false;
      try {
        setThinkingVerb("Analyzing");
        setIsThinking(true);
        if (intent.type === "new_project" || intent.type === "continue" || intent.type === "status") {
          const pre = await preprocessPrompt(text);
          if (pre.handled) {
            // Preprocessor fully handled (continue/status) — skip agent
            skipAgent = true;
            memory.syncFromProjectStore();
          } else if (pre.agentPrompt) {
            // Preprocessor did extraction, agent should execute (new_project)
            agentText = pre.agentPrompt;
            memory.syncFromProjectStore();
          }
        }
      } catch {
        // Preprocessing failed — send original to agent
      }

      // Step 4: Send to agent (unless preprocessor fully handled it)
      if (!skipAgent) {
        const plugin = getActivePlugin();
        if (plugin) {
          const context = buildCanvasContext();
          const gen = plugin.sendMessage(agentText, context);
          await consumeEvents(gen);
        }
      }

      // Step 5: Update working memory
      memory.syncFromProjectStore();
      memory.appendDigest(`User: "${text.slice(0, 50)}".`);

      setIsThinking(false);
      activeCount.current--;
    },
    [addMessage, consumeEvents]
  );

  // --- Send: handle /commands or send to agent ---
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      // Natural-language apply for a pending /story draft. When the
      // user has a draft displayed and says "yes" / "apply them" /
      // "I like it" / etc., shortcut straight to the apply path
      // instead of sending the affirmative to the agent (which would
      // interpret it as a creative prompt and do something
      // unexpected). Only fires when there's actually a pending story,
      // so normal "yes" replies to other questions are unaffected.
      if (isApplyPendingIntent(text.trim())) {
        addMessage(text.trim(), "user");
        setInput("");
        applyPendingStory().then((result) => addMessage(result, "system"));
        return;
      }
      if (isFilmApplyIntent(text.trim())) {
        addMessage(text.trim(), "user");
        setInput("");
        applyPendingFilm().then((result) => addMessage(result, "system"));
        return;
      }
      if (isStreamApplyIntent(text.trim())) {
        addMessage(text.trim(), "user");
        setInput("");
        applyPendingStream().then((result) => addMessage(result, "system"));
        return;
      }

      // Check for /command
      const cmd = parseCommand(text.trim());
      if (cmd) {
        addMessage(text.trim(), "user");
        setInput("");
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

      {/* Context badge — shows active creative context */}
      {!minimized && useSessionContext.getState().context && (
        <div
          className="flex items-center gap-1.5 border-b border-[var(--border)] bg-purple-500/5 px-3 py-1.5 cursor-pointer"
          onClick={() => {
            executeCommand({ command: "context", args: "" }).then(r =>
              useChatStore.getState().addMessage(r, "system")
            );
          }}
          title="Click to view full context. /context clear to reset."
        >
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
          <span className="flex-1 truncate text-[9px] text-purple-300/70">
            {useSessionContext.getState().summary}
          </span>
          <span className="text-[8px] text-purple-300/40">/context</span>
        </div>
      )}

      {!minimized && <EpisodeSwitcher />}

      {/* Messages */}
      {!minimized && (
        <>
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3 scrollbar-thin">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Status indicator — shows verb like "Thinking...", "Generating 3 images..." */}
            {isThinking && (
              <div className="flex items-center gap-2 self-start px-2 py-1.5">
                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-purple-400/30 border-t-purple-400" />
                <span className="text-[11px] text-purple-300/80">{thinkingVerb}…</span>
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
            <div className="flex gap-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Create a dragon as image, then animate it..."
                rows={1}
                className="min-w-0 flex-1 resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
              />
              <button
                onClick={() => setExpandedEditor(true)}
                title="Expand editor for long prompts"
                className="shrink-0 rounded-lg border border-[var(--border)] bg-transparent px-2 text-[var(--text-dim)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-muted)]"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2H3a1 1 0 00-1 1v3M10 2h3a1 1 0 011 1v3M6 14H3a1 1 0 01-1-1v-3M10 14h3a1 1 0 001-1v-3" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Expanded editor — floating modal for long prompts */}
      {expandedEditor && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setExpandedEditor(false); }}
        >
          <div className="flex w-[90vw] max-w-[700px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(20,20,20,0.98)] shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <span className="flex-1 text-sm font-medium text-[var(--text-muted)]">Compose Prompt</span>
              <span className="text-[10px] text-[var(--text-dim)]">
                {input.length > 0 ? `${input.split(/\s+/).filter(Boolean).length} words` : ""}
              </span>
              <button
                onClick={() => setExpandedEditor(false)}
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-dim)] transition-colors hover:bg-white/[0.08] hover:text-[var(--text)]"
              >
                ×
              </button>
            </div>
            {/* Editor */}
            <textarea
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter to send
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  setExpandedEditor(false);
                  sendMessage(input);
                }
                // Escape to close
                if (e.key === "Escape") setExpandedEditor(false);
              }}
              placeholder="Paste your full storyboard brief, multi-scene prompt, or detailed creative direction here...

Example:
Create a 9-scene cinematic storyboard for...
Scene 1 — Title
Description...
Scene 2 — Title
Description..."
              className="min-h-[300px] max-h-[60vh] flex-1 resize-y bg-transparent px-4 py-3 text-sm leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
            />
            {/* Footer */}
            <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
              <span className="flex-1 text-[10px] text-[var(--text-dim)]">
                {input.length > 500 ? "Long prompt detected — will auto-plan as project" : ""}
                {" "}Cmd+Enter to send · Esc to close
              </span>
              <button
                onClick={() => setExpandedEditor(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-dim)] transition-colors hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setExpandedEditor(false);
                  sendMessage(input);
                }}
                className="rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/30"
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
