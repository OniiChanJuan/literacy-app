import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/validation";

const API_KEY = process.env.TMDB_API_KEY || "";
const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/original";

interface Provider {
  provider_name: string;
  logo_path: string;
  provider_id: number;
}

// GET /api/watch-providers?title=...&year=...&type=movie|tv
// Or: /api/watch-providers?tmdbId=...&type=movie|tv
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`watch-providers:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const type = req.nextUrl.searchParams.get("type");
  if (type !== "movie" && type !== "tv") {
    return NextResponse.json({ error: "type must be movie or tv" }, { status: 400 });
  }

  let tmdbId = req.nextUrl.searchParams.get("tmdbId");

  // If no tmdbId provided, search by title+year
  if (!tmdbId) {
    const title = req.nextUrl.searchParams.get("title");
    const year = req.nextUrl.searchParams.get("year");
    if (!title) {
      return NextResponse.json({ error: "title or tmdbId required" }, { status: 400 });
    }

    const searchUrl = `${BASE}/search/${type}?api_key=${API_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ""}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return NextResponse.json({ providers: [] });
    const searchData = await searchRes.json();
    if (!searchData.results?.[0]) return NextResponse.json({ providers: [] });
    tmdbId = String(searchData.results[0].id);
  }

  // Fetch watch providers
  const wpUrl = `${BASE}/${type}/${tmdbId}/watch/providers?api_key=${API_KEY}`;
  const wpRes = await fetch(wpUrl);
  if (!wpRes.ok) return NextResponse.json({ providers: [] });
  const wpData = await wpRes.json();

  const us = wpData.results?.US;
  if (!us) return NextResponse.json({ providers: [] });

  // Combine flatrate (streaming), rent, and buy — deduplicate by provider_id
  const seen = new Set<number>();
  const providers: { name: string; logo: string; type: "stream" | "rent" | "buy" }[] = [];

  for (const p of (us.flatrate || []) as Provider[]) {
    if (!seen.has(p.provider_id)) {
      seen.add(p.provider_id);
      providers.push({ name: p.provider_name, logo: `${IMG}${p.logo_path}`, type: "stream" });
    }
  }
  for (const p of (us.rent || []) as Provider[]) {
    if (!seen.has(p.provider_id)) {
      seen.add(p.provider_id);
      providers.push({ name: p.provider_name, logo: `${IMG}${p.logo_path}`, type: "rent" });
    }
  }
  for (const p of (us.buy || []).slice(0, 4) as Provider[]) {
    if (!seen.has(p.provider_id)) {
      seen.add(p.provider_id);
      providers.push({ name: p.provider_name, logo: `${IMG}${p.logo_path}`, type: "buy" });
    }
  }

  return NextResponse.json({
    providers,
    link: us.link || null, // TMDB JustWatch link
  });
}
