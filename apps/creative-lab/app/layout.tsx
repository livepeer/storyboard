import type { Metadata } from "next";
import "./globals.css";
import { Header } from "../components/Header";

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
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
