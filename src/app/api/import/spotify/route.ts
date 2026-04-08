import { NextRequest, NextResponse } from "next/server";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}

// GET /api/import/spotify — get user's saved albums
// Note: Client Credentials flow can only search, not access user libraries.
// For now, we use a simpler approach: user connects their Spotify account via
// the existing OAuth (if connected), or we return an error suggesting connection.
export async function GET(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`import-spotify:${claims.sub}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  // Spotify import is temporarily unavailable post-auth-migration.
  // The previous flow read OAuth refresh tokens from the NextAuth
  // accounts table; under Supabase Auth this needs to be re-implemented
  // by linking Spotify as a Supabase identity. Tracked separately.
  return NextResponse.json({
    error: "Spotify import is temporarily unavailable.",
    needsAuth: true,
    message: "We're updating our Spotify connection. Please check back soon.",
  }, { status: 503 });
}

async function fetchAllSavedAlbums(token: string): Promise<any[]> {
  const albums: any[] = [];
  let nextUrl: string | null = `${SPOTIFY_API}/me/albums?limit=50`;

  while (nextUrl && albums.length < 500) {
    const res: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to fetch saved albums");
    const data = await res.json();

    albums.push(...(data.items || []));
    nextUrl = data.next || null;
  }

  return albums;
}

async function refreshSpotifyToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}
