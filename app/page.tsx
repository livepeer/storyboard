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
import { initializeTools } from "@/lib/tools";

export default function Home() {
  const [trainingOpen, setTrainingOpen] = useState(false);

  useEffect(() => {
    // Initialize tool registry and agent plugins
    initializeTools();
    registerPlugin(builtInPlugin);

    // Restore saved agent preference or default to built-in
    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("storyboard_active_agent")
        : null;
    try {
      setActivePlugin(saved || "built-in");
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
