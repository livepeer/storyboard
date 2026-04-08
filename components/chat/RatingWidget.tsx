"use client";

import { useState } from "react";
import { addRating } from "@/lib/memory/store";

interface Props {
  refId: string;
  capability: string;
  prompt: string;
  onRated?: (rating: number) => void;
}

export function RatingWidget({ refId, capability, prompt, onRated }: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleClick = (stars: number) => {
    setRating(stars);
    setSubmitted(true);
    addRating({ ref_id: refId, capability, prompt, rating: stars });
    onRated?.(stars);
  };

  if (submitted) {
    return (
      <span className="text-[10px] text-[var(--text-dim)]">
        Rated {"*".repeat(rating)}{"*".repeat(0)} ({rating}/5)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => handleClick(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className={`h-4 w-4 border-none bg-transparent text-[10px] transition-colors ${
            n <= (hovered || rating) ? "text-yellow-400" : "text-[var(--text-dim)]"
          } hover:scale-110`}
        >
          {n <= (hovered || rating) ? "\u2605" : "\u2606"}
        </button>
      ))}
    </span>
  );
}
