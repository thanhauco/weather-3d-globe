import { NextRequest, NextResponse } from "next/server";
import type { GeocodeResult } from "@/lib/types";

export const dynamic = "force-dynamic";

// Resolve the caller's approximate location from their IP address. In local
// dev the server's public IP is the developer's machine, so this returns the
// user's city. Falls back gracefully if the lookup fails.
export async function GET(req: NextRequest) {
  // Prefer the forwarded client IP when present (behind a proxy / in prod).
  const fwd = req.headers.get("x-forwarded-for") || "";
  const clientIp = fwd.split(",")[0].trim();
  const isPublic =
    clientIp &&
    !clientIp.startsWith("10.") &&
    !clientIp.startsWith("192.168.") &&
    !clientIp.startsWith("127.") &&
    !clientIp.startsWith("::1") &&
    !/^172\.(1[6-9]|2\d|3[01])\./.test(clientIp);

  const url = isPublic
    ? `https://ipapi.co/${clientIp}/json/`
    : "https://ipapi.co/json/";

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "weather-3d-globe/1.0" },
      next: { revalidate: 600 },
    });
    if (!r.ok) throw new Error(`ipapi ${r.status}`);
    const j = await r.json();

    const lat = Number(j.latitude);
    const lon = Number(j.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      throw new Error("No coordinates from IP lookup");
    }

    const place: GeocodeResult = {
      id: -1,
      name: j.city || j.region || j.country_name || "Your location",
      country: j.country_code || j.country || "",
      admin1: j.region || "",
      lat,
      lon,
    };
    return NextResponse.json({ place });
  } catch {
    // Don't error the page if geolocation is unavailable.
    return NextResponse.json({ place: null });
  }
}
