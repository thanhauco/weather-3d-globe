import { NextRequest, NextResponse } from "next/server";
import type { GeocodeResult } from "@/lib/types";

export const dynamic = "force-dynamic";

// Geocode a free-text place query via Open-Meteo's free geocoding API
// (no API key, CORS-friendly). Returns a short list of matching places.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({
        name: q,
        count: "6",
        language: "en",
        format: "json",
      }).toString();

    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      // Cache identical queries briefly to be a good API citizen.
      next: { revalidate: 3600 },
    });
    const j = await r.json();

    const results: GeocodeResult[] = (j.results || []).map((p: Record<string, unknown>) => ({
      id: Number(p.id),
      name: String(p.name ?? ""),
      country: String(p.country ?? p.country_code ?? ""),
      admin1: String(p.admin1 ?? ""),
      lat: Number(p.latitude),
      lon: Number(p.longitude),
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, results: [] },
      { status: 200 }
    );
  }
}
