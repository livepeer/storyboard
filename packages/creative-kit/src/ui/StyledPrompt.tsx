"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

interface PromptState {
  open: boolean;
  title: string;
  placeholder: string;
  defaultValue: string;
  resolve: ((value: string | null) => void) | null;
}

const INITIAL_STATE: PromptState = {
  open: false,
  title: "",
  placeholder: "",
  defaultValue: "",
  resolve: null,
};

export function useStyledPrompt() {
  const [state, setState] = useState<PromptState>(INITIAL_STATE);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (state.open) {
      // Defer so the DOM has rendered
      const t = setTimeout(() => inputRef.current?.focus(), 16);
      return () => clearTimeout(t);
    }
  }, [state.open]);

  const prompt = useCallback(
    (title: string, placeholder: string, defaultValue = ""): Promise<string | null> => {
      return new Promise((resolve) => {
        setState({ open: true, title, placeholder, defaultValue, resolve });
      });
    },
    []
  );

  const submit = useCallback(() => {
    const value = inputRef.current?.value ?? "";
    setState((s) => {
      s.resolve?.(value || null);
      return INITIAL_STATE;
    });
  }, []);

  const cancel = useCallback(() => {
    setState((s) => {
      s.resolve?.(null);
      return INITIAL_STATE;
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        cancel();
      }
    },
    [submit, cancel]
  );

  const PromptDialog = useCallback(() => {
    if (!state.open) return null;

    return (
      <div
        onClick={cancel}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#1c1c1e",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            padding: "20px 24px",
            width: 360,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: 500 }}>
            {state.title}
          </div>
          <input
            ref={inputRef}
            defaultValue={state.defaultValue}
            placeholder={state.placeholder}
            onKeyDown={handleKeyDown}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              padding: "8px 10px",
              color: "rgba(255,255,255,0.9)",
              fontSize: 13,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={cancel}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: "#3b82f6",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }, [state, cancel, submit, handleKeyDown]);

  return { prompt, PromptDialog, isOpen: state.open };
}
