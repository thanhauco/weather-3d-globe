import { query } from "./db";
import { fetchOpenMeteoHourlyBatch } from "./openMeteo";

const HOUR = 3600_000;

export interface RefreshResult {
  ok: boolean;
  at: string; // ISO timestamp of the refresh
  cities: number; // number of cities considered
  realCities: number; // cities that returned real data
  upserted: number; // rows inserted/updated
  durationMs: number;
}

/**
 * Pull the latest real weather from Open-Meteo for every tracked city and upsert
 * it into `weather_readings`, then refresh the recent continuous-aggregate
 * range. Refreshes a small window (yesterday → forecast horizon) so it is light
 * enough to run on a 10-minute schedule. Shared by `/api/refresh` and the cron.
 */
export async function refreshLatest(forecastDays = 3): Promise<RefreshResult> {
  const started = Date.now();

  const cities = await query<{
    id: number;
    name: string;
    country: string;
    lat: number;
    lon: number;
  }>(`SELECT id, name, country, lat, lon FROM cities ORDER BY id`);

  if (cities.length === 0) {
    return {
      ok: false,
      at: new Date().toISOString(),
      cities: 0,
      realCities: 0,
      upserted: 0,
      durationMs: Date.now() - started,
    };
  }

  // Small window: 1 day of recent history + the forecast horizon.
  const pastDays = 1;
  const fcDays = Math.min(16, Math.max(1, forecastDays));

  // Fetch real hourly data in coordinate batches.
  const COORD_BATCH = 50;
  const maps = [] as Awaited<ReturnType<typeof fetchOpenMeteoHourlyBatch>>;
  for (let s = 0; s < cities.length; s += COORD_BATCH) {
    const chunk = cities.slice(s, s + COORD_BATCH);
    const part = await fetchOpenMeteoHourlyBatch(
      chunk.map((c) => ({ lat: c.lat, lon: c.lon })),
      pastDays,
      fcDays
    );
    for (const m of part) maps.push(m);
  }

  const nowMs = Date.now();
  const realCities = maps.filter((m) => m.size > 0).length;

  // Build a batched upsert.
  const BATCH = 1000;
  let buffer: unknown[] = [];
  let tuples: string[] = [];
  let upserted = 0;

  const flush = async () => {
    if (tuples.length === 0) return;
    await query(
      `INSERT INTO weather_readings
        (time, city_id, temp_c, feels_like_c, humidity, wind_kph, pressure_hpa, precip_mm, cloud_pct, condition, is_forecast)
       VALUES ${tuples.join(",")}
       ON CONFLICT (city_id, time) DO UPDATE SET
         temp_c = EXCLUDED.temp_c,
         feels_like_c = EXCLUDED.feels_like_c,
         humidity = EXCLUDED.humidity,
         wind_kph = EXCLUDED.wind_kph,
         pressure_hpa = EXCLUDED.pressure_hpa,
         precip_mm = EXCLUDED.precip_mm,
         cloud_pct = EXCLUDED.cloud_pct,
         condition = EXCLUDED.condition,
         is_forecast = EXCLUDED.is_forecast`,
      buffer
    );
    upserted += tuples.length;
    buffer = [];
    tuples = [];
  };

  for (let i = 0; i < cities.length; i++) {
    const cityId = cities[i].id;
    const map = maps[i];
    if (!map || map.size === 0) continue;
    for (const [key, r] of map) {
      // key is "YYYY-MM-DDTHH" in UTC.
      const ts = new Date(key + ":00:00Z");
      if (Number.isNaN(ts.getTime())) continue;
      const isForecast = ts.getTime() > nowMs;
      const b = buffer.length;
      tuples.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`
      );
      buffer.push(
        ts.toISOString(),
        cityId,
        r.temp_c,
        r.feels_like_c,
        r.humidity,
        r.wind_kph,
        r.pressure_hpa,
        r.precip_mm,
        r.cloud_pct,
        r.condition,
        isForecast
      );
      if (tuples.length >= BATCH) await flush();
    }
  }
  await flush();

  // Refresh the recent aggregate range so trend/forecast charts stay current.
  if (upserted > 0) {
    const from = new Date(nowMs - (pastDays + 1) * 24 * HOUR).toISOString();
    const to = new Date(nowMs + (fcDays + 1) * 24 * HOUR).toISOString();
    try {
      await query(
        `CALL refresh_continuous_aggregate('weather_6h', $1, $2)`,
        [from, to]
      );
      await query(
        `CALL refresh_continuous_aggregate('weather_daily', $1, $2)`,
        [from, to]
      );
    } catch {
      /* aggregates are best-effort during a quick refresh */
    }
  }

  return {
    ok: true,
    at: new Date().toISOString(),
    cities: cities.length,
    realCities,
    upserted,
    durationMs: Date.now() - started,
  };
}
