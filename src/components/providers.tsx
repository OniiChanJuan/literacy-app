"use client";

import { SessionProvider } from "next-auth/react";
import { RatingsProvider } from "@/lib/ratings-context";
import { LibraryProvider } from "@/lib/library-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <RatingsProvider>
        <LibraryProvider>
          {children}
        </LibraryProvider>
      </RatingsProvider>
    </SessionProvider>
  );
}
