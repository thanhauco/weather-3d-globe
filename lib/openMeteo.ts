import type { Condition } from "./types";

// Map a WMO weather interpretation code to our simplified condition set.
// https://open-meteo.com/en/docs (weather_code)
export function wmoToCondition(code: number): Condition {
  if (code === 0) return "clear";
  if (code >= 1 && code <= 3) return "clouds"; // mainly clear / partly / overcast
  if (code === 45 || code === 48) return "clouds"; // fog
  if (code >= 51 && code <= 67) return "rain"; // drizzle + rain (incl. freezing)
  if (code >= 71 && code <= 77) return "snow"; // snow fall / grains
  if (code >= 80 && code <= 82) return "rain"; // rain showers
  if (code === 85 || code === 86) return "snow"; // snow showers
  if (code >= 95) return "storm"; // thunderstorm (95, 96, 99)
  return "clouds";
}

export interface OpenMeteoWeather {
  temp_c: number;
  feels_like_c: number;
  humidity: number;
  wind_kph: number;
  pressure_hpa: number;
  precip_mm: number;
  cloud_pct: number;
  condition: Condition;
  /** Real timezone offset (hours) returned by the API. */
  tz_offset: number;
}

const HOURLY_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "surface_pressure",
  "wind_speed_10m",
].join(",");

const CURRENT_VARS = HOURLY_VARS;

/**
 * Fetch real current/forecast weather for a coordinate at a given instant from
 * the free Open-Meteo API (no key required). Returns null on any failure so the
 * caller can fall back to synthetic data.
 *
 * `at` may be in the past (up to ~7 days) or future (up to ~16 days); the
 * nearest hourly sample is used. When `at` is essentially "now", the API's
 * current block is preferred.
 */
export async function fetchOpenMeteo(
  lat: number,
  lon: number,
  at: Date
): Promise<OpenMeteoWeather | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: "auto",
    past_days: "7",
    forecast_days: "16",
    current: CURRENT_VARS,
    hourly: HOURLY_VARS,
    wind_speed_unit: "kmh",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  try {
    const r = await fetch(url, { next: { revalidate: 600 } });
    if (!r.ok) return null;
    const j: any = await r.json();

    const offsetSec: number = Number(j.utc_offset_seconds) || 0;
    const tz_offset = offsetSec / 3600;

    // Decide whether to use the "current" block or a specific hourly sample.
    const nowMs = Date.now();
    const useCurrent = Math.abs(at.getTime() - nowMs) < 30 * 60 * 1000;

    if (useCurrent && j.current) {
      return mapBlock(j.current, tz_offset);
    }

    // Find the hourly index nearest to `at`. Hourly times are local strings
    // (timezone=auto), so shift `at` by the offset and compare the hour key.
    const hourly = j.hourly;
    if (!hourly?.time?.length) {
      return j.current ? mapBlock(j.current, tz_offset) : null;
    }
    const shifted = new Date(at.getTime() + offsetSec * 1000);
    const key = shifted.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    let idx = hourly.time.findIndex((t: string) => t.slice(0, 13) === key);
    if (idx < 0) {
      // Clamp to the closest available sample by absolute time distance.
      idx = nearestIndex(hourly.time, shifted);
    }
    if (idx < 0) return j.current ? mapBlock(j.current, tz_offset) : null;

    return {
      temp_c: num(hourly.temperature_2m?.[idx]),
      feels_like_c: num(hourly.apparent_temperature?.[idx]),
      humidity: clamp(num(hourly.relative_humidity_2m?.[idx]), 0, 100),
      wind_kph: num(hourly.wind_speed_10m?.[idx]),
      pressure_hpa: num(hourly.surface_pressure?.[idx], 1013),
      precip_mm: num(hourly.precipitation?.[idx]),
      cloud_pct: clamp(num(hourly.cloud_cover?.[idx]), 0, 100),
      condition: wmoToCondition(num(hourly.weather_code?.[idx])),
      tz_offset,
    };
  } catch {
    return null;
  }
}

function mapBlock(b: any, tz_offset: number): OpenMeteoWeather {
  return {
    temp_c: num(b.temperature_2m),
    feels_like_c: num(b.apparent_temperature),
    humidity: clamp(num(b.relative_humidity_2m), 0, 100),
    wind_kph: num(b.wind_speed_10m),
    pressure_hpa: num(b.surface_pressure, 1013),
    precip_mm: num(b.precipitation),
    cloud_pct: clamp(num(b.cloud_cover), 0, 100),
    condition: wmoToCondition(num(b.weather_code)),
    tz_offset,
  };
}

function nearestIndex(times: string[], shifted: Date): number {
  const targetMs = shifted.getTime();
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const ms = Date.parse(times[i] + ":00Z"); // treat local string as UTC clock
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export interface HourlyReading {
  temp_c: number;
  feels_like_c: number;
  humidity: number;
  wind_kph: number;
  pressure_hpa: number;
  precip_mm: number;
  cloud_pct: number;
  condition: Condition;
}

/** Map of "YYYY-MM-DDTHH" (UTC) -> reading for one coordinate. */
export type HourlyMap = Map<string, HourlyReading>;

/**
 * Fetch real hourly weather for a batch of coordinates over a past/forecast
 * window. Times are keyed in UTC ("YYYY-MM-DDTHH"). Used by the ingest script
 * to populate the globe with real data. Returns one HourlyMap per input
 * coordinate (same order); a coordinate that fails resolves to an empty map so
 * the caller can fall back to synthetic data.
 */
export async function fetchOpenMeteoHourlyBatch(
  coords: { lat: number; lon: number }[],
  pastDays: number,
  forecastDays: number
): Promise<HourlyMap[]> {
  if (coords.length === 0) return [];

  const params = new URLSearchParams({
    latitude: coords.map((c) => c.lat).join(","),
    longitude: coords.map((c) => c.lon).join(","),
    timezone: "GMT", // hourly time keys are UTC
    past_days: String(Math.min(92, Math.max(1, pastDays))),
    forecast_days: String(Math.min(16, Math.max(1, forecastDays))),
    hourly: HOURLY_VARS,
    wind_speed_unit: "kmh",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  try {
    const r = await fetch(url);
    if (!r.ok) return coords.map(() => new Map());
    const j: any = await r.json();
    // Open-Meteo returns an array when multiple locations are requested, or a
    // single object for one location.
    const list: any[] = Array.isArray(j) ? j : [j];
    return coords.map((_, i) => buildHourlyMap(list[i]));
  } catch {
    return coords.map(() => new Map());
  }
}

function buildHourlyMap(loc: any): HourlyMap {
  const map: HourlyMap = new Map();
  const h = loc?.hourly;
  if (!h?.time?.length) return map;
  for (let i = 0; i < h.time.length; i++) {
    const key = String(h.time[i]).slice(0, 13); // "YYYY-MM-DDTHH"
    map.set(key, {
      temp_c: num(h.temperature_2m?.[i]),
      feels_like_c: num(h.apparent_temperature?.[i]),
      humidity: clamp(num(h.relative_humidity_2m?.[i]), 0, 100),
      wind_kph: num(h.wind_speed_10m?.[i]),
      pressure_hpa: num(h.surface_pressure?.[i], 1013),
      precip_mm: num(h.precipitation?.[i]),
      cloud_pct: clamp(num(h.cloud_cover?.[i]), 0, 100),
      condition: wmoToCondition(num(h.weather_code?.[i])),
    });
  }
  return map;
}
