import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Time window + dataset metadata so the time-travel slider knows its bounds.
export async function GET() {
  try {
    const rows = await query<{
      min_time: string;
      max_time: string;
      city_count: number;
      forecast_start: string | null;
    }>(
      `SELECT
         min(time)                                   AS min_time,
         max(time)                                   AS max_time,
         (SELECT count(*) FROM cities)               AS city_count,
         min(time) FILTER (WHERE is_forecast)        AS forecast_start
       FROM weather_readings`
    );
    const meta = rows[0];
    if (!meta || !meta.min_time) {
      return NextResponse.json(
        { error: "No data. Run `npm run db:setup` first." },
        { status: 503 }
      );
    }
    return NextResponse.json({
      minTime: meta.min_time,
      maxTime: meta.max_time,
      forecastStart: meta.forecast_start,
      cityCount: Number(meta.city_count),
      now: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
