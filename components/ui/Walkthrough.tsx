"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sb_walkthrough_done";

interface Step {
  title: string;
  desc: string;
  icon: string;
  /** If set, step auto-advances when this condition becomes true */
  detectComplete?: () => boolean;
}

const STEPS: Step[] = [
  {
    title: "1. Set your API key",
    desc: "Click the gear icon (top-right) and enter your Daydream API key. This connects you to 40+ AI models.",
    icon: "\u2699\uFE0F",
    detectComplete: () => !!localStorage.getItem("sdk_api_key"),
  },
  {
    title: "2. Create something",
    desc: "Type a prompt in the chat — try \"a sunset over mountains\" or click one of the starter chips below.",
    icon: "\u270D\uFE0F",
    detectComplete: () => {
      try {
        const raw = localStorage.getItem("storyboard_canvas");
        if (!raw) return false;
        const data = JSON.parse(raw);
        return (data?.state?.cards?.length || 0) > 0;
      } catch { return false; }
    },
  },
  {
    title: "3. Explore and iterate",
    desc: "Right-click any card for powerful options: restyle, animate, variations, face lock. Double-click images to zoom in. Press ? for all shortcuts.",
    icon: "\u{1F5B1}\uFE0F",
    detectComplete: () => !!sessionStorage.getItem("sb_ctx_hint"),
  },
];

export function Walkthrough() {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Find the first incomplete step
    let startStep = 0;
    for (let i = 0; i < STEPS.length; i++) {
      if (STEPS[i].detectComplete?.()) startStep = i + 1;
      else break;
    }
    if (startStep >= STEPS.length) {
      // All steps already completed
      localStorage.setItem(STORAGE_KEY, "1");
      return;
    }
    setStep(startStep);
    setShow(true);
  }, []);

  // Poll for step completion (check every 2s)
  useEffect(() => {
    if (!show) return;
    const iv = setInterval(() => {
      const s = STEPS[step];
      if (s?.detectComplete?.()) {
        if (step < STEPS.length - 1) {
          setStep(step + 1);
        } else {
          localStorage.setItem(STORAGE_KEY, "1");
          setShow(false);
        }
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [show, step]);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else dismiss();
  }, [step, dismiss]);

  if (!show) return null;

  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[380px] rounded-2xl border border-purple-500/30 bg-[#14141f] p-6 shadow-2xl">
        {/* Step indicator */}
        <div className="mb-4 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? "bg-green-500" : i === step ? "bg-purple-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <div className="text-2xl mb-2">{s.icon}</div>
        <h3 className="text-sm font-semibold text-white">{s.title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">{s.desc}</p>

        {/* Auto-detect hint */}
        {s.detectComplete && (
          <p className="mt-2 text-[10px] text-purple-400/60 italic">
            This step will auto-advance when completed
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={dismiss}
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={next}
            className="rounded-lg bg-purple-500/20 px-5 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 transition-colors"
          >
            {step < STEPS.length - 1 ? "Next" : "Get started"}
          </button>
        </div>
      </div>
    </div>
  );
}
