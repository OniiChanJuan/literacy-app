/**
 * /explore/[segment] — server-rendered, crawlable browse pages.
 *   /explore/movies   /explore/tv   /explore/books   /explore/manga
 *   /explore/comics   /explore/games /explore/music  /explore/podcasts
 *
 * These exist so crawlers can reach the catalog: the interactive /explore
 * page is fully client-fetched and ships an empty grid in its HTML. Every
 * card here is a real <a href> with the title as anchor text, and
 * pagination is real links — both must survive with JavaScript disabled.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { TYPES, type MediaType } from "@/lib/data";
import {
  EXPLORE_SEGMENT_BY_TYPE,
  TYPE_BY_EXPLORE_SEGMENT,
} from "@/lib/explore-segments";

const PAGE_SIZE = 60;

type Props = {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ page?: string }>;
};

function itemWhere(type: string) {
  return {
    type,
    slug: { not: null },
    isUpcoming: false,
    parentItemId: null,
  };
}

function pagePath(segment: string, page: number): string {
  return page > 1 ? `/explore/${segment}?page=${page}` : `/explore/${segment}`;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { type: segment } = await params;
  const { page } = await searchParams;
  const type = TYPE_BY_EXPLORE_SEGMENT[segment];
  // Real 404 status — thrown here, before the response starts streaming
  if (!type) notFound();

  const label = TYPES[type as MediaType].label;
  const p = Math.max(1, Number(page ?? 1) || 1);
  const title = p > 1 ? `${label} — Page ${p}` : `Browse ${label}`;
  const description = `Browse ${label.toLowerCase()} on CrossShelf — community ratings, reviews, and recommendations that connect each title to every other medium.`;
  const canonical = pagePath(segment, p);

  return {
    title,
    description,
    // Self-referencing canonical per page. Page 2+ must NOT canonicalize
    // to page 1 — that would tell Google the deeper pages are duplicates.
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
  };
}

export default async function ExploreTypePage({ params, searchParams }: Props) {
  const { type: segment } = await params;
  const { page } = await searchParams;
  const type = TYPE_BY_EXPLORE_SEGMENT[segment];
  if (!type) notFound();

  const p = Math.max(1, Number(page ?? 1) || 1);
  const t = TYPES[type as MediaType];

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where: itemWhere(type),
      select: { id: true, title: true, slug: true, year: true, cover: true },
      orderBy: [{ popularityScore: "desc" }, { voteCount: "desc" }, { id: "asc" }],
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.item.count({ where: itemWhere(type) }),
  ]);
  if (!items.length) notFound();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="content-width" style={{ padding: "32px 28px 64px" }}>
      {/* Cross-links between the eight browse pages */}
      <nav
        aria-label="Browse by media type"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}
      >
        {(Object.keys(EXPLORE_SEGMENT_BY_TYPE) as MediaType[]).map((mt) => {
          const seg = EXPLORE_SEGMENT_BY_TYPE[mt];
          const active = mt === type;
          return (
            <Link
              key={mt}
              href={`/explore/${seg}`}
              prefetch={false}
              style={{
                fontSize: 13,
                padding: "6px 14px",
                borderRadius: 20,
                textDecoration: "none",
                color: active ? "#fff" : "rgba(255,255,255,0.55)",
                background: active ? TYPES[mt].color : "rgba(255,255,255,0.06)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {TYPES[mt].label}
            </Link>
          );
        })}
      </nav>

      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Browse {t.label}
      </h1>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
        {total.toLocaleString("en-US")} {t.label.toLowerCase()} on CrossShelf,
        sorted by popularity — every title links to community ratings, reviews,
        and cross-media recommendations.
      </p>
      <p style={{ fontSize: 13, marginBottom: 28 }}>
        <Link
          href={`/explore?type=${type}`}
          style={{ color: t.color, textDecoration: "none" }}
        >
          Filter by genre, vibe, and more in interactive Explore →
        </Link>
      </p>

      {/* Server-rendered grid. These anchors must exist with JS disabled. */}
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 18,
        }}
      >
        {items.map((i) => {
          const hasImage = !!i.cover && i.cover.startsWith("http");
          return (
            <li key={i.id}>
              <Link
                href={`/${type}/${i.slug}`}
                prefetch={false}
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div
                  style={{
                    aspectRatio: "2 / 3",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: hasImage
                      ? "#141419"
                      : `linear-gradient(160deg, ${t.color}33, #141419)`,
                    marginBottom: 8,
                  }}
                >
                  {hasImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={i.cover}
                      alt=""
                      width={200}
                      height={300}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 30,
                        opacity: 0.5,
                      }}
                    >
                      {t.icon}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, display: "block", lineHeight: 1.35 }}>
                  {i.title}
                </span>
                {i.year ? (
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{i.year}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <nav
        aria-label="Pagination"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          marginTop: 40,
          fontSize: 14,
        }}
      >
        {p > 1 ? (
          <Link
            href={pagePath(segment, p - 1)}
            rel="prev"
            prefetch={false}
            style={{ color: t.color, textDecoration: "none" }}
          >
            ← Previous
          </Link>
        ) : null}
        <span style={{ color: "rgba(255,255,255,0.5)" }}>
          Page {p} of {totalPages.toLocaleString("en-US")}
        </span>
        {p < totalPages ? (
          <Link
            href={pagePath(segment, p + 1)}
            rel="next"
            prefetch={false}
            style={{ color: t.color, textDecoration: "none" }}
          >
            Next →
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
