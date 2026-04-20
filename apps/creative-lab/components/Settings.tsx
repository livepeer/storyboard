"use client";

import { useState, useEffect, useCallback } from "react";

const SDK_URL_KEY = "sdk_service_url";
const API_KEY_KEY = "sdk_api_key";
const DEFAULT_URL = "https://sdk.daydream.monster";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [sdkUrl, setSdkUrl] = useState(DEFAULT_URL);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSdkUrl(localStorage.getItem(SDK_URL_KEY) || DEFAULT_URL);
    setApiKey(localStorage.getItem(API_KEY_KEY) || "");
  }, [open]);

  const handleSave = useCallback(() => {
    localStorage.setItem(SDK_URL_KEY, sdkUrl);
    localStorage.setItem(API_KEY_KEY, apiKey);
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 800);
  }, [sdkUrl, apiKey]);

  // Check if API key is configured
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => {
    setHasKey(!!localStorage.getItem(API_KEY_KEY));
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.5rem 1rem",
          borderRadius: "0.75rem",
          background: hasKey ? "rgba(255,255,255,0.06)" : "rgba(233,69,96,0.2)",
          border: hasKey ? "1px solid var(--border)" : "1px solid rgba(233,69,96,0.4)",
          color: hasKey ? "var(--text)" : "#e94560",
          cursor: "pointer",
          fontSize: "0.9rem",
          fontWeight: 600,
        }}
        title={hasKey ? "Settings" : "API key needed — click to configure"}
      >
        ⚙️ {hasKey ? "" : "Setup"}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
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
              background: "#1c1c2e",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: "24px 28px",
              width: 400,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
              ⚙️ Settings
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
              Enter your Daydream API key to enable AI generation.
              Ask a grown-up if you need help! 🔑
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                SDK URL
              </label>
              <input
                value={sdkUrl}
                onChange={(e) => setSdkUrl(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "var(--text)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_..."
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: apiKey ? "1px solid rgba(78,204,163,0.4)" : "1px solid rgba(233,69,96,0.4)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "var(--text)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: saved ? "var(--success)" : "var(--accent)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {saved ? "Saved! ✓" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
