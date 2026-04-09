"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import { runInference } from "@/lib/sdk/client";
import { resolveCapability } from "@/lib/sdk/capabilities";
import {
  startStream,
  waitForReady,
  startPublishing,
  startPolling,
  stopStream,
  linkRefIdToStream,
  type Lv2vSession,
} from "@/lib/stream/session";
import type { Card } from "@/lib/canvas/types";

interface MenuAction {
  id: string;
  label: string;
  icon: string;
  forTypes: string[];
  requiresMedia: boolean;
  /** "direct" runs inference immediately, "chat" sends to agent */
  mode: "direct" | "chat";
}

const ACTIONS: MenuAction[] = [
  // --- Direct execution (one-click, no prompt needed) ---
  { id: "upscale", label: "Upscale", icon: "\u2B06", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "remove-bg", label: "Remove Background", icon: "\u2702", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  // --- Direct execution with prompt ---
  { id: "animate", label: "Animate\u2026", icon: "\u25B6", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "restyle", label: "Restyle\u2026", icon: "\u2728", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "transform-video", label: "Transform Video\u2026", icon: "\uD83D\uDD04", forTypes: ["video"], requiresMedia: true, mode: "direct" },
  // --- LV2V from card ---
  { id: "lv2v-from-card", label: "Start LV2V Stream\u2026", icon: "\uD83D\uDCE1", forTypes: ["image", "video"], requiresMedia: true, mode: "direct" },
  // --- Agent-assisted (routes to chat) ---
  { id: "agent-restyle", label: "Restyle with AI\u2026", icon: "\uD83E\uDD16", forTypes: ["image"], requiresMedia: true, mode: "chat" },
  { id: "agent-animate", label: "Animate with AI\u2026", icon: "\uD83E\uDD16", forTypes: ["image"], requiresMedia: true, mode: "chat" },
  { id: "agent-ask", label: "Ask Claude\u2026", icon: "\uD83D\uDCAC", forTypes: ["image", "video", "audio"], requiresMedia: false, mode: "chat" },
];

const DIRECT_CONFIG: Record<string, { capability: string; newType: string; defaultPrompt?: string }> = {
  animate: { capability: "ltx-i2v", newType: "video" },
  restyle: { capability: "kontext-edit", newType: "image" },
  upscale: { capability: "topaz-upscale", newType: "image", defaultPrompt: "Upscale and enhance with sharp details" },
  "remove-bg": { capability: "bg-remove", newType: "image", defaultPrompt: "Remove background" },
  "transform-video": { capability: "ltx-t2v", newType: "video" },
};

export function ContextMenu() {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [targetCard, setTargetCard] = useState<Card | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { addCard, addEdge, updateCard } = useCanvasStore();
  const addMessage = useChatStore((s) => s.addMessage);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { card: Card; x: number; y: number };
      setTargetCard(detail.card);
      setPos({ x: detail.x, y: detail.y });
      setVisible(true);
    };
    window.addEventListener("card-context-menu", handler);
    return () => window.removeEventListener("card-context-menu", handler);
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Delay attaching dismiss listeners so the opening right-click
    // event doesn't immediately close the menu (same event cycle)
    const dismiss = () => setVisible(false);
    const timer = setTimeout(() => {
      window.addEventListener("click", dismiss);
      window.addEventListener("contextmenu", dismiss);
    }, 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", dismiss);
      window.removeEventListener("contextmenu", dismiss);
    };
  }, [visible]);

  const prefillChat = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent("chat-prefill", { detail: { text } }));
  }, []);

  const sendToAgent = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent("chat-prefill", { detail: { text, autoSend: true } }));
  }, []);

  const handleAction = useCallback(
    async (action: MenuAction) => {
      if (!targetCard) return;
      setVisible(false);

      // --- Agent-assisted actions → route to chat ---
      if (action.mode === "chat") {
        const title = targetCard.title;
        switch (action.id) {
          case "agent-restyle":
            prefillChat(`Restyle "${title}" in the style of `);
            return;
          case "agent-animate":
            prefillChat(`Animate "${title}" with `);
            return;
          case "agent-lv2v":
            sendToAgent(`Start a live video stream from "${title}"`);
            return;
          case "agent-ask":
            prefillChat(`Describe "${title}" and suggest next steps`);
            return;
        }
        return;
      }

      // --- LV2V from card ---
      if (action.id === "lv2v-from-card") {
        const prompt = window.prompt("LV2V style prompt:", "transform into a cyberpunk scene with neon lights");
        if (!prompt) return;

        addMessage(`Starting LV2V from "${targetCard.title}"\u2026`, "system");

        try {
          const session = await startStream(prompt);
          const cardRefId = `lv2v_${Date.now()}`;
          const streamCard = addCard({
            type: "stream",
            title: `LV2V: ${prompt.slice(0, 25)}`,
            refId: cardRefId,
          });
          linkRefIdToStream(cardRefId, session.streamId);
          addEdge(targetCard.refId, cardRefId, {
            capability: "scope",
            prompt,
            action: "lv2v",
          });

          addMessage("Waiting for pipeline\u2026", "system");
          await waitForReady(session, (phase) => {
            addMessage(`LV2V: ${phase}`, "system");
          });

          // Capture source image as blob for publishing
          let cachedBlob: Blob | null = null;
          const captureSourceFrame = (): Blob | null => {
            if (cachedBlob) return cachedBlob;
            return null;
          };

          // Fetch the source image and cache it
          if (targetCard.url) {
            try {
              const resp = await fetch(targetCard.url);
              cachedBlob = await resp.blob();
            } catch {
              // Try canvas capture as fallback
            }
          }
          if (!cachedBlob) {
            // Create a placeholder frame
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 240;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.fillStyle = "#333";
              ctx.fillRect(0, 0, 320, 240);
            }
            cachedBlob = await new Promise<Blob>((resolve) => {
              canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.8);
            });
          }

          // Publish source frame at 2fps (image) or 10fps (video)
          const interval = targetCard.type === "video" ? 100 : 500;
          startPublishing(session, captureSourceFrame, interval);

          session.onFrame = (url) => {
            updateCard(streamCard.id, { url });
          };
          session.onStatus = (msg) => {
            // Status updates handled silently
          };
          session.onError = (err) => {
            addMessage(`LV2V: ${err}`, "system");
          };

          startPolling(session, 200);
          addMessage(`LV2V stream started from "${targetCard.title}"`, "agent");
        } catch (e) {
          addMessage(`LV2V error: ${e instanceof Error ? e.message : "Unknown"}`, "system");
        }
        return;
      }

      // --- Direct execution ---
      const config = DIRECT_CONFIG[action.id];
      if (!config) return;

      let prompt = config.defaultPrompt || null;
      if (!prompt) {
        prompt = window.prompt(`${action.label.replace("\u2026", "")} — describe what you want:`);
        if (!prompt) return;
      }

      // Resolve capability through live registry
      const resolved = resolveCapability(config.capability, action.id) || config.capability;

      const newRefId = `${action.id}_${Date.now()}`;
      const card = addCard({
        type: config.newType as Card["type"],
        title: prompt.slice(0, 40),
        refId: newRefId,
      });

      addEdge(targetCard.refId, newRefId, {
        capability: resolved,
        prompt,
        action: action.id,
      });

      try {
        const params: Record<string, unknown> = {};
        if (targetCard.url) {
          if (targetCard.type === "video" || action.id === "transform-video") {
            params.video_url = targetCard.url;
          } else {
            params.image_url = targetCard.url;
          }
        }

        const t0 = performance.now();
        const result = await runInference({ capability: resolved, prompt, params });
        const elapsed = performance.now() - t0;

        const r = result as Record<string, unknown>;
        const data = (r.data ?? r) as Record<string, unknown>;
        const image = data.image as { url: string } | undefined;
        const images = data.images as Array<{ url: string }> | undefined;
        const video = data.video as { url: string } | undefined;
        const audio = data.audio as { url: string } | undefined;
        const url =
          (r.image_url as string) ??
          images?.[0]?.url ??
          image?.url ??
          (r.video_url as string) ??
          video?.url ??
          (r.audio_url as string) ??
          audio?.url ??
          (data.url as string);

        const effectiveError = (r.error as string) || (data.error as string);
        if (effectiveError) {
          updateCard(card.id, { error: effectiveError });
        } else if (url) {
          updateCard(card.id, { url });
          addMessage(`${action.label.replace("\u2026", "")} — ${resolved} (${(elapsed / 1000).toFixed(1)}s)`, "agent");
        } else {
          updateCard(card.id, { error: "No media returned" });
        }

        addEdge(targetCard.refId, newRefId, { capability: resolved, prompt, action: action.id, elapsed });
      } catch (e) {
        updateCard(card.id, { error: e instanceof Error ? e.message : "Unknown error" });
      }
    },
    [targetCard, addCard, addEdge, updateCard, addMessage, prefillChat, sendToAgent]
  );

  if (!visible || !targetCard) return null;

  const hasMedia = !!targetCard.url;
  const directActions = ACTIONS.filter(
    (a) => a.mode === "direct" && a.forTypes.includes(targetCard.type) && (!a.requiresMedia || hasMedia)
  );
  const chatActions = ACTIONS.filter(
    (a) => a.mode === "chat" && a.forTypes.includes(targetCard.type) && (!a.requiresMedia || hasMedia)
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-[2500] min-w-[200px] overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(16,16,16,0.96)] py-1 shadow-[var(--shadow-lg)] backdrop-blur-xl backdrop-saturate-[1.3]"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Direct actions */}
      {directActions.map((action) => (
        <button
          key={action.id}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text)]"
          onClick={() => handleAction(action)}
        >
          <span className="w-4 text-center">{action.icon}</span>
          {action.label}
        </button>
      ))}

      {/* Separator */}
      {directActions.length > 0 && chatActions.length > 0 && (
        <div className="my-1 h-px bg-white/[0.06]" />
      )}

      {/* Agent-assisted actions */}
      {chatActions.map((action) => (
        <button
          key={action.id}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-dim)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-muted)]"
          onClick={() => handleAction(action)}
        >
          <span className="w-4 text-center">{action.icon}</span>
          {action.label}
        </button>
      ))}

      {directActions.length === 0 && chatActions.length === 0 && (
        <div className="px-3 py-2 text-xs text-[var(--text-dim)]">No actions available</div>
      )}
    </div>
  );
}
