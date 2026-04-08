import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — CrossShelf",
  description: "Sign in to your CrossShelf account.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
