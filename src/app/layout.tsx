import type { Metadata } from "next";
import Nav from "@/components/nav";
import Providers from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Literacy — Fluent in every medium",
  description: "A cross-media review and recommendation platform for movies, TV, books, manga, comics, games, music, and podcasts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ minHeight: "100vh", background: "#0b0b10", fontFamily: "'DM Sans', sans-serif", color: "#fff", margin: 0, padding: 0 }}>
        <Providers>
          <Nav />
          <main style={{ padding: "26px 28px 80px" }}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
