"use client";

import { useEffect, useState } from "react";
import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";
import { TopBar } from "@/components/canvas/TopBar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ContextMenu } from "@/components/canvas/ContextMenu";
import { CameraWidget } from "@/components/canvas/CameraWidget";
import { TrainingModal } from "@/components/training/TrainingModal";
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

    // Undo/redo keyboard shortcuts
    const undoHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        import("@/lib/canvas/store").then((m) => {
          if (e.shiftKey) m.useCanvasStore.getState().redo();
          else m.useCanvasStore.getState().undo();
        });
      }
    };
    window.addEventListener("keydown", undoHandler);
    return () => window.removeEventListener("keydown", undoHandler);
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
    </>
  );
}
