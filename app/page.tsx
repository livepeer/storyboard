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
import { initializeTools } from "@/lib/tools";
import { fetchCapabilities } from "@/lib/sdk/capabilities";

export default function Home() {
  const [trainingOpen, setTrainingOpen] = useState(false);

  useEffect(() => {
    // Fetch live capabilities from SDK (single source of truth for model names)
    fetchCapabilities();
    // Initialize tool registry and agent plugins
    initializeTools();
    registerPlugin(builtInPlugin);
    registerPlugin(claudePlugin);
    registerPlugin(openaiPlugin);
    registerPlugin(geminiPlugin);

    // Restore saved agent preference or default to gemini
    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("storyboard_active_agent")
        : null;
    try {
      setActivePlugin(saved || "gemini");
    } catch {
      setActivePlugin("built-in");
    }
  }, []);

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
