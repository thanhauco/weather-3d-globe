import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { CitySnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

// All cities with their reading at-or-before a given instant. This is what the
// globe renders. Thanks to the hypertable + (city_id, time DESC) index, this
// only touches the chunk(s) around `at`.
export async function GET(req: NextRequest) {
  const atParam = req.nextUrl.searchParams.get("at");
  const at = atParam ? new Date(atParam) : new Date();
  if (Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Invalid `at` timestamp" }, { status: 400 });
  }

  try {
    const rows = await query<{
      id: number;
      name: string;
      country: string;
      lat: number;
      lon: number;
      population: number;
      tz_offset: number;
      temp_c: number;
      feels_like_c: number;
      humidity: number;
      wind_kph: number;
      pressure_hpa: number;
      precip_mm: number;
      cloud_pct: number;
      condition: CitySnapshot["condition"];
      is_forecast: boolean;
    }>(
      `SELECT DISTINCT ON (c.id)
         c.id, c.name, c.country, c.lat, c.lon, c.population, c.tz_offset,
         w.temp_c, w.feels_like_c, w.humidity, w.wind_kph, w.pressure_hpa,
         w.precip_mm, w.cloud_pct, w.condition, w.is_forecast
       FROM cities c
       JOIN weather_readings w ON w.city_id = c.id
       WHERE w.time <= $1
       ORDER BY c.id, w.time DESC`,
      [at.toISOString()]
    );

    const atUtcHourFloat = at.getUTCHours() + at.getUTCMinutes() / 60;
    const snapshots: CitySnapshot[] = rows.map((r) => ({
      ...r,
      population: Number(r.population),
      local_hour: ((((atUtcHourFloat + r.tz_offset) % 24) + 24) % 24),
    }));

    return NextResponse.json({ at: at.toISOString(), cities: snapshots });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
