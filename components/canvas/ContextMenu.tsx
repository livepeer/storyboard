"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import { runInference } from "@/lib/sdk/client";
import { resolveCapability, getCachedCapabilities } from "@/lib/sdk/capabilities";
import { buildAttemptChain, extractFalError, isRecoverableFailure } from "@/lib/tools/compound-tools";
import { resizeImageForModel } from "@livepeer/creative-kit";
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
  { id: "seedance", label: "Cinematic Video (Seedance)\u2026", icon: "\uD83C\uDFAC", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "restyle", label: "Restyle\u2026", icon: "\u2728", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "to-3d", label: "3D Model (H3.1)\u2026", icon: "\uD83D\uDDA5", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "to-3d-fast", label: "3D Model (Fast)\u2026", icon: "\u26A1", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "virtual-tryon", label: "Virtual Try-On\u2026", icon: "\uD83D\uDC55", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "video-tryon", label: "Video Try-On\u2026", icon: "\uD83C\uDFA5", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "weather-effect", label: "Weather Effect\u2026", icon: "\u26C5", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "lego-style", label: "LEGO Style", icon: "\uD83E\uDDF1", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "make-logo", label: "Make Logo\u2026", icon: "\uD83C\uDFA8", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "replace-object", label: "Replace Object\u2026", icon: "\uD83D\uDD04", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "iso-style", label: "Isometric SVG Style", icon: "\u25C6", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "talking-video", label: "Talking Video\u2026", icon: "\uD83D\uDDE3", forTypes: ["image"], requiresMedia: true, mode: "direct" },
  { id: "analyze", label: "Analyze Media", icon: "\uD83D\uDD0D", forTypes: ["image", "video"], requiresMedia: true, mode: "direct" },
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
  seedance: { capability: "seedance-i2v", newType: "video" },
  restyle: { capability: "kontext-edit", newType: "image" },
  "to-3d": { capability: "tripo-i3d", newType: "image", defaultPrompt: "Convert to 3D model" },
  "to-3d-fast": { capability: "tripo-p1-i3d", newType: "image", defaultPrompt: "Convert to 3D model (fast)" },
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

  // Styled prompt dialog — Promise-based drop-in for window.prompt()
  const [promptState, setPromptState] = useState<{
    title: string;
    placeholder: string;
    value: string;
    resolve: (value: string | null) => void;
  } | null>(null);

  const styledPrompt = useCallback((title: string, placeholder: string, defaultValue = ""): Promise<string | null> => {
    return new Promise((resolve) => {
      setPromptState({ title, placeholder, value: defaultValue, resolve });
    });
  }, []);

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

      // Read the CURRENT card from the store — targetCard is a stale
      // snapshot from when the menu opened. If a background upload
      // (GCS) finished between menu-open and action-click, the card's
      // URL will have changed from blob: to https://storage.googleapis.com/...
      // Merge fresh store data into targetCard so all references below
      // use the latest URL (after GCS upload finishes, url changes from
      // blob:... to https://storage.googleapis.com/...)
      const freshFromStore = useCanvasStore.getState().cards.find((c) => c.id === targetCard.id);
      if (freshFromStore) {
        // Mutate the local ref — safe because targetCard is a state snapshot
        // that won't be read again after this handler returns.
        Object.assign(targetCard, { url: freshFromStore.url, type: freshFromStore.type });
      }

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
        const brandInfo = await styledPrompt("Make Logo", "e.g. tech startup Nexus, minimalist, blue and silver");
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
        const whatToReplace = await styledPrompt("Replace Object", "What to replace? e.g. the car, the sky");
        if (!whatToReplace) return;
        const replaceWith = await styledPrompt(`Replace "${whatToReplace}" with`, "e.g. a spaceship, a sunset sky");
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
        const garmentRef = await styledPrompt("Virtual Try-On", "Enter garment card refId (e.g. img-3)");
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

      // --- Video Try-On: person + garment → tryon image → animate to video ---
      if (action.id === "video-tryon") {
        const garmentRef = await styledPrompt("Video Try-On", "Enter garment card name (e.g. img-3)");
        if (!garmentRef) return;
        const allCards = useCanvasStore.getState().cards;
        const garmentCard = allCards.find((c) => c.refId === garmentRef.trim());
        if (!garmentCard?.url) {
          addMessage(`Card "${garmentRef}" not found or has no image.`, "system");
          return;
        }

        addMessage(`Video try-on: person="${targetCard.title}" + garment="${garmentCard.title}" → tryon → video`, "system");

        try {
          // Step 1: fashn-tryon (person + garment → still image)
          addMessage("Step 1/2: Running virtual try-on…", "system");
          const tryonResult = await runInference({
            capability: "fashn-tryon",
            prompt: "virtual try-on",
            params: {
              model_image: targetCard.url,
              garment_image: garmentCard.url,
              category: "auto",
            },
          });
          const tr = tryonResult as Record<string, unknown>;
          const td = (tr.data ?? tr) as Record<string, unknown>;
          const tImages = td.images as Array<{ url: string }> | undefined;
          const tryonUrl = (tr.image_url as string) ?? tImages?.[0]?.url ?? (td.image as { url: string })?.url ?? (td.output as string);
          const tryonError = extractFalError(td);

          if (!tryonUrl) {
            addMessage(`Try-on failed: ${tryonError || "No image returned"}`, "system");
            return;
          }

          // Show the tryon still as an intermediate card
          const tryonCard = addCard({ type: "image", title: `Try-On: ${targetCard.title}`, refId: `tryon-${Date.now()}` });
          updateCard(tryonCard.id, { url: tryonUrl, capability: "fashn-tryon" });
          addEdge(targetCard.refId, tryonCard.refId, { capability: "fashn-tryon", action: "tryon" });

          // Step 2: animate the tryon result → video (with fallback chain)
          addMessage("Step 2/2: Animating to video…", "system");
          const liveCapNames = new Set(
            (getCachedCapabilities() || []).map((c: { name: string }) => c.name)
          );
          const videoChain = buildAttemptChain("seedance-i2v", liveCapNames);

          let videoOk = false;
          for (let ai = 0; ai < videoChain.length; ai++) {
            const cap = videoChain[ai];
            if (ai > 0) addMessage(`${videoChain[ai - 1]} rejected — trying ${cap}…`, "system");

            try {
              const vParams: Record<string, unknown> = { image_url: tryonUrl };
              if (cap.startsWith("seedance")) {
                vParams.duration = "10";
                vParams.generate_audio = true;
              }
              const vResult = await runInference({
                capability: cap,
                prompt: "Model walks confidently, slight turn showing the outfit from different angles, natural movement, fashion runway style",
                params: vParams,
              });
              const vr = vResult as Record<string, unknown>;
              const vd = (vr.data ?? vr) as Record<string, unknown>;
              const videoUrl = (vr.video_url as string) ?? (vd.video as { url: string })?.url;
              const vError = extractFalError(vd);

              if (videoUrl && !vError) {
                const vidCard = addCard({ type: "video", title: `Video Try-On: ${targetCard.title}`, refId: `vid-tryon-${Date.now()}` });
                updateCard(vidCard.id, { url: videoUrl, capability: cap });
                addEdge(tryonCard.refId, vidCard.refId, { capability: cap, action: "animate" });
                addMessage(`Video try-on complete — ${cap}`, "system");
                videoOk = true;
                break;
              }
              if (!isRecoverableFailure(vError || "")) break;
            } catch (ve) {
              const msg = ve instanceof Error ? ve.message : "";
              if (!isRecoverableFailure(msg)) break;
            }
          }

          if (!videoOk) {
            addMessage("Video animation failed — the try-on image is on the canvas. Right-click it to animate manually.", "system");
          }
        } catch (e) {
          addMessage(`Video try-on failed: ${e instanceof Error ? e.message : "unknown"}`, "system");
        }
        return;
      }

      // --- Weather Effect: image + weather text → modified image → animated video ---
      if (action.id === "weather-effect") {
        const weatherText = await styledPrompt("Weather Effect", "e.g. heavy rain, thunderstorm, snow falling");
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
        const prompt = await styledPrompt("LV2V Stream", "e.g. cyberpunk neon scene", "transform into a cyberpunk scene with neon lights");
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

      // --- Talking Video: picture + text + optional voice clone → talking head video ---
      if (action.id === "talking-video") {
        if (!targetCard.url) { addMessage("Card has no image.", "system"); return; }

        // Step 1: Get the speech text
        const speechText = await styledPrompt("Talking Video", "What should they say?");
        if (!speechText) return;

        // Step 2: Get optional voice clone source
        const allCards = useCanvasStore.getState().cards;
        const audioCards = allCards.filter((c) => c.type === "audio" && c.url);
        let voiceHint = "";
        if (audioCards.length > 0) {
          const cardList = audioCards.map((c) => c.refId).join(", ");
          voiceHint = ` (audio cards: ${cardList})`;
        }
        const voiceRef = await styledPrompt("Voice Clone (optional)", `Card name to clone voice from${voiceHint}, or leave blank for default`);
        const voiceCard = voiceRef ? allCards.find((c) => c.refId === voiceRef.trim()) : null;

        addMessage(`Creating talking video: "${speechText.slice(0, 40)}…"${voiceCard ? ` (voice: ${voiceCard.refId})` : ""}`, "system");

        try {
          // Step A: Generate speech audio via chatterbox-tts (with optional voice clone)
          addMessage("Step 1/2: Generating speech…", "system");
          const ttsParams: Record<string, unknown> = { text: speechText };
          if (voiceCard?.url) ttsParams.audio_url = voiceCard.url;

          const ttsResult = await runInference({
            capability: "chatterbox-tts",
            prompt: speechText,
            params: ttsParams,
          });
          const tr = ttsResult as Record<string, unknown>;
          const td = (tr.data ?? tr) as Record<string, unknown>;
          const audioUrl = (tr.audio_url as string)
            ?? (td.audio as { url: string })?.url
            ?? (td.audio_file as { url: string })?.url;
          const ttsError = extractFalError(td);

          if (!audioUrl) {
            addMessage(`Speech generation failed: ${ttsError || "No audio returned"}`, "system");
            return;
          }

          // Show the audio as an intermediate card
          const audioCard = addCard({ type: "audio", title: `Speech: ${speechText.slice(0, 25)}`, refId: `aud-talk-${Date.now()}` });
          updateCard(audioCard.id, { url: audioUrl, capability: "chatterbox-tts" });
          addEdge(targetCard.refId, audioCard.refId, { capability: "chatterbox-tts", action: "tts" });

          // Step B: Animate with talking-head (image + audio → video)
          addMessage("Step 2/2: Animating talking head…", "system");
          const thResult = await runInference({
            capability: "talking-head",
            prompt: "talking head animation",
            params: { image_url: targetCard.url, audio_url: audioUrl },
          });
          const vr = thResult as Record<string, unknown>;
          const vd = (vr.data ?? vr) as Record<string, unknown>;
          const videoUrl = (vr.video_url as string) ?? (vd.video as { url: string })?.url;
          const thError = extractFalError(vd);

          if (videoUrl && !thError) {
            const vidCard = addCard({ type: "video", title: `Talking: ${targetCard.title}`, refId: `vid-talk-${Date.now()}` });
            updateCard(vidCard.id, { url: videoUrl, capability: "talking-head" });
            addEdge(audioCard.refId, vidCard.refId, { capability: "talking-head", action: "animate" });
            addMessage("Talking video complete!", "system");
          } else {
            addMessage(`Talking head failed: ${thError || "No video returned"}. Audio is on the canvas — try lipsync manually.`, "system");
          }
        } catch (e) {
          addMessage(`Talking video failed: ${e instanceof Error ? e.message : "unknown"}`, "system");
        }
        return;
      }

      // --- Analyze Media: extract style, characters, setting via Gemini Vision ---
      if (action.id === "analyze") {
        if (!targetCard.url) {
          addMessage("Card has no media to analyze.", "system");
          return;
        }
        addMessage(`Analyzing "${targetCard.title}"…`, "system");
        try {
          const { analyzeImage } = await import("@/lib/tools/image-analysis");
          const result = await analyzeImage(targetCard.url);
          if (!result.ok) {
            addMessage(`Analysis failed: ${result.error}`, "system");
            return;
          }
          const a = result.analysis;
          const lines = [
            `**${targetCard.title}** — Analysis`,
            "",
            `Style: ${a.style}`,
            `Palette: ${a.palette}`,
            `Characters: ${a.characters}`,
            `Setting: ${a.setting}`,
            `Mood: ${a.mood}`,
            "",
            a.description,
            "",
            `(${result.tokens.input + result.tokens.output} tokens)`,
          ];
          addMessage(lines.join("\n"), "system");

          // Offer to apply as creative context
          const { useSessionContext } = await import("@/lib/agents/session-context");
          const existing = useSessionContext.getState().context;
          if (!existing) {
            useSessionContext.getState().setContext({
              style: a.style,
              palette: a.palette,
              characters: a.characters,
              setting: a.setting,
              mood: a.mood,
              rules: "",
            });
            addMessage("Applied as creative context — future generations will match this style.", "system");
          }
        } catch (e) {
          addMessage(`Analysis error: ${e instanceof Error ? e.message : "unknown"}`, "system");
        }
        return;
      }

      // --- Direct execution ---
      const config = DIRECT_CONFIG[action.id];
      if (!config) return;

      let prompt = config.defaultPrompt || null;
      const isVideoAction = action.id === "seedance" || action.id === "animate";
      if (!prompt) {
        const placeholder = isVideoAction
          ? "Describe motion… (add 5s/10s/15s for duration, default 10s)"
          : "Describe what you want…";
        prompt = await styledPrompt(action.label.replace("\u2026", ""), placeholder);
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
        // Video actions: parse duration from prompt (e.g. "15s", "10 seconds"),
        // default 10s. Only set for seedance (other models don't accept it).
        if (isVideoAction) {
          const durMatch = prompt.match(/\b(\d{1,2})\s*s(?:ec(?:onds?)?)?\b/i);
          const duration = durMatch ? Math.min(15, Math.max(4, parseInt(durMatch[1], 10))) : 10;
          // Strip the duration token from the prompt sent to the model
          prompt = prompt.replace(/\b\d{1,2}\s*s(?:ec(?:onds?)?)?\b/i, "").replace(/\s{2,}/g, " ").trim();
          if (action.id === "seedance") {
            params.duration = String(duration);
            params.generate_audio = true;
          }
        }

        // Ensure image_url is a fetchable HTTP URL for fal.ai.
        // HTTP fal CDN URLs (https://v3b.fal.media/...) → pass through (fal can download its own CDN)
        // blob:/data: URLs → resize + upload to GCS to get a public HTTPS URL
        if (isVideoAction && params.image_url && typeof params.image_url === "string") {
          const imgUrl = params.image_url as string;
          const isHttp = imgUrl.startsWith("http://") || imgUrl.startsWith("https://");
          if (!isHttp) {
            // Non-HTTP URL (blob: or data:) — must convert to public HTTPS
            try {
              params.image_url = await resizeImageForModel(imgUrl);
            } catch (e) {
              console.warn("[ContextMenu] Image prep failed:", (e as Error).message);
            }
          }
          // HTTP URLs pass through — fal.ai fetches them directly
        }

        // Build fallback chain so content-policy rejections from one
        // model automatically try the next (e.g., seedance → veo → ltx).
        const liveCapNames = new Set(
          (getCachedCapabilities() || []).map((c: { name: string }) => c.name)
        );
        const attemptChain = buildAttemptChain(resolved, liveCapNames);

        let succeeded = false;
        for (let ai = 0; ai < attemptChain.length; ai++) {
          const currentCap = attemptChain[ai];
          if (ai > 0) {
            addMessage(`${attemptChain[ai - 1]} rejected — trying ${currentCap}…`, "system");
          }

          // Adapt params per model — each i2v model has different duration format.
          // Strip model-specific params when falling back to avoid validation errors.
          const capParams = { ...params };
          if (!currentCap.startsWith("seedance")) {
            delete capParams.duration;
            delete capParams.generate_audio;
          }

          const t0 = performance.now();
          const result = await runInference({ capability: currentCap, prompt, params: capParams });
          const elapsed = performance.now() - t0;

          const r = result as Record<string, unknown>;
          const data = (r.data ?? r) as Record<string, unknown>;
          const image = data.image as { url: string } | undefined;
          const images = data.images as Array<{ url: string }> | undefined;
          const video = data.video as { url: string } | undefined;
          const audio = data.audio as { url: string } | undefined;
          const renderedImage = data.rendered_image as { url: string } | undefined;
          const modelMesh = data.model_mesh as { url: string } | undefined;
          const url =
            (r.image_url as string) ??
            images?.[0]?.url ??
            image?.url ??
            renderedImage?.url ??
            (r.video_url as string) ??
            video?.url ??
            (r.audio_url as string) ??
            audio?.url ??
            modelMesh?.url ??
            (data.url as string);

          // Check for errors (including fal's data.detail format)
          const effectiveError = (r.error as string) || (data.error as string) || extractFalError(data);

          if (url && !effectiveError) {
            updateCard(card.id, { url, capability: currentCap, elapsed });
            const elapsedSec = (elapsed / 1000).toFixed(1);
            const balance = r.balance as string | undefined;
            const orchElapsed = r.elapsed_ms as number | undefined;
            const costInfo = balance && balance !== "0" ? ` · balance: ${balance}` : "";
            const orchInfo = orchElapsed ? ` · orch: ${(orchElapsed / 1000).toFixed(1)}s` : "";
            const capLabel = ai > 0 ? `${currentCap} (fallback)` : currentCap;
            addMessage(`${action.label.replace("\u2026", "")} — ${capLabel} (${elapsedSec}s${orchInfo}${costInfo})`, "system");
            addEdge(targetCard.refId, newRefId, { capability: currentCap, prompt, action: action.id, elapsed });
            succeeded = true;
            break;
          }

          // Failed — check if recoverable (worth trying sibling)
          const failMsg = effectiveError || "No output";
          console.warn(`[ContextMenu] ${currentCap} failed: ${failMsg}`);
          if (!isRecoverableFailure(failMsg)) break; // auth/network — cycling won't help
        }

        if (!succeeded) {
          updateCard(card.id, { error: `All models rejected — try a different image or prompt` });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        console.error(`[ContextMenu] ${action.id} failed:`, errMsg);
        let friendly = errMsg;
        if (errMsg.includes("No orchestrator available") || errMsg.includes("No capacity")) {
          friendly = `${resolved} not available — try again or use a different model`;
        } else if (errMsg.includes("signer") || errMsg.includes("401")) {
          friendly = "Auth error — check your API key in settings";
        } else if (errMsg.length > 120) {
          friendly = errMsg.slice(0, 120) + "…";
        }
        updateCard(card.id, { error: friendly });
      }
    },
    [targetCard, addCard, addEdge, updateCard, addMessage, prefillChat, sendToAgent]
  );

  // Prompt dialog renders independently of menu visibility.
  // When user clicks "Restyle", menu closes + dialog opens in the same cycle.
  if (!visible && !promptState) return null;

  // Prompt dialog only (menu closed, dialog open)
  if (!visible && promptState) {
    return (
      <div className="fixed inset-0 z-[3000] flex items-start justify-center pt-[20vh]"
        onClick={() => { promptState.resolve(null); setPromptState(null); }}>
        <div className="w-[340px] rounded-2xl border border-[var(--border)] bg-[rgba(22,22,22,0.98)] p-4 shadow-2xl backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold text-[var(--text)]">{promptState.title}</div>
          <input autoFocus type="text" placeholder={promptState.placeholder} value={promptState.value}
            onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && promptState.value.trim()) { promptState.resolve(promptState.value.trim()); setPromptState(null); }
              if (e.key === "Escape") { promptState.resolve(null); setPromptState(null); }
            }}
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]" />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={() => { promptState.resolve(null); setPromptState(null); }}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]">Cancel</button>
            <button onClick={() => { if (promptState.value.trim()) { promptState.resolve(promptState.value.trim()); setPromptState(null); } }}
              disabled={!promptState.value.trim()}
              className="rounded-lg bg-purple-500/20 px-4 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 disabled:opacity-40">OK</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Import mode (right-click on empty canvas) ---
  if (!targetCard) {
    const handleImportFile = () => {
      setVisible(false);
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*,audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const isVideo = file.type.startsWith("video");
        const isAudio = file.type.startsWith("audio") || /\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(file.name);
        const type = isAudio ? "audio" as const : isVideo ? "video" as const : "image" as const;
        const store = useCanvasStore.getState();
        const cardNum = store.cards.length + 1;
        const prefix = isAudio ? "aud" : isVideo ? "vid" : "img";
        const refId = `${prefix}-${cardNum}`;
        const title = file.name.replace(/\.[^.]+$/, "").slice(0, 40);

        // Show card immediately with blob URL for instant preview
        const blobUrl = URL.createObjectURL(file);
        const card = store.addCard({ type, title, refId });
        store.updateCard(card.id, { url: blobUrl });
        const hint = isAudio ? `Use as voice source: /talk <text> --face <card> --voice ${refId}` : "Uploading for inference…";
        addMessage(`Imported: ${refId} — "${title}". ${hint}`, "system");

        // Upload to GCS (or fallback) in background so the card gets a
        // public HTTP URL that the BYOC orch can fetch for inference.
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const resp = await fetch("/api/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dataUrl: reader.result, fileName: file.name }),
            });
            if (resp.ok) {
              const { url: publicUrl } = (await resp.json()) as { url: string };
              // Only replace blob URL if we got a real public URL (not localhost)
              if (publicUrl.startsWith("https://")) {
                store.updateCard(card.id, { url: publicUrl });
                const readyHint = isAudio
                  ? `${refId} ready — use as voice: /talk <text> --face <card> --voice ${refId}`
                  : `${refId} ready — right-click for restyle, LEGO, animate, etc.`;
                addMessage(readyHint, "system");
              } else {
                // Fallback: keep data URL (fal accepts it for small images)
                store.updateCard(card.id, { url: reader.result as string });
                addMessage(`${refId} ready (local mode).`, "system");
              }
            } else {
              // Upload failed — use data URL directly
              store.updateCard(card.id, { url: reader.result as string });
            }
          } catch {
            store.updateCard(card.id, { url: reader.result as string });
          }
          // Don't revoke blob URL — it's still needed if the user right-clicks
          // before GCS upload finishes. Browser GC handles cleanup on page unload.
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    const handleImportUrl = async () => {
      setVisible(false);
      const url = await styledPrompt("Import from URL", "Paste image, video, or audio URL");
      if (!url?.trim()) return;
      const isAudio = /\.(wav|mp3|ogg|m4a|aac|flac)(\?|$)/i.test(url);
      const isVideo = !isAudio && /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url);
      const type = isAudio ? "audio" as const : isVideo ? "video" as const : "image" as const;
      const prefix = isAudio ? "aud" : isVideo ? "vid" : "img";
      const store = useCanvasStore.getState();
      const cardNum = store.cards.length + 1;
      const refId = `${prefix}-${cardNum}`;
      const title = url.split("/").pop()?.split("?")[0]?.slice(0, 40) || "Imported";
      const card = store.addCard({ type, title, refId });
      store.updateCard(card.id, { url: url.trim() });
      addMessage(`Imported from URL: ${refId} — "${title}". ${isAudio ? "Use as voice source with /talk --voice " + refId : "Right-click for actions."}`, "system");
    };

    return (
      <>
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
      {/* Prompt dialog renders here too so URL import can use it */}
      {promptState && (
        <div className="fixed inset-0 z-[3000] flex items-start justify-center pt-[20vh]"
          onClick={() => { promptState.resolve(null); setPromptState(null); }}>
          <div className="w-[340px] rounded-2xl border border-[var(--border)] bg-[rgba(22,22,22,0.98)] p-4 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-[var(--text)]">{promptState.title}</div>
            <input autoFocus type="text" placeholder={promptState.placeholder} value={promptState.value}
              onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && promptState.value.trim()) { promptState.resolve(promptState.value.trim()); setPromptState(null); } if (e.key === "Escape") { promptState.resolve(null); setPromptState(null); } }}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]" />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => { promptState.resolve(null); setPromptState(null); }} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]">Cancel</button>
              <button onClick={() => { if (promptState.value.trim()) { promptState.resolve(promptState.value.trim()); setPromptState(null); } }} disabled={!promptState.value.trim()} className="rounded-lg bg-purple-500/20 px-4 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 disabled:opacity-40">OK</button>
            </div>
          </div>
        </div>
      )}
      </>
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
    <>
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

    {/* Styled prompt dialog — appears near the card, replaces browser prompts */}
    {promptState && (
      <div
        className="fixed inset-0 z-[3000] flex items-start justify-center pt-[20vh]"
        onClick={() => { promptState.resolve(null); setPromptState(null); }}
      >
        <div
          className="w-[340px] rounded-2xl border border-[var(--border)] bg-[rgba(22,22,22,0.98)] p-4 shadow-2xl backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm font-semibold text-[var(--text)]">{promptState.title}</div>
          <input
            autoFocus
            type="text"
            placeholder={promptState.placeholder}
            value={promptState.value}
            onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && promptState.value.trim()) {
                promptState.resolve(promptState.value.trim());
                setPromptState(null);
              }
              if (e.key === "Escape") {
                promptState.resolve(null);
                setPromptState(null);
              }
            }}
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--border-hover)]"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => { promptState.resolve(null); setPromptState(null); }}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (promptState.value.trim()) {
                  promptState.resolve(promptState.value.trim());
                  setPromptState(null);
                }
              }}
              disabled={!promptState.value.trim()}
              className="rounded-lg bg-purple-500/20 px-4 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 disabled:opacity-40"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
