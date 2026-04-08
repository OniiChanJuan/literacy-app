import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — for Client Components only.
 * Uses anon key + NEXT_PUBLIC_SUPABASE_URL.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
