import "dotenv/config";
import { Client } from "pg";
import { CITIES } from "../lib/cities";
import { generateReading, tzOffsetFor } from "../lib/synth";
import { fetchOpenMeteoHourlyBatch, type HourlyMap } from "../lib/openMeteo";

const HOUR = 3600_000;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  }
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);

  const seedCount = clampInt(process.env.SEED_CITIES, 1, CITIES.length, CITIES.length);
  const historyDays = clampInt(process.env.HISTORY_DAYS, 1, 60, 10);
  const forecastDays = clampInt(process.env.FORECAST_DAYS, 1, 14, 3);

  const cities = CITIES.slice(0, seedCount);

  const client = new Client({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Connected. Seeding ${cities.length} cities, ${historyDays}d history + ${forecastDays}d forecast.`);

  // Reset existing data so re-runs are idempotent.
  await client.query("TRUNCATE weather_readings");
  await client.query("DELETE FROM cities");

  // Insert cities.
  const cityValues: string[] = [];
  const cityParams: unknown[] = [];
  cities.forEach((c, i) => {
    const id = i + 1;
    const base = i * 7;
    cityValues.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`
    );
    cityParams.push(id, c.name, c.country, c.lat, c.lon, c.population * 1000, tzOffsetFor(c.lon));
  });
  await client.query(
    `INSERT INTO cities (id, name, country, lat, lon, population, tz_offset) VALUES ${cityValues.join(",")}`,
    cityParams
  );
  console.log("  • cities inserted");

  // Time window: align "now" to the top of the hour.
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const startMs = now.getTime() - historyDays * 24 * HOUR;
  const endMs = now.getTime() + forecastDays * 24 * HOUR;
  const totalHours = Math.round((endMs - startMs) / HOUR);

  // Fetch real hourly weather from Open-Meteo (batched) unless disabled. Each
  // city gets a UTC-keyed map of readings; missing hours fall back to synth.
  const useReal = process.env.SYNTH_ONLY !== "1";
  const realByCity: HourlyMap[] = cities.map(() => new Map());
  if (useReal) {
    console.log("  • fetching real weather from Open-Meteo...");
    const COORD_BATCH = 50;
    let done = 0;
    for (let s = 0; s < cities.length; s += COORD_BATCH) {
      const chunk = cities.slice(s, s + COORD_BATCH);
      const maps = await fetchOpenMeteoHourlyBatch(
        chunk.map((c) => ({ lat: c.lat, lon: c.lon })),
        historyDays,
        forecastDays
      );
      for (let k = 0; k < maps.length; k++) realByCity[s + k] = maps[k];
      done += chunk.length;
      process.stdout.write(`\r    fetched ${done}/${cities.length} cities`);
    }
    const hit = realByCity.filter((m) => m.size > 0).length;
    console.log(`\n    real data for ${hit}/${cities.length} cities (rest synthetic)`);
  } else {
    console.log("  • SYNTH_ONLY=1 → using synthetic data only");
  }

  // Stream readings in batches.
  const BATCH = 2000;
  let buffer: unknown[] = [];
  let rowTuples: string[] = [];
  let inserted = 0;

  const flush = async () => {
    if (rowTuples.length === 0) return;
    await client.query(
      `INSERT INTO weather_readings
        (time, city_id, temp_c, feels_like_c, humidity, wind_kph, pressure_hpa, precip_mm, cloud_pct, condition, is_forecast)
       VALUES ${rowTuples.join(",")}`,
      buffer
    );
    inserted += rowTuples.length;
    buffer = [];
    rowTuples = [];
    process.stdout.write(`\r  • readings inserted: ${inserted}`);
  };

  for (let h = 0; h <= totalHours; h++) {
    const ts = new Date(startMs + h * HOUR);
    const isForecast = ts.getTime() > now.getTime();
    const hourKey = ts.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    for (let i = 0; i < cities.length; i++) {
      const cityId = i + 1;
      const real = realByCity[i].get(hourKey);
      const r =
        real ?? generateReading({ city: cities[i], cityId, date: ts, isForecast });
      const b = buffer.length;
      rowTuples.push(
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
      if (rowTuples.length >= BATCH) await flush();
    }
  }
  await flush();
  console.log("");

  // Materialize continuous aggregates over the inserted range.
  console.log("  • refreshing continuous aggregates...");
  await client.query(`CALL refresh_continuous_aggregate('weather_6h', NULL, NULL)`);
  await client.query(`CALL refresh_continuous_aggregate('weather_daily', NULL, NULL)`);

  await client.end();
  console.log(`Done. Inserted ${inserted} readings across ${cities.length} cities.`);
}

function clampInt(raw: string | undefined, lo: number, hi: number, dflt: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

main().catch((err) => {
  console.error("\nIngestion failed:", err.message);
  process.exit(1);
});
