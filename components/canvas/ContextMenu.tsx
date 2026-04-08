"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import { runInference } from "@/lib/sdk/client";
import type { Card } from "@/lib/canvas/types";

interface MenuAction {
  id: string;
  label: string;
  icon: string;
  forTypes: string[];
  requiresMedia: boolean;
}

const ACTIONS: MenuAction[] = [
  { id: "animate", label: "Animate", icon: "\u25B6", forTypes: ["image"], requiresMedia: true },
  { id: "restyle", label: "Restyle", icon: "\u2728", forTypes: ["image"], requiresMedia: true },
  { id: "upscale", label: "Upscale", icon: "\u2B06", forTypes: ["image"], requiresMedia: true },
  { id: "transform-video", label: "Transform Video", icon: "\uD83D\uDD04", forTypes: ["video"], requiresMedia: true },
  { id: "lv2v", label: "Live Stream", icon: "\uD83D\uDCE1", forTypes: ["image", "video"], requiresMedia: true },
  { id: "chat", label: "Ask Claude\u2026", icon: "\uD83D\uDCAC", forTypes: ["image", "video", "audio"], requiresMedia: false },
  { id: "custom", label: "Custom Prompt\u2026", icon: "\u270F", forTypes: ["image", "video", "audio"], requiresMedia: false },
];

const ACTION_CONFIG: Record<string, { capability: string; newType: string; defaultPrompt?: string }> = {
  animate: { capability: "ltx-i2v", newType: "video" },
  restyle: { capability: "kontext-edit", newType: "image" },
  upscale: { capability: "topaz-upscale", newType: "image", defaultPrompt: "Upscale and enhance this image with sharp details" },
  "transform-video": { capability: "wan-v2v", newType: "video" },
};

export function ContextMenu() {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [targetCard, setTargetCard] = useState<Card | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { addCard, addEdge, updateCard } = useCanvasStore();
  const addMessage = useChatStore((s) => s.addMessage);

  // Show on custom event (dispatched from Card right-click)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        card: Card;
        x: number;
        y: number;
      };
      setTargetCard(detail.card);
      setPos({ x: detail.x, y: detail.y });
      setVisible(true);
    };
    window.addEventListener("card-context-menu", handler);
    return () => window.removeEventListener("card-context-menu", handler);
  }, []);

  // Dismiss
  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setVisible(false);
    window.addEventListener("click", dismiss);
    window.addEventListener("contextmenu", dismiss);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("contextmenu", dismiss);
    };
  }, [visible]);

  /** Dispatch a chat-prefill event so ChatPanel picks it up */
  const prefillChat = useCallback(
    (text: string, autoSend = false) => {
      window.dispatchEvent(
        new CustomEvent("chat-prefill", { detail: { text, autoSend } })
      );
    },
    []
  );

  const handleAction = useCallback(
    async (actionId: string) => {
      if (!targetCard) return;
      setVisible(false);

      // --- Actions that route to chat ---
      if (actionId === "chat") {
        prefillChat(`Describe "${targetCard.title}" and suggest next steps`);
        return;
      }

      if (actionId === "restyle") {
        prefillChat(`Restyle "${targetCard.title}" in the style of `);
        return;
      }

      if (actionId === "animate") {
        prefillChat(`Animate "${targetCard.title}" with `);
        return;
      }

      if (actionId === "lv2v") {
        prefillChat(`Start a live video stream from "${targetCard.title}"`);
        return;
      }

      // --- Actions that run directly ---
      let prompt: string | null = null;
      let capability: string;
      let newType: string;

      const config = ACTION_CONFIG[actionId];

      if (actionId === "custom") {
        prompt = window.prompt("Describe what to do with this card:");
        if (!prompt) return;
        // Auto-detect type
        const isVideo = /\b(animate|video|motion)\b/i.test(prompt);
        capability = isVideo ? "ltx-i2v" : "kontext-edit";
        newType = isVideo ? "video" : targetCard.type;
      } else if (config) {
        capability = config.capability;
        newType = config.newType;
        prompt = config.defaultPrompt || window.prompt(`${actionId} prompt:`) || null;
        if (!prompt) return;
      } else {
        return;
      }

      // Create new card
      const newRefId = `${actionId}_${Date.now()}`;
      const card = addCard({
        type: newType as Card["type"],
        title: prompt.slice(0, 40),
        refId: newRefId,
      });

      // Add edge
      addEdge(targetCard.refId, newRefId, {
        capability,
        prompt,
        action: actionId,
      });

      // Run inference
      try {
        const params: Record<string, unknown> = {};
        if (targetCard.url) {
          if (
            targetCard.type === "video" ||
            actionId === "transform-video"
          ) {
            params.video_url = targetCard.url;
          } else {
            params.image_url = targetCard.url;
          }
        }

        const t0 = performance.now();
        const result = await runInference({
          capability,
          prompt,
          params,
        });
        const elapsed = performance.now() - t0;

        const r = result as Record<string, unknown>;
        const url =
          (r.image_url as string) ??
          (r.video_url as string) ??
          (r.audio_url as string);

        if (r.error) {
          updateCard(card.id, { error: r.error as string });
        } else if (url) {
          updateCard(card.id, { url });
          addMessage(
            `${actionId} — ${capability} (${(elapsed / 1000).toFixed(1)}s)`,
            "agent"
          );
        } else {
          updateCard(card.id, { error: "No media returned" });
        }

        addEdge(targetCard.refId, newRefId, {
          capability,
          prompt,
          action: actionId,
          elapsed,
        });
      } catch (e) {
        updateCard(card.id, {
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [targetCard, addCard, addEdge, updateCard, addMessage, prefillChat]
  );

  if (!visible || !targetCard) return null;

  const hasMedia = !!targetCard.url;
  const visibleActions = ACTIONS.filter(
    (a) =>
      a.forTypes.includes(targetCard.type) &&
      (!a.requiresMedia || hasMedia)
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-[2500] min-w-[180px] overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(16,16,16,0.96)] py-1 shadow-[var(--shadow-lg)] backdrop-blur-xl backdrop-saturate-[1.3]"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {visibleActions.map((action, i) => (
        <div key={action.id}>
          {i > 0 && action.id === "custom" && (
            <div className="my-1 h-px bg-white/[0.06]" />
          )}
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text)]"
            onClick={() => handleAction(action.id)}
          >
            <span className="w-4 text-center">{action.icon}</span>
            {action.label}
          </button>
        </div>
      ))}
      {visibleActions.length === 0 && (
        <div className="px-3 py-2 text-xs text-[var(--text-dim)]">
          No actions available
        </div>
      )}
    </div>
  );
}
