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
  // --- Save ---
  { id: "save", label: "Save to File", icon: "\u2B07", forTypes: ["image", "video", "audio"], requiresMedia: true, mode: "direct" },
  // --- Direct execution (one-click, no prompt needed) ---
  { id: "upscale", label: "Upscale", icon: "\u2B06", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "remove-bg", label: "Remove Background", icon: "\u2702", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  // --- Direct execution with prompt ---
  { id: "animate", label: "Animate\u2026", icon: "\u25B6", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "restyle", label: "Restyle\u2026", icon: "\u2728", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "to-3d", label: "Convert to 3D\u2026", icon: "\uD83D\uDDA5", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "virtual-tryon", label: "Virtual Try-On\u2026", icon: "\uD83D\uDC55", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "weather-effect", label: "Weather Effect\u2026", icon: "\u26C5", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "lego-style", label: "LEGO Style", icon: "\uD83E\uDDF1", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "make-logo", label: "Make Logo\u2026", icon: "\uD83C\uDFA8", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "replace-object", label: "Replace Object\u2026", icon: "\uD83D\uDD04", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "iso-style", label: "Isometric SVG Style", icon: "\u25C6", forTypes: ["image"], requiresMedia: true, mode: "direct" },
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
  "to-3d": { capability: "tripo-i3d", newType: "image", defaultPrompt: "Convert to 3D model" },
  upscale: { capability: "topaz-upscale", newType: "image", defaultPrompt: "Upscale and enhance with sharp details" },
  "remove-bg": { capability: "bg-remove", newType: "image", defaultPrompt: "Remove background" },
  "transform-video": { capability: "ltx-t2v", newType: "video" },
  "lego-style": { capability: "kontext-edit", newType: "image", defaultPrompt: "Convert to LEGO minifigure style, plastic bricks, yellow skin, brick studs background, toy photography, vibrant colors" },
  "iso-style": { capability: "kontext-edit", newType: "image", defaultPrompt: "Convert to minimalist isometric illustration, clean black lines on white background, simple geometric 3D perspective, SVG-style vector art, no shading" },
};

