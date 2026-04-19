"use client";

import { useState } from "react";
import type { MissionStep } from "../lib/missions/types";

interface StepGuideProps {
  step: MissionStep;
  stepNumber: number;
  totalSteps: number;
  onSubmit: (input: string) => void;
  isLoading?: boolean;
}

export function StepGuide({ step, stepNumber, totalSteps, onSubmit, isLoading = false }: StepGuideProps) {
  const [inputValue, setInputValue] = useState("");
  const [showHint, setShowHint] = useState(false);

  function handleTextSubmit() {
    if (inputValue.trim()) {
      onSubmit(inputValue.trim());
      setInputValue("");
    }
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "0 16px" }}>
      {/* Progress dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "28px" }}>
        {Array.from({ length: totalSteps }).map((_, i) => {
          const isDone = i < stepNumber - 1;
          const isCurrent = i === stepNumber - 1;
          return (
            <div
              key={i}
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: isDone ? "#4ecca3" : isCurrent ? "#e94560" : "var(--text-dim)",
                transition: "background 0.2s",
              }}
            />
          );
        })}
      </div>

      {/* Instruction */}
      <p
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          color: "var(--text)",
          textAlign: "center",
          marginBottom: "24px",
          lineHeight: 1.4,
        }}
      >
        {step.instruction}
      </p>

      {/* Hint */}
      {step.hint && (
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <button
            onClick={() => setShowHint((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Need a hint? 💡
          </button>
          {showHint && (
            <div
              style={{
                background: "#451a03",
                border: "1px solid #92400e",
                borderRadius: "10px",
                padding: "12px 16px",
                marginTop: "10px",
                color: "#fcd34d",
                fontSize: "0.9rem",
                lineHeight: 1.5,
              }}
            >
              {step.hint}
            </div>
          )}
        </div>
      )}

      {/* Step-type controls */}
      {(step.type === "text_input" || step.type === "transform") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your answer here…"
            rows={3}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "12px",
              color: "var(--text)",
              fontSize: "1rem",
              resize: "vertical",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) handleTextSubmit();
            }}
          />
          <button
            onClick={handleTextSubmit}
            disabled={isLoading || !inputValue.trim()}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "12px 28px",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: isLoading || !inputValue.trim() ? "not-allowed" : "pointer",
              opacity: isLoading || !inputValue.trim() ? 0.6 : 1,
              transition: "opacity 0.15s",
              alignSelf: "center",
            }}
          >
            {isLoading ? "Creating… ✨" : "Go! ✨"}
          </button>
        </div>
      )}

      {step.type === "generate" && (
        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => onSubmit("")}
            disabled={isLoading}
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "14px",
              padding: "16px 40px",
              fontSize: "1.2rem",
              fontWeight: 700,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.7 : 1,
              transition: "opacity 0.15s, transform 0.15s",
              boxShadow: "0 4px 20px rgba(102,126,234,0.4)",
            }}
          >
            {isLoading ? "Creating… ✨" : "Make it! 🎨"}
          </button>
        </div>
      )}

      {step.type === "review" && (
        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => onSubmit("")}
            disabled={isLoading}
            style={{
              background: "#166534",
              color: "#86efac",
              border: "none",
              borderRadius: "10px",
              padding: "12px 32px",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Looks great! Next →
          </button>
        </div>
      )}

      {/* celebrate type: nothing rendered here — parent handles it */}
    </div>
  );
}
