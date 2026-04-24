"use client";

import React, { useState } from "react";

export interface ConfirmationRequest {
  /** What the system is about to do */
  action: string;
  /** Details to help the user decide */
  details: string[];
  /** Cost estimate (if applicable) */
  cost?: string;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Callback when user wants to edit before proceeding */
  onEdit?: () => void;
}

/**
 * Inline confirmation card — renders in the chat stream before
 * expensive/destructive operations. User must click Proceed or Cancel.
 *
 * Inspired by Claude Code's permission model: always ask before
 * committing significant resources.
 */
export function ConfirmationCard({ request }: { request: ConfirmationRequest }) {
  const [decided, setDecided] = useState<"pending" | "confirmed" | "cancelled">("pending");

  if (decided === "confirmed") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
        borderRadius: 8, background: "rgba(34,197,94,0.08)",
        border: "1px solid rgba(34,197,94,0.2)", fontSize: 11, color: "rgba(34,197,94,0.8)",
      }}>
        <span>✓</span> Confirmed — {request.action}
      </div>
    );
  }

  if (decided === "cancelled") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
        borderRadius: 8, background: "rgba(248,113,113,0.08)",
        border: "1px solid rgba(248,113,113,0.2)", fontSize: 11, color: "rgba(248,113,113,0.8)",
      }}>
        <span>✕</span> Cancelled
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: "95%", alignSelf: "flex-start",
      borderRadius: 12, border: "1px solid rgba(99,102,241,0.25)",
      background: "rgba(99,102,241,0.06)", padding: 12, fontSize: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>⚡</span>
        <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{request.action}</span>
      </div>

      {/* Details */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
        {request.details.map((d, i) => (
          <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", gap: 6 }}>
            <span style={{ color: "rgba(99,102,241,0.6)" }}>•</span> {d}
          </div>
        ))}
        {request.cost && (
          <div style={{ fontSize: 11, color: "rgba(250,204,21,0.7)", marginTop: 2 }}>
            💰 Estimated cost: {request.cost}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => { setDecided("confirmed"); request.onConfirm(); }}
          style={{
            padding: "5px 16px", borderRadius: 6, border: "none",
            background: "rgba(99,102,241,0.2)", color: "#818cf8",
            cursor: "pointer", fontSize: 11, fontWeight: 600,
          }}
        >
          Proceed
        </button>
        {request.onEdit && (
          <button
            onClick={request.onEdit}
            style={{
              padding: "5px 12px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
              color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 11,
            }}
          >
            Edit
          </button>
        )}
        <button
          onClick={() => { setDecided("cancelled"); request.onCancel(); }}
          style={{
            padding: "5px 12px", borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
            color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
