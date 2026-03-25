import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// GET /api/import/steam?steamid=xxx
// Fetches a user's Steam library via Steam Web API
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let steamId = searchParams.get("steamid") || "";

  if (!steamId) {
    return NextResponse.json({ error: "steamid required" }, { status: 400 });
  }

  // If they pasted a profile URL, extract the ID
  const urlMatch = steamId.match(/steamcommunity\.com\/(id|profiles)\/([^/]+)/);
  if (urlMatch) {
    if (urlMatch[1] === "id") {
      // Resolve vanity URL to Steam ID
      const vanityName = urlMatch[2];
      try {
        const resolveRes = await fetch(
          `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${process.env.STEAM_API_KEY || ""}&vanityurl=${encodeURIComponent(vanityName)}`
        );
        const resolveData = await resolveRes.json();
        if (resolveData.response?.success === 1) {
          steamId = resolveData.response.steamid;
        } else {
          return NextResponse.json({ error: "Steam user not found" }, { status: 404 });
        }
      } catch {
        return NextResponse.json({ error: "Failed to resolve Steam username" }, { status: 502 });
      }
    } else {
      steamId = urlMatch[2];
    }
  }

  // If it looks like a vanity name (not all digits), resolve it
  if (!/^\d+$/.test(steamId)) {
    try {
      const resolveRes = await fetch(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${process.env.STEAM_API_KEY || ""}&vanityurl=${encodeURIComponent(steamId)}`
      );
      const resolveData = await resolveRes.json();
      if (resolveData.response?.success === 1) {
        steamId = resolveData.response.steamid;
      } else {
        return NextResponse.json({ error: "Steam user not found" }, { status: 404 });
      }
    } catch {
      return NextResponse.json({ error: "Failed to resolve Steam username" }, { status: 502 });
    }
  }

  try {
    const apiKey = process.env.STEAM_API_KEY || "";
    const res = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true&format=json`
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch Steam library" }, { status: 502 });
    }

    const data = await res.json();
    const games = data.response?.games || [];

    if (games.length === 0) {
      return NextResponse.json({ error: "No games found. Make sure your Steam profile and game library are set to public." }, { status: 404 });
    }

    return NextResponse.json({
      games,
      totalGames: data.response?.game_count || games.length,
    });
  } catch {
    return NextResponse.json({ error: "Steam API error" }, { status: 502 });
  }
}
