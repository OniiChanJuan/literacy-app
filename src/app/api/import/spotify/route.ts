import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Try to get user's Spotify access token from their connected account
  const { prisma } = await import("@/lib/prisma");
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "spotify" },
  });

  if (account?.access_token) {
    // Use user's token to get their saved albums
    try {
      const albums = await fetchAllSavedAlbums(account.access_token);
      return NextResponse.json({ albums });
    } catch {
      // Token might be expired — try refresh
      if (account.refresh_token) {
        const newToken = await refreshSpotifyToken(account.refresh_token);
        if (newToken) {
          // Update token in DB
          await prisma.account.update({
            where: { provider_providerAccountId: { provider: "spotify", providerAccountId: account.providerAccountId } },
            data: { access_token: newToken },
          });
          const albums = await fetchAllSavedAlbums(newToken);
          return NextResponse.json({ albums });
        }
      }
    }
  }

  // No Spotify connected — can't import user-specific data without OAuth
  // Return error suggesting they use client credentials search instead
  return NextResponse.json({
    error: "Spotify account not connected. Connect Spotify in Account settings first, or use the search-based import below.",
    needsAuth: true,
  }, { status: 400 });
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
