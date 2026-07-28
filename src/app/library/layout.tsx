import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Library",
  description: "Track your completed, in-progress, and want-to-read media.",
  // Personal, auth-walled — keep out of search results
  robots: { index: false, follow: false },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
