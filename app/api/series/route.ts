import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SeriesPoint, DailyPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

// Trend charts + forecast band for a single city, served from the pre-computed
// continuous aggregates (weather_6h, weather_daily) instead of raw rows.
export async function GET(req: NextRequest) {
  const cityId = Number(req.nextUrl.searchParams.get("cityId"));
  if (!cityId || Number.isNaN(cityId)) {
    return NextResponse.json({ error: "cityId required" }, { status: 400 });
  }

  try {
    const [series, daily] = await Promise.all([
      query<SeriesPoint>(
        `SELECT bucket, temp_c, humidity, wind_kph, precip_mm, is_forecast
           FROM weather_6h
          WHERE city_id = $1
          ORDER BY bucket ASC`,
        [cityId]
      ),
      query<DailyPoint>(
        `SELECT bucket, temp_min, temp_avg, temp_max, precip_mm, is_forecast
           FROM weather_daily
          WHERE city_id = $1
          ORDER BY bucket ASC`,
        [cityId]
      ),
    ]);

    return NextResponse.json({ cityId, series, daily });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
