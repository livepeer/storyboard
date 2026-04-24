"use client";

import { useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { CheatSheet } from "./CheatSheet";
import {
  exportToJson, buildStoryboardHtml, buildVideoManifest, listSocialPlatforms,
  type ExportableScene, type SocialPlatform,
} from "@livepeer/creative-kit";

function ExportPanel({ onClose }: { onClose: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");

  async function getScenes(): Promise<ExportableScene[]> {
    try {
      const { useCanvasStore: store } = await import("@/lib/canvas/store");
      const cards = store.getState().cards;

      // Try project scenes first
      const { useProjectStore } = await import("@/lib/projects/store");
      const proj = useProjectStore.getState().getActiveProject();
      if (proj && proj.scenes.length > 0) {
        return proj.scenes.map((s, i) => {
          // Match by cardRefId OR artifactRefId (both old and new naming)
          const refId = s.cardRefId || (s as any).artifactRefId;
          const card = refId
            ? cards.find((c) => c.refId === refId || c.refId.endsWith(refId))
            : null;
          return {
            index: i,
            title: s.title || `Scene ${i + 1}`,
            description: s.description || s.prompt,
            imageUrl: card?.type === "image" ? card.url : undefined,
            videoUrl: card?.type === "video" ? card.url : undefined,
          };
        });
      }

      // Fallback: all canvas cards with media (no project needed)
      return cards
        .filter((c) => c.url && (c.type === "image" || c.type === "video"))
        .map((c, i) => ({
          index: i,
          title: c.title || c.refId,
          description: c.prompt || c.title || "",
          imageUrl: c.type === "image" ? c.url : undefined,
          videoUrl: c.type === "video" ? c.url : undefined,
        }));
    } catch { return []; }
  }

  async function getTitle(): Promise<string> {
    try {
      const { useProjectStore } = await import("@/lib/projects/store");
      return useProjectStore.getState().getActiveProject()?.brief?.slice(0, 50) || "Storyboard";
    } catch { return "Storyboard"; }
  }

  async function handleJson() {
    setExporting(true);
    setStatus("Building JSON…");
    try {
      const scenes = await getScenes();
      const title = await getTitle();
      const result = exportToJson({ format: "json", scenes, title });
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.fileName;
      a.click();
      setStatus(`Downloaded ${result.fileName}`);
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExporting(false);
    }
  }

  async function handlePdf() {
    setExporting(true);
    setStatus("Building PDF…");
    try {
      const scenes = await getScenes();
      const title = await getTitle();
      const html = buildStoryboardHtml({ format: "pdf", scenes, title });
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.print();
      }
      setStatus("PDF dialog opened");
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleSocial(platform: SocialPlatform) {
    setExporting(true);
    setStatus(`Building ${platform} manifest…`);
    try {
      const scenes = await getScenes();
      const title = await getTitle();
      const manifest = buildVideoManifest({ format: "social", scenes, title, platform });
      const data = { platform, title, manifest };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${platform}-${title.toLowerCase().replace(/\s+/g, "-")}.json`;
      a.click();
      setStatus(`${platform} manifest downloaded`);
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExporting(false);
    }
  }

  const platforms = listSocialPlatforms();

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 380, background: "rgba(16,16,22,0.97)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "24px 24px 20px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>Export Project</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            disabled={exporting}
            onClick={handleJson}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.08)", color: "#818cf8", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left" }}
          >
            📦 JSON — raw scene data
          </button>
          <button
            disabled={exporting}
            onClick={handlePdf}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left" }}
          >
            🖨 PDF Storyboard — print-ready deck
          </button>
          <div style={{ fontSize: 10, color: "#555", marginTop: 4, marginBottom: 2 }}>SOCIAL EXPORT</div>
          {platforms.map((p) => (
            <button
              key={p.id}
              disabled={exporting}
              onClick={() => handleSocial(p.id)}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "rgba(255,255,255,0.55)", cursor: "pointer", fontSize: 11, textAlign: "left" }}
            >
              📲 {p.label}
            </button>
          ))}
        </div>

        {status && (
          <div style={{ marginTop: 14, fontSize: 11, color: exporting ? "#818cf8" : "#4ade80", background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "6px 10px" }}>
            {exporting ? "⋯ " : "✓ "}{status}
          </div>
        )}
      </div>
    </div>
  );
}

export function TopBar({ onTrainClick }: { onTrainClick?: () => void }) {
  const { viewport, zoomTo, fitAll } = useCanvasStore();
  const [showExport, setShowExport] = useState(false);

  const zoomIn = () =>
    zoomTo(viewport.scale * 1.2, window.innerWidth / 2, window.innerHeight / 2);
  const zoomOut = () =>
    zoomTo(viewport.scale / 1.2, window.innerWidth / 2, window.innerHeight / 2);
  const fit = () => fitAll(window.innerWidth, window.innerHeight);

  return (
    <>
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
        <button
          onClick={() => setShowExport(true)}
          className="flex h-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent px-2 text-[11px] text-[var(--text-muted)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          Export
        </button>
        <a
          href="/docs"
          target="_blank"
          title="API Documentation"
          className="flex h-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent px-2 text-[11px] text-[var(--text-muted)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          API
        </a>
        <CheatSheet />
        <SettingsPanel />
      </div>
    </div>
    {showExport && <ExportPanel onClose={() => setShowExport(false)} />}
    </>
  );
}
