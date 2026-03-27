import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — Literacy",
  description: "Sign in to your Literacy account.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
