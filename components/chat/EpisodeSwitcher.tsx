"use client";

import { useEpisodeStore } from "@/lib/episodes/store";

export function EpisodeSwitcher() {
  const { episodes, activeEpisodeId, activateEpisode } = useEpisodeStore();

  if (episodes.length === 0) return null;

  return (
    <div className="flex items-center gap-1 border-b border-[var(--border)] px-3 py-1 overflow-x-auto scrollbar-none">
      <button
        onClick={() => activateEpisode(null)}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] transition-colors ${
          activeEpisodeId === null
            ? "bg-white/10 text-[var(--text)]"
            : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
        }`}
      >
        All
      </button>
      {episodes.map((ep) => (
        <button
          key={ep.id}
          onClick={() => activateEpisode(ep.id)}
          className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] transition-colors ${
            activeEpisodeId === ep.id
              ? "bg-white/10 text-[var(--text)]"
              : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
          }`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: ep.color }}
          />
          <span className="max-w-[80px] truncate">{ep.name}</span>
        </button>
      ))}
    </div>
  );
}
