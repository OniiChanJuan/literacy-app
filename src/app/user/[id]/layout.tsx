import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  // Profiles are personal content and can be private — keep out of search results
  robots: { index: false, follow: false },
};

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
