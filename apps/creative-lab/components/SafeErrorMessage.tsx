"use client";

interface SafeErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function SafeErrorMessage({ message, onRetry }: SafeErrorMessageProps) {
  return (
    <div
      style={{
        background: "#451a03",
        border: "1px solid #92400e",
        borderRadius: "12px",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "1.5rem" }}>🤔</span>
        <p style={{ color: "#fcd34d", fontWeight: 600, margin: 0 }}>{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            alignSelf: "flex-start",
            background: "#92400e",
            color: "#fef3c7",
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Try Again 🔄
        </button>
      )}
    </div>
  );
}
