import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";
import { VALID_SLUG_TYPES } from "@/lib/slugs";

// Regenerate hourly — new items added to catalog will surface within an hour
export const revalidate = 3600;

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/",              priority: 1.0, changeFrequency: "daily"   },
  { path: "/explore",       priority: 0.9, changeFrequency: "daily"   },
  { path: "/library",       priority: 0.8, changeFrequency: "daily"   },
  { path: "/people",        priority: 0.7, changeFrequency: "daily"   },
  { path: "/login",         priority: 0.4, changeFrequency: "monthly" },
  { path: "/signup",        priority: 0.4, changeFrequency: "monthly" },
  { path: "/settings",      priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacy",       priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms",         priority: 0.3, changeFrequency: "monthly" },
  { path: "/guidelines",    priority: 0.3, changeFrequency: "monthly" },
  { path: "/accessibility", priority: 0.3, changeFrequency: "monthly" },
  { path: "/cookies",       priority: 0.2, changeFrequency: "monthly" },
  { path: "/dmca",          priority: 0.2, changeFrequency: "monthly" },
  { path: "/do-not-sell",   priority: 0.2, changeFrequency: "monthly" },
  { path: "/sitemap-page",  priority: 0.2, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Item detail pages — only items that have a slug and are not upcoming stubs
  let itemEntries: MetadataRoute.Sitemap = [];
  try {
    const items = await prisma.item.findMany({
      where: {
        slug: { not: null },
        isUpcoming: false,
        parentItemId: null,
        type: { in: Array.from(VALID_SLUG_TYPES) },
      },
      select: { type: true, slug: true, updatedAt: true },
      orderBy: { voteCount: "desc" },
      take: 10000, // sitemap hard-cap — split into multiple files later if needed
    });
    itemEntries = items
      .filter((i): i is { type: string; slug: string; updatedAt: Date } => !!i.slug)
      .map((i) => ({
        url: `${SITE_URL}/${i.type}/${i.slug}`,
        lastModified: i.updatedAt || now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
  } catch {
    itemEntries = [];
  }

  // Franchise pages
  let franchiseEntries: MetadataRoute.Sitemap = [];
  try {
    const franchises = await prisma.franchise.findMany({
      select: { id: true, createdAt: true },
      take: 2000,
    });
    franchiseEntries = franchises.map((f: { id: number; createdAt: Date | null }) => ({
      url: `${SITE_URL}/franchise/${f.id}`,
      lastModified: f.createdAt || now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));
  } catch {
    franchiseEntries = [];
  }

  return [...staticEntries, ...itemEntries, ...franchiseEntries];
}