export function ContextMenu() {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [targetCard, setTargetCard] = useState<Card | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { addCard, addEdge, updateCard } = useCanvasStore();
  const addMessage = useChatStore((s) => s.addMessage);

  // Import dialog state
  const [importDialog, setImportDialog] = useState<{
    previewUrl?: string;
    fileName?: string;
    urlInput?: string;
    file?: File;
  } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { card: Card; x: number; y: number };
      setTargetCard(detail.card);
      setPos({ x: detail.x, y: detail.y });
      setVisible(true);
    };
    window.addEventListener("card-context-menu", handler);

    // Empty-space right-click → import menu
    const canvasHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number };
      setTargetCard(null); // no card targeted → import mode
      setPos({ x: detail.x, y: detail.y });
      setVisible(true);
    };
    window.addEventListener("canvas-context-menu", canvasHandler);

    return () => {
      window.removeEventListener("card-context-menu", handler);
      window.removeEventListener("canvas-context-menu", canvasHandler);
    };
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

      // --- Save to file ---
      if (action.id === "save") {
        const { downloadCard } = await import("@/lib/utils/download");
        const ok = await downloadCard(targetCard);
        addMessage(ok ? `Saved ${targetCard.refId}` : `Failed to save ${targetCard.refId}`, "system");
        return;
      }

      // --- Make Logo: extract key elements from image → generate logo ---
      if (action.id === "make-logo") {
        const brandInfo = window.prompt(
          "Describe the logo you want:\ne.g. tech startup called 'Nexus', minimalist, blue and silver"
        );
        if (!brandInfo) return;
        addMessage(`Creating logo inspired by "${targetCard.title}"…`, "system");
        try {
          const { runInference } = await import("@/lib/sdk/client");
          const result = await runInference({
            capability: "kontext-edit",
            prompt: `Create a professional logo: ${brandInfo}. Clean vector style, centered design, simple background, brand identity`,
            params: { image_url: targetCard.url },
          });
          const r = result as Record<string, unknown>;
          const data = (r.data ?? r) as Record<string, unknown>;
          const images = data.images as Array<{ url: string }> | undefined;
          const url = (r.image_url as string) ?? images?.[0]?.url ?? (data.image as { url: string })?.url;
          if (url) {
            const card = addCard({ type: "image", title: `Logo: ${brandInfo.slice(0, 30)}`, refId: `img-${Date.now()}` });
            updateCard(card.id, { url });
            addEdge(targetCard.refId, card.refId, { capability: "kontext-edit", prompt: brandInfo, action: "logo" });
            addMessage("Logo created!", "system");
          } else {
            addMessage("Logo generation returned no image.", "system");
          }
        } catch (e) {
          addMessage(`Logo failed: ${e instanceof Error ? e.message : "unknown"}`, "system");
        }
        return;
      }

      // --- Replace Object: describe what to replace → what to put ---
      if (action.id === "replace-object") {
        const whatToReplace = window.prompt("What object do you want to replace?\ne.g. the car, the sky, the person's hat");
        if (!whatToReplace) return;
        const replaceWith = window.prompt(`Replace "${whatToReplace}" with what?\ne.g. a spaceship, a sunset sky, a crown`);
        if (!replaceWith) return;
        addMessage(`Replacing "${whatToReplace}" with "${replaceWith}" in "${targetCard.title}"…`, "system");
        try {
          const { runInference } = await import("@/lib/sdk/client");
          const result = await runInference({
            capability: "kontext-edit",
            prompt: `Replace the ${whatToReplace} with ${replaceWith}. Keep everything else exactly the same. Seamless, photorealistic edit.`,
            params: { image_url: targetCard.url },
          });
          const r = result as Record<string, unknown>;
          const data = (r.data ?? r) as Record<string, unknown>;
          const images = data.images as Array<{ url: string }> | undefined;
          const url = (r.image_url as string) ?? images?.[0]?.url ?? (data.image as { url: string })?.url;
          if (url) {
            const card = addCard({ type: "image", title: `${replaceWith} — ${targetCard.title}`, refId: `img-${Date.now()}` });
            updateCard(card.id, { url });
            addEdge(targetCard.refId, card.refId, { capability: "kontext-edit", prompt: `${whatToReplace} → ${replaceWith}`, action: "replace" });
            addMessage(`Replaced "${whatToReplace}" with "${replaceWith}"!`, "system");
          } else {
            addMessage("Replacement returned no image.", "system");
          }
        } catch (e) {
          addMessage(`Replace failed: ${e instanceof Error ? e.message : "unknown"}`, "system");
        }
        return;
      }

      // --- Virtual Try-On: person card + garment card → result ---
      if (action.id === "virtual-tryon") {
        const garmentRef = window.prompt(
          "Enter the garment card refId (e.g. img-3).\nThe current card will be used as the person image."
        );
        if (!garmentRef) return;
        const allCards = useCanvasStore.getState().cards;
        const garmentCard = allCards.find((c) => c.refId === garmentRef.trim());
        if (!garmentCard?.url) {
          addMessage(`Card "${garmentRef}" not found or has no image.`, "system");
          return;
        }
        addMessage(`Starting virtual try-on: person="${targetCard.title}" + garment="${garmentCard.title}"`, "system");
        try {
          const { runInference } = await import("@/lib/sdk/client");
          const result = await runInference({
            capability: "fashn-tryon",
            prompt: "virtual try-on",
            params: {
              model_image: targetCard.url,
              garment_image: garmentCard.url,
              category: "auto",
            },
          });
          const r = result as Record<string, unknown>;
          const data = (r.data ?? r) as Record<string, unknown>;
          const images = data.images as Array<{ url: string }> | undefined;
          const output = data.output as string | undefined;
          const url = (r.image_url as string) ?? images?.[0]?.url ?? (data.image as { url: string })?.url ?? output;
          if (url) {
            const card = addCard({ type: "image", title: `Try-On: ${targetCard.title}`, refId: `img-${Date.now()}` });
            updateCard(card.id, { url });
            addEdge(targetCard.refId, card.refId, { capability: "fashn-tryon", action: "tryon" });
            addMessage("Virtual try-on complete!", "system");
          } else {
            addMessage("Try-on returned no image — try different source images.", "system");
          }
        } catch (e) {
          addMessage(`Try-on failed: ${e instanceof Error ? e.message : "unknown"}`, "system");
        }
        return;
      }

      // --- Weather Effect: image + weather text → modified image → animated video ---
      if (action.id === "weather-effect") {
        const weatherText = window.prompt(
          "Describe the weather effect:\ne.g. heavy rain, thunderstorm, snow falling, sunny with lens flare"
        );
        if (!weatherText) return;
        addMessage(`Adding weather effect "${weatherText}" to "${targetCard.title}"…`, "system");
        try {
          const { runInference } = await import("@/lib/sdk/client");
          // Step 1: Apply weather to image via kontext-edit
          const editResult = await runInference({
            capability: "kontext-edit",
            prompt: `Add realistic ${weatherText} weather effect to this scene, dramatic atmosphere`,
            params: { image_url: targetCard.url },
          });
          const editData = (editResult as Record<string, unknown>).data ?? editResult;
          const editImages = (editData as Record<string, unknown>).images as Array<{ url: string }> | undefined;
          const weatherImageUrl = ((editResult as Record<string, unknown>).image_url as string) ?? editImages?.[0]?.url;
          if (!weatherImageUrl) {
            addMessage("Weather image generation failed — try a different description.", "system");
            return;
          }
          // Create the weather image card
          const imgCard = addCard({ type: "image", title: `${weatherText} — ${targetCard.title}`, refId: `img-${Date.now()}` });
          updateCard(imgCard.id, { url: weatherImageUrl });
          addEdge(targetCard.refId, imgCard.refId, { capability: "kontext-edit", prompt: weatherText, action: "weather" });
          addMessage(`Weather image ready. Animating with video…`, "system");

          // Step 2: Animate the weather image into a video
          const vidResult = await runInference({
            capability: "kling-i2v",
            prompt: `${weatherText} weather, atmospheric motion, cinematic`,
            params: { image_url: weatherImageUrl },
          });
          const vidData = (vidResult as Record<string, unknown>).data ?? vidResult;
          const videoUrl = ((vidResult as Record<string, unknown>).video_url as string)
            ?? ((vidData as Record<string, unknown>).video as { url: string })?.url;
          if (videoUrl) {
            const vidCard = addCard({ type: "video", title: `Weather Video: ${weatherText}`, refId: `vid-${Date.now()}` });
            updateCard(vidCard.id, { url: videoUrl });
            addEdge(imgCard.refId, vidCard.refId, { capability: "kling-i2v", prompt: weatherText, action: "animate" });
            addMessage("Weather video complete!", "system");
          } else {
            addMessage("Weather image created but video animation failed. The image is still on the canvas.", "system");
          }
        } catch (e) {
          addMessage(`Weather effect failed: ${e instanceof Error ? e.message : "unknown"}`, "system");
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

          // Build frame source based on card type
          let cachedImageBlob: Blob | null = null;
          let videoEl: HTMLVideoElement | null = null;
          const captureCanvas = document.createElement("canvas");
          const captureCtx = captureCanvas.getContext("2d");

          if (targetCard.type === "video" && targetCard.url) {
            // For video cards: create a hidden video element, play it in loop,
            // capture frames continuously at 10fps
            videoEl = document.createElement("video");
            videoEl.src = targetCard.url;
            videoEl.crossOrigin = "anonymous";
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.playsInline = true;
            await videoEl.play().catch(() => {});
            // Wait for first frame
            await new Promise((r) => setTimeout(r, 500));
          } else if (targetCard.url) {
            // For image cards: fetch once, cache
            try {
              const resp = await fetch(targetCard.url);
              cachedImageBlob = await resp.blob();
            } catch { /* fallback below */ }
          }

          const captureSourceFrame = (): Blob | null => {
            // Video: capture current frame from video element
            if (videoEl && videoEl.videoWidth > 0 && captureCtx) {
              const w = Math.min(videoEl.videoWidth, 640);
              const h = Math.min(videoEl.videoHeight, 480);
              captureCanvas.width = w;
              captureCanvas.height = h;
              captureCtx.drawImage(videoEl, 0, 0, w, h);
              const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.8);
              const bin = atob(dataUrl.split(",")[1]);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              return new Blob([arr], { type: "image/jpeg" });
            }
            // Image: return cached blob
            return cachedImageBlob;
          };

          // Video: 10fps (100ms), Image: 2fps (500ms)
          const interval = videoEl ? 100 : 500;
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

  if (!visible) return null;

  // --- Import mode (right-click on empty canvas) ---
  if (!targetCard) {
    const handleImportFile = () => {
      setVisible(false);
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const isVideo = file.type.startsWith("video");
        const type = isVideo ? "video" as const : "image" as const;
        const store = useCanvasStore.getState();
        const cardNum = store.cards.length + 1;
        const refId = `${isVideo ? "vid" : "img"}-${cardNum}`;
        const title = file.name.replace(/\.[^.]+$/, "").slice(0, 40);

        // Show card immediately with blob URL for preview
        const blobUrl = URL.createObjectURL(file);
        const card = store.addCard({ type, title, refId });
        store.updateCard(card.id, { url: blobUrl });
        addMessage(`Imported: ${refId} — "${title}". Uploading…`, "system");

        // Upload to get a public HTTP URL (needed for inference/restyle/animate)
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const resp = await fetch("/api/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dataUrl: reader.result, fileName: file.name }),
            });
            if (resp.ok) {
              const { url } = (await resp.json()) as { url: string };
              store.updateCard(card.id, { url });
              addMessage(`${refId} uploaded — ready for restyle, animate, try-on, etc.`, "system");
            }
          } catch { /* upload failed — blob URL still works for display */ }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    const handleImportUrl = () => {
      setVisible(false);
      const url = window.prompt("Paste image or video URL:");
      if (!url?.trim()) return;
      const isVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url);
      const type = isVideo ? "video" as const : "image" as const;
      const store = useCanvasStore.getState();
      const cardNum = store.cards.length + 1;
      const refId = `${isVideo ? "vid" : "img"}-${cardNum}`;
      const title = url.split("/").pop()?.split("?")[0]?.slice(0, 40) || "Imported";
      const card = store.addCard({ type, title, refId });
      store.updateCard(card.id, { url: url.trim() });
      addMessage(`Imported from URL: ${refId} — "${title}". Right-click for actions.`, "system");
    };

    return (
      <div
        ref={menuRef}
        className="fixed z-[2500] min-w-[180px] overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(16,16,16,0.96)] py-1 shadow-[var(--shadow-lg)] backdrop-blur-xl backdrop-saturate-[1.3]"
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Import
        </div>
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text)]"
          onClick={handleImportFile}
        >
          <span className="w-4 text-center">📁</span> From Computer
        </button>
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text)]"
          onClick={handleImportUrl}
        >
          <span className="w-4 text-center">🔗</span> From Internet (URL)
        </button>
      </div>
    );
  }

  // --- Card mode (right-click on a card) ---
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
