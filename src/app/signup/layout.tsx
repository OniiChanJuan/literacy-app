import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account — Literacy",
  description: "Join Literacy to rate, review, and discover across every medium.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
