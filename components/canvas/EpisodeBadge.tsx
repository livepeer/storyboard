"use client";

import { useEpisodeStore } from "@/lib/episodes/store";

export function EpisodeBadge({ cardId }: { cardId: string }) {
  const episode = useEpisodeStore((s) => s.getEpisodeForCard(cardId));
  const activeEpisodeId = useEpisodeStore((s) => s.activeEpisodeId);

  if (!episode) return null;

  const isActive = episode.id === activeEpisodeId;

  return (
    <div
      className="absolute right-2 top-2 z-10 flex items-center gap-1 cursor-pointer"
      title={`${episode.name}${isActive ? " (active)" : ""} — click to activate`}
      onClick={(e) => {
        e.stopPropagation();
        useEpisodeStore.getState().activateEpisode(isActive ? null : episode.id);
      }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full border border-black/20"
        style={{ backgroundColor: episode.color }}
      />
      {isActive && (
        <span className="text-[8px] font-medium" style={{ color: episode.color }}>
          {episode.name.length > 12 ? episode.name.slice(0, 12) + "\u2026" : episode.name}
        </span>
      )}
    </div>
  );
}
