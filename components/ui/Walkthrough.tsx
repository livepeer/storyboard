"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "sb_walkthrough_done";

const STEPS = [
  {
    title: "1. Set your API key",
    desc: "Click the gear icon (top-right) and enter your Daydream API key to connect to AI models.",
    icon: "\u2699\uFE0F",
  },
  {
    title: "2. Describe what you want",
    desc: "Type a prompt in the chat panel. Try: \"a sunset over mountains\" or \"/film a cat adventure\" for a full mini-film.",
    icon: "\u270D\uFE0F",
  },
  {
    title: "3. Explore and iterate",
    desc: "Right-click any card for options: restyle, animate, variations, face lock. Double-click images to view fullscreen. Cmd+Z to undo.",
    icon: "\u{1F5B1}\uFE0F",
  },
];

export function Walkthrough() {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Check if API key is already set — if so, skip step 1
    const hasKey = !!localStorage.getItem("sdk_api_key");
    setStep(hasKey ? 1 : 0);
    setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else dismiss();
  };

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
                i <= step ? "bg-purple-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <div className="text-2xl mb-2">{s.icon}</div>
        <h3 className="text-sm font-semibold text-white">{s.title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">{s.desc}</p>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={dismiss}
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip walkthrough
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
