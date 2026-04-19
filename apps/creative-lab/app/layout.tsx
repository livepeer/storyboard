import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creative Lab",
  description:
    "A kid-friendly AI creative tool — make amazing art, stories, and animations with AI!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "1rem 2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-card)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.75rem" }}>🎨</span>
              <span
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "var(--accent)",
                  letterSpacing: "-0.02em",
                }}
              >
                Creative Lab
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                paddingLeft: "2.25rem",
              }}
            >
              Make Amazing Things with AI
            </p>
          </div>
          <nav>
            <a
              href="/gallery"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 1rem",
                borderRadius: "0.75rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                textDecoration: "none",
                fontSize: "0.9rem",
                fontWeight: 600,
                transition: "background 0.2s",
              }}
            >
              <span>🖼️</span> Gallery
            </a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
