import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your CrossShelf account, privacy, and preferences.",
  // Personal, auth-walled — keep out of search results
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
