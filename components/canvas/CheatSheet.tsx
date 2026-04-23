"use client";

import { useState } from "react";

const SECTIONS = [
  {
    title: "Create",
    color: "text-purple-400",
    items: [
      { cmd: "/story <idea>", desc: "6-scene visual story" },
      { cmd: "/film <idea>", desc: "4-shot mini-film with camera" },
      { cmd: "/film/load hifi", desc: "GPT Image → Seedance pipeline" },
      { cmd: "/stream <idea>", desc: "Live stream with prompt traveling" },
      { cmd: "right-click canvas", desc: "Image, Video, Music, Logo…" },
    ],
  },
  {
    title: "Edit & Iterate",
    color: "text-cyan-400",
    items: [
      { cmd: "click card text", desc: "Edit title, scenes, style in place" },
      { cmd: "✕ on scene", desc: "Remove unwanted scenes" },
      { cmd: '"add more scenes…"', desc: "Continue active story/film" },
      { cmd: "apply / yes", desc: "Generate images on canvas" },
      { cmd: "/context edit", desc: "Change style DNA" },
    ],
  },
  {
    title: "Canvas Actions",
    color: "text-amber-400",
    items: [
      { cmd: "right-click card", desc: "Animate, Restyle, 3D, TTS…" },
      { cmd: "/organize narrative", desc: "Layout by prompt batch" },
      { cmd: "/save", desc: "Save cards to file" },
      { cmd: "/analyze <card>", desc: "Extract style from media" },
    ],
  },
  {
    title: "Quick Styles",
    color: "text-emerald-400",
    items: [
      { cmd: "/lego <desc>", desc: "LEGO minifig style" },
      { cmd: "/logo <desc>", desc: "Logo design" },
      { cmd: "/iso <desc>", desc: "Isometric illustration" },
      { cmd: "/3d <desc>", desc: "3D model from text" },
      { cmd: "/music <desc>", desc: "Background music" },
      { cmd: "/talk <text>", desc: "Talking video + voice" },
    ],
  },
  {
    title: "Live Streaming",
    color: "text-red-400",
    items: [
      { cmd: "recipe: classic", desc: "Default (LongLive)" },
      { cmd: "recipe: ltx-responsive", desc: "24fps, fast morphing" },
      { cmd: "recipe: depth-lock", desc: "Preserve structure" },
      { cmd: "recipe: krea-hq", desc: "Highest quality (14B)" },
      { cmd: "drag image → Live", desc: "Set stream source" },
    ],
  },
  {
    title: "Tips",
    color: "text-gray-400",
    items: [
      { cmd: "click card name", desc: "Copy refId to clipboard" },
      { cmd: '"using kling"', desc: "Force specific model" },
      { cmd: '"4K premium"', desc: "Auto-select Kling O3 4K" },
      { cmd: "/help", desc: "Full command list" },
      { cmd: "/capabilities", desc: "Show available models" },
    ],
  },
];

export function CheatSheet() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        title="Quick Reference"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent text-sm text-[var(--text-muted)] transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[2000]"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute right-4 top-14 w-[420px] max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[rgba(14,14,18,0.98)] p-4 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text)]">Quick Reference</span>
              <button
                onClick={() => setOpen(false)}
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-dim)] hover:bg-white/[0.08] hover:text-[var(--text)]"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SECTIONS.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className={`text-[9px] font-bold uppercase tracking-wider ${section.color}`}>
                    {section.title}
                  </div>
                  {section.items.map((item) => (
                    <div key={item.cmd} className="flex items-start gap-1.5 text-[10px]">
                      <code className="shrink-0 rounded bg-white/[0.05] px-1 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                        {item.cmd}
                      </code>
                      <span className="text-[var(--text-dim)]">{item.desc}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-white/[0.05] pt-2 text-center text-[9px] text-[var(--text-dim)]">
              Type <code className="rounded bg-white/[0.05] px-1">/help</code> for the full list · Right-click canvas or cards for more actions
            </div>
          </div>
        </div>
      )}
    </>
  );
}
