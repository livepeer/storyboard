"use client";

import { useCanvasStore } from "@/lib/canvas/store";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export function TopBar({ onTrainClick }: { onTrainClick?: () => void }) {
  const { viewport, zoomTo, fitAll } = useCanvasStore();

  const zoomIn = () =>
    zoomTo(viewport.scale * 1.2, window.innerWidth / 2, window.innerHeight / 2);
  const zoomOut = () =>
    zoomTo(viewport.scale / 1.2, window.innerWidth / 2, window.innerHeight / 2);
  const fit = () => fitAll(window.innerWidth, window.innerHeight);

  return (
    <div className="fixed left-0 right-0 top-0 z-[1000] flex h-12 items-center gap-4 border-b border-[var(--border)] bg-[rgba(10,10,10,0.85)] px-5 backdrop-blur-xl backdrop-saturate-[1.2]">
      <span className="text-[13px] font-semibold uppercase tracking-wider text-[var(--accent)]">
        Storyboard
      </span>
      <div className="h-5 w-px bg-[var(--border)]" />
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={zoomOut}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent text-sm text-[var(--text-muted)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          −
        </button>
        <span className="min-w-[40px] text-center font-mono text-[11px] text-[var(--text-muted)]">
          {Math.round(viewport.scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent text-sm text-[var(--text-muted)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          +
        </button>
        <button
          onClick={fit}
          className="flex h-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent px-2 text-[11px] text-[var(--text-muted)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          Fit
        </button>
        <div className="ml-2 h-5 w-px bg-[var(--border)]" />
        {onTrainClick && (
          <button
            onClick={onTrainClick}
            className="flex h-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent px-2 text-[11px] text-[var(--text-muted)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            Train
          </button>
        )}
        <SettingsPanel />
      </div>
    </div>
  );
}
