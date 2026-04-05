"use client";

import { useEffect } from "react";
import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";
import { TopBar } from "@/components/canvas/TopBar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ContextMenu } from "@/components/canvas/ContextMenu";
import { registerPlugin, setActivePlugin } from "@/lib/agents/registry";
import { builtInPlugin } from "@/lib/agents/built-in";

export default function Home() {
  useEffect(() => {
    registerPlugin(builtInPlugin);
    setActivePlugin("built-in");
  }, []);

  return (
    <>
      <TopBar />
      <InfiniteCanvas />
      <ChatPanel />
      <ContextMenu />
    </>
  );
}
