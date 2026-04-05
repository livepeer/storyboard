"use client";

import { useCallback, useState } from "react";
import { sdkFetch } from "@/lib/sdk/client";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";

type Source = "url" | "upload" | "storyboard";

export function TrainingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source>("url");
  const [zipUrl, setZipUrl] = useState("");
  const [trigger, setTrigger] = useState("");
  const [steps, setSteps] = useState(1000);
  const [modelId, setModelId] = useState("flux-dev");
  const [status, setStatus] = useState<"idle" | "training" | "done" | "error">(
    "idle"
  );
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const { addCard, updateCard } = useCanvasStore();
  const addMessage = useChatStore((s) => s.addMessage);

  const handleFiles = useCallback((fileList: FileList) => {
    const valid = Array.from(fileList).filter(
      (f) => f.type.startsWith("image/") || f.name.endsWith(".zip")
    );
    setFiles((prev) => [...prev, ...valid]);
  }, []);

  const buildZipBase64 = useCallback(async (fileEntries: File[]) => {
    // Simple uncompressed ZIP builder
    const entries: { name: string; data: Uint8Array }[] = [];
    for (const f of fileEntries) {
      const buf = await f.arrayBuffer();
      entries.push({ name: f.name, data: new Uint8Array(buf) });
    }

    // Build ZIP structure
    const localHeaders: Uint8Array[] = [];
    const centralEntries: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = new TextEncoder().encode(entry.name);
      // Local file header
      const local = new Uint8Array(30 + nameBytes.length + entry.data.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); // signature
      lv.setUint16(4, 20, true); // version
      lv.setUint32(18, entry.data.length, true); // compressed
      lv.setUint32(22, entry.data.length, true); // uncompressed
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      local.set(entry.data, 30 + nameBytes.length);
      localHeaders.push(local);

      // Central directory entry
      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint32(20, entry.data.length, true);
      cv.setUint32(24, entry.data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralEntries.push(central);

      offset += local.length;
    }

    const centralSize = centralEntries.reduce((s, e) => s + e.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const total = new Uint8Array(
      offset + centralSize + 22
    );
    let pos = 0;
    for (const h of localHeaders) {
      total.set(h, pos);
      pos += h.length;
    }
    for (const c of centralEntries) {
      total.set(c, pos);
      pos += c.length;
    }
    total.set(eocd, pos);

    // Base64 encode
    let binary = "";
    for (let i = 0; i < total.length; i++) binary += String.fromCharCode(total[i]);
    return btoa(binary);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!trigger.trim()) return;
    setStatus("training");
    setProgress(0);

    try {
      // Prepare image data
      let imagesDataUrl = "";
      if (source === "url") {
        imagesDataUrl = zipUrl.trim();
      } else if (source === "upload" && files.length > 0) {
        const zipBase64 = await buildZipBase64(files);
        // Try upload endpoint, fall back to data URI
        try {
          const result = await sdkFetch<{ url: string }>("/upload", {
            data: zipBase64,
            content_type: "application/zip",
            filename: "training_images.zip",
          });
          imagesDataUrl = result.url;
        } catch {
          imagesDataUrl = `data:application/zip;base64,${zipBase64}`;
        }
      }

      if (!imagesDataUrl) {
        setStatus("error");
        addMessage("No training data provided", "system");
        return;
      }

      // Create training card
      const card = addCard({
        type: "image",
        title: `LoRA: ${trigger}`,
        refId: `lora_${Date.now().toString(36)}`,
      });

      // Submit training job
      const result = await sdkFetch<{ job_id: string }>("/train", {
        capability: "flux-lora-training",
        model_id: modelId,
        params: {
          images_data_url: imagesDataUrl,
          trigger_word: trigger,
          steps,
        },
        wait: false,
      });

      const jobId = result.job_id;
      addMessage(`Training started: ${jobId}`, "system");

      // Poll for progress
      const poll = setInterval(async () => {
        try {
          const st = await sdkFetch<{
            status: string;
            progress?: number;
            error?: string;
            result?: { diffusers_lora_file?: { url: string }; lora_url?: string; url?: string };
          }>(`/train/${jobId}`);

          const pct = st.progress || 0;
          setProgress(pct);

          if (st.status === "completed" || st.status === "COMPLETED") {
            clearInterval(poll);
            setProgress(100);
            setStatus("done");
            const loraUrl =
              st.result?.diffusers_lora_file?.url ||
              st.result?.lora_url ||
              st.result?.url;
            updateCard(card.id, { url: loraUrl });
            addMessage(`LoRA ready! Trigger: ${trigger}`, "agent");
          } else if (st.status === "failed" || st.status === "FAILED") {
            clearInterval(poll);
            setStatus("error");
            updateCard(card.id, { error: st.error || "Training failed" });
            addMessage(`Training failed: ${st.error || "unknown"}`, "system");
          }
        } catch {
          // Poll errors non-fatal
        }
      }, 5000);
    } catch (e) {
      setStatus("error");
      addMessage(
        `Training error: ${e instanceof Error ? e.message : "Unknown"}`,
        "system"
      );
    }
  }, [
    source, zipUrl, files, trigger, steps, modelId,
    addCard, updateCard, addMessage, buildZipBase64,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[440px] max-h-[80vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-lg)]">
        <h2 className="mb-1 text-base font-semibold text-[var(--text)]">
          LoRA Training
        </h2>
        <p className="mb-6 text-xs text-[var(--text-muted)]">
          Fine-tune a LoRA model on your images
        </p>

        {/* Source tabs */}
        <div className="mb-4 flex gap-1">
          {(["url", "upload", "storyboard"] as Source[]).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                source === s
                  ? "bg-white/[0.1] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-white/[0.04]"
              }`}
            >
              {s === "url" ? "ZIP URL" : s === "upload" ? "Upload Files" : "From Storyboard"}
            </button>
          ))}
        </div>

        {/* Source panels */}
        {source === "url" && (
          <input
            type="url"
            value={zipUrl}
            onChange={(e) => setZipUrl(e.target.value)}
            placeholder="https://example.com/training-images.zip"
            className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--border-hover)]"
          />
        )}
        {source === "upload" && (
          <div className="mb-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-center transition-colors hover:border-[var(--border-hover)]">
              <span className="text-lg">📁</span>
              <span className="text-xs text-[var(--text-muted)]">
                Click to browse or drag images here
              </span>
              <input
                type="file"
                multiple
                accept="image/*,.zip"
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </label>
            {files.length > 0 && (
              <p className="mt-2 text-[10px] text-[var(--text-dim)]">
                {files.length} file(s): {files.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
        )}
        {source === "storyboard" && (
          <p className="mb-4 text-xs text-[var(--text-dim)]">
            Card selection from storyboard will be available in Phase 1.
          </p>
        )}

        {/* Parameters */}
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Trigger Word
        </label>
        <input
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          placeholder="e.g., xyz_person"
          className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--border-hover)]"
        />

        <div className="mb-4 flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Steps
            </label>
            <input
              type="number"
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--border-hover)]"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Model
            </label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--border-hover)]"
            >
              <option value="flux-dev">Flux Dev</option>
              <option value="flux-1.1-pro">Flux 1.1 Pro</option>
            </select>
          </div>
        </div>

        {/* Progress */}
        {status === "training" && (
          <div className="mb-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[#8b5cf6] transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-center text-[10px] text-[var(--text-muted)]">
              Training… {progress}%
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={status === "training"}
            className="flex-1 rounded-lg bg-white py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === "training"
              ? "Training…"
              : status === "done"
                ? "Done!"
                : "Start Training"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-white/[0.04]"
          >
            {status === "done" ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
