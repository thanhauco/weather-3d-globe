import "dotenv/config";
import { refreshLatest } from "../lib/refresh";

// Standalone scheduler: fetches the latest Open-Meteo data into TimescaleDB on a
// fixed interval. Use this for local/dev or any always-on host. On Vercel, use
// the Cron entry in vercel.json (which hits GET /api/refresh) instead.
//
//   npm run cron                 # every 10 minutes (default)
//   REFRESH_INTERVAL_MIN=5 npm run cron

const intervalMin = clampInt(process.env.REFRESH_INTERVAL_MIN, 1, 1440, 10);
const forecastDays = clampInt(process.env.FORECAST_DAYS, 1, 16, 3);

async function runOnce() {
  const stamp = new Date().toISOString();
  try {
    const r = await refreshLatest(forecastDays);
    console.log(
      `[${stamp}] refreshed ${r.upserted} rows for ${r.realCities}/${r.cities} cities in ${r.durationMs}ms`
    );
  } catch (err) {
    console.error(`[${stamp}] refresh failed:`, (err as Error).message);
  }
}

async function main() {
  console.log(
    `Weather refresh cron started — every ${intervalMin} min (forecast ${forecastDays}d). Ctrl+C to stop.`
  );
  await runOnce(); // run immediately on start
  setInterval(runOnce, intervalMin * 60_000);
}

function clampInt(
  raw: string | undefined,
  lo: number,
  hi: number,
  dflt: number
): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

main().catch((err) => {
  console.error("Cron crashed:", err);
  process.exit(1);
});
