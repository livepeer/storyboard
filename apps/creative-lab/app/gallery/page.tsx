"use client";

import ProgressDashboard from "../../components/ProgressDashboard";
import PortfolioGallery from "../../components/PortfolioGallery";

export default function GalleryPage() {
  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "2rem 1.5rem",
      }}
    >
      <a href="/" style={{
        color: "var(--text-muted)", textDecoration: "none", fontSize: 14,
        fontWeight: 700, display: "inline-block", marginBottom: 16,
      }}>← Back to Missions</a>
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 800,
          marginBottom: "1.5rem",
          letterSpacing: "-0.02em",
        }}
      >
        My Creations 🖼️
      </h1>
      <ProgressDashboard />
      <PortfolioGallery />
    </div>
  );
}
