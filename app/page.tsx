"use client";

import { useEffect, useState } from "react";
import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";
import { TopBar } from "@/components/canvas/TopBar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ContextMenu } from "@/components/canvas/ContextMenu";
import { CameraWidget } from "@/components/canvas/CameraWidget";
import { TrainingModal } from "@/components/training/TrainingModal";
import { Walkthrough } from "@/components/ui/Walkthrough";
import { SelectionBar } from "@/components/canvas/SelectionBar";
import { EpisodePanel } from "@/components/canvas/EpisodePanel";
import { registerPlugin, setActivePlugin } from "@/lib/agents/registry";
import { builtInPlugin } from "@/lib/agents/built-in";
import { claudePlugin } from "@/lib/agents/claude";
import { openaiPlugin } from "@/lib/agents/openai";
import { geminiPlugin } from "@/lib/agents/gemini";
import { livepeerPlugin } from "@/lib/agents/livepeer";
import { initializeTools } from "@/lib/tools";
import { fetchCapabilities } from "@/lib/sdk/capabilities";
import { useSkillStore } from "@/lib/skills/store";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    // Fetch live capabilities and skill registry
    fetchCapabilities();
    useSkillStore.getState().initRegistry();
    // Initialize tool registry and agent plugins
    initializeTools();
    registerPlugin(builtInPlugin);
    registerPlugin(claudePlugin);
    registerPlugin(openaiPlugin);
    registerPlugin(geminiPlugin);
    registerPlugin(livepeerPlugin);

    // Restore saved agent preference or default to gemini
    const saved = localStorage.getItem("storyboard_active_agent");
    try {
      setActivePlugin(saved || "gemini");
    } catch {
      setActivePlugin("built-in");
    }

    // Expose store for testing/debugging
    import("@/lib/canvas/store").then(m => {
      (window as any).__canvas = m.useCanvasStore;
    });

    setMounted(true);

    // Keyboard shortcuts
    const keyHandler = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        import("@/lib/canvas/store").then((m) => {
          if (e.shiftKey) m.useCanvasStore.getState().redo();
          else m.useCanvasStore.getState().undo();
        });
      }
      // ? → shortcuts modal
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        setShowShortcuts((v) => !v);
      }
      // Delete/Backspace → remove selected cards
      if ((e.key === "Delete" || e.key === "Backspace") && !e.metaKey && !e.ctrlKey) {
        import("@/lib/canvas/store").then((m) => {
          const s = m.useCanvasStore.getState();
          if (s.selectedCardIds.size > 0) {
            for (const id of s.selectedCardIds) s.removeCard(id);
            s.clearSelection();
          }
        });
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, []);

  // Render nothing on server — avoids all hydration mismatches from
  // localStorage, Zustand stores, and plugin state
  if (!mounted) return null;

  return (
    <>
      <TopBar onTrainClick={() => setTrainingOpen(true)} />
      <InfiniteCanvas />
      <ChatPanel />
      <ContextMenu />
      <CameraWidget />
      <TrainingModal open={trainingOpen} onClose={() => setTrainingOpen(false)} />
      <SelectionBar />
      <EpisodePanel />
      <Walkthrough />

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setShowShortcuts(false)}>
          <div className="w-80 rounded-xl bg-[#1a1a2e] p-5 shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-3">Keyboard Shortcuts</h3>
            <div className="space-y-1.5 text-xs text-gray-300">
              {[
                ["Cmd+Z", "Undo"],
                ["Cmd+Shift+Z", "Redo"],
                ["Delete / Backspace", "Remove selected cards"],
                ["Right-click card", "Context menu (restyle, animate, etc.)"],
                ["Double-click image", "Fullscreen view"],
                ["Shift+drag", "Lasso select"],
                ["Scroll wheel", "Zoom canvas"],
                ["?", "Toggle this help"],
              ].map(([key, desc]) => (
                <div key={key} className="flex justify-between">
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-purple-300">{key}</kbd>
                  <span className="text-gray-400">{desc}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowShortcuts(false)} className="mt-4 w-full rounded bg-white/10 py-1.5 text-xs text-white hover:bg-white/20 transition-colors">Close</button>
          </div>
        </div>
      )}
    </>
  );
}
