import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — CrossShelf",
  description: "Manage your CrossShelf account, privacy, and preferences.",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
