"use client";

import { useState, useCallback } from "react";

interface Props {
  onSubmit: (intent: string) => void;
  disabled?: boolean;
}

const PLACEHOLDERS = [
  "Tell the stream what to do \u2014 e.g. 'add neon rain'",
  "Try 'make it darker' or 'use depth preprocessor'",
  "Type intent \u2014 agent figures out the rest",
];

export function IntentInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);

  const handleSubmit = useCallback(() => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue("");
  }, [value, onSubmit]);

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      rows={3}
      className="w-full resize-none rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-pink-500/50"
      style={{ minHeight: 60, lineHeight: 1.5 }}
    />
  );
}
