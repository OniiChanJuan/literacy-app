import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account — CrossShelf",
  description: "Join CrossShelf to rate, review, and discover across every medium.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
