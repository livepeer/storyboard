import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creative Stage",
  description: "Real-time AI creative performance workspace — type, drag, play.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
