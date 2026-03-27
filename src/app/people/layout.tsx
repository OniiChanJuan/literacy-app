import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "People — Literacy",
  description: "Find and follow people with similar taste across all media.",
};

export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
