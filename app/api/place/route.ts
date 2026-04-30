import { NextRequest, NextResponse } from "next/server";
import { generateReading, tzOffsetFor } from "@/lib/synth";
import { fetchOpenMeteo } from "@/lib/openMeteo";
import type { PlaceSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

// Live weather for an arbitrary searched location at a given instant. Uses the
// real Open-Meteo forecast API when available and falls back to deterministic
// synthetic data if the request fails.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const name = sp.get("name") || "Selected location";
  const country = sp.get("country") || "";
  const admin1 = sp.get("admin1") || "";
  const atParam = sp.get("at");
  const at = atParam ? new Date(atParam) : new Date();

  if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Invalid lat/lon/at" }, { status: 400 });
  }

  const isForecast = at.getTime() > Date.now();

  // Try real weather first.
  const real = await fetchOpenMeteo(lat, lon, at);

  let tz: number;
  let reading: {
    temp_c: number;
    feels_like_c: number;
    humidity: number;
    wind_kph: number;
    pressure_hpa: number;
    precip_mm: number;
    cloud_pct: number;
    condition: PlaceSnapshot["condition"];
  };

  if (real) {
    tz = real.tz_offset;
    reading = {
      temp_c: real.temp_c,
      feels_like_c: real.feels_like_c,
      humidity: real.humidity,
      wind_kph: real.wind_kph,
      pressure_hpa: real.pressure_hpa,
      precip_mm: real.precip_mm,
      cloud_pct: real.cloud_pct,
      condition: real.condition,
    };
  } else {
    // Fallback: deterministic synthetic reading.
    const cityId =
      Math.abs(Math.round(lat * 1000) * 100003 + Math.round(lon * 1000)) %
      2_000_000;
    const synth = generateReading({
      city: { name, country, lat, lon, population: 0 },
      cityId,
      date: at,
      isForecast,
    });
    tz = tzOffsetFor(lon);
    reading = {
      temp_c: synth.temp_c,
      feels_like_c: synth.feels_like_c,
      humidity: synth.humidity,
      wind_kph: synth.wind_kph,
      pressure_hpa: synth.pressure_hpa,
      precip_mm: synth.precip_mm,
      cloud_pct: synth.cloud_pct,
      condition: synth.condition,
    };
  }

  const atUtcHourFloat = at.getUTCHours() + at.getUTCMinutes() / 60;
  const local_hour = (((atUtcHourFloat + tz) % 24) + 24) % 24;

  const place: PlaceSnapshot = {
    name,
    country,
    admin1,
    lat,
    lon,
    tz_offset: tz,
    local_hour,
    is_forecast: isForecast,
    ...reading,
  };

  return NextResponse.json({ place });
}
