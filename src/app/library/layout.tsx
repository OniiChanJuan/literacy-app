import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Library — Literacy",
  description: "Track your completed, in-progress, and want-to-read media.",
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
