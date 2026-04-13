"use client";

import { useEpisodeStore } from "@/lib/episodes/store";

export function EpisodeBadge({ cardId }: { cardId: string }) {
  const episode = useEpisodeStore((s) => s.getEpisodeForCard(cardId));
  const activeEpisodeId = useEpisodeStore((s) => s.activeEpisodeId);

  if (!episode) return null;

  const isActive = episode.id === activeEpisodeId;
  const r = parseInt(episode.color.slice(1, 3), 16);
  const g = parseInt(episode.color.slice(3, 5), 16);
  const b = parseInt(episode.color.slice(5, 7), 16);

  return (
    <div
      className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1.5 cursor-pointer rounded-full px-2 py-0.5"
      style={{
        background: `rgba(${r},${g},${b},0.2)`,
        border: `1px solid rgba(${r},${g},${b},0.3)`,
      }}
      title={`${episode.name}${isActive ? " (active)" : ""} — click to activate`}
      onClick={(e) => {
        e.stopPropagation();
        useEpisodeStore.getState().activateEpisode(isActive ? null : episode.id);
      }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          backgroundColor: `rgb(${r},${g},${b})`,
          boxShadow: isActive ? `0 0 6px rgba(${r},${g},${b},0.8)` : undefined,
        }}
      />
      <span
        className="text-[9px] font-semibold max-w-[70px] truncate"
        style={{ color: `rgb(${r},${g},${b})` }}
      >
        {episode.name.length > 12 ? episode.name.slice(0, 12) + "\u2026" : episode.name}
      </span>
    </div>
  );
}
