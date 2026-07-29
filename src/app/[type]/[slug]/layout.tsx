import { notFound } from "next/navigation";
import { getItemBySlug } from "@/lib/item-lookup";
import { VALID_SLUG_TYPES } from "@/lib/slugs";

/**
 * Existence gate for item pages.
 *
 * This layout sits ABOVE the segment's loading.tsx suspense boundary, so
 * nothing — including the skeleton shell — is flushed until the item is
 * known to exist. That lets notFound() here produce a real HTTP 404 for
 * nonexistent slugs; thrown from the page (below the boundary) it arrives
 * after the 200 status has already been sent and only yields a noindex
 * meta tag, which Search Console reports as a soft 404.
 *
 * The lookup is request-memoized (see src/lib/item-lookup.ts), so
 * generateMetadata and the page reuse this same query result.
 */
export default async function ItemSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;
  if (!VALID_SLUG_TYPES.has(type)) notFound();
  const item = await getItemBySlug(type, slug);
  if (!item) notFound();
  return <>{children}</>;
}
