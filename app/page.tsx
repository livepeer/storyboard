"use client";

import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";
import { TopBar } from "@/components/canvas/TopBar";

export default function Home() {
  return (
    <>
      <TopBar />
      <InfiniteCanvas />
    </>
  );
}
