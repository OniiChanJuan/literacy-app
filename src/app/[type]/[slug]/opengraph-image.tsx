/**
 * Per-item Open Graph share card (1200×630) — what unfurls when an item
 * link is pasted into Discord, iMessage, Slack, Bluesky, etc.
 *
 * This file-convention image OVERRIDES any openGraph.images set in
 * generateMetadata — keep images out of the page's metadata so this
 * stays the single source of truth.
 *
 * Shows the external-blend CrossShelf Score only (community data lives
 * behind a client fetch and isn't needed for a share card).
 */
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { computeCrossShelfScore } from "@/lib/crossshelf-score";
import { TYPES, type MediaType } from "@/lib/data";
import { VALID_SLUG_TYPES } from "@/lib/slugs";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CrossShelf";

export default async function OgImage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;

  const dbItem = VALID_SLUG_TYPES.has(type)
    ? await prisma.item
        .findFirst({
          where: { type, slug },
          select: {
            title: true,
            year: true,
            genre: true,
            cover: true,
            ext: true,
            type: true,
            voteCount: true,
          },
        })
        .catch(() => null)
    : null;

  const t = TYPES[type as MediaType] ?? { label: "", color: "#E84855", icon: "" };
  const cover = dbItem?.cover?.startsWith("http") ? dbItem.cover : null;
  const title = dbItem?.title ?? "CrossShelf";
  const score = dbItem
    ? computeCrossShelfScore(
        {
          ext: dbItem.ext as Record<string, unknown> | null,
          type: dbItem.type,
          voteCount: dbItem.voteCount ?? 0,
        },
        null
      )
    : null;
  const subline = [dbItem?.year || null, dbItem?.genre?.[0] || null]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#0b0b10",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            width={420}
            height={630}
            style={{ objectFit: "cover" }}
            alt=""
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 56,
            flex: 1,
          }}
        >
          {dbItem ? (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                color: t.color,
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 18,
              }}
            >
              {t.label}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: title.length > 45 ? 44 : 58,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>
          {subline ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                opacity: 0.7,
                marginTop: 16,
              }}
            >
              {subline}
            </div>
          ) : null}
          {score?.score10 != null ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: 34,
                fontSize: 36,
              }}
            >
              <div
                style={{
                  display: "flex",
                  background: t.color,
                  borderRadius: 12,
                  padding: "6px 18px",
                  fontWeight: 700,
                  marginRight: 16,
                }}
              >
                {score.score10.toFixed(1)}
              </div>
              <div style={{ display: "flex", opacity: 0.75 }}>CrossShelf Score</div>
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: 26,
              opacity: 0.55,
              marginTop: "auto",
            }}
          >
            crossshelf.app — Fluent in every medium
          </div>
        </div>
      </div>
    ),
    size
  );
}
