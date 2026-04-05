"use client";

import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";
import { TopBar } from "@/components/canvas/TopBar";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function Home() {
  return (
    <>
      <TopBar />
      <InfiniteCanvas />
      <ChatPanel />
    </>
  );
}
