import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — Literacy",
  description: "Manage your Literacy account, privacy, and preferences.",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
