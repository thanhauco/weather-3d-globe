import type { Condition } from "./types";
import type { CitySeed } from "./cities";

// ---------------------------------------------------------------------------
// Deterministic synthetic weather. Same (city, time) always yields the same
// reading, so the dataset is reproducible and the forecast layer is stable.
// ---------------------------------------------------------------------------

function hash(n: number): number {
  // integer hash -> [0,1)
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0xffffffff;
}

const TWO_PI = Math.PI * 2;
const HOUR = 3600_000;

export interface SynthInput {
  city: CitySeed;
  cityId: number;
  date: Date;
  isForecast: boolean;
}

export interface SynthReading {
  temp_c: number;
  feels_like_c: number;
  humidity: number;
  wind_kph: number;
  pressure_hpa: number;
  precip_mm: number;
  cloud_pct: number;
  condition: Condition;
}

export function tzOffsetFor(lon: number): number {
  return Math.round(lon / 15);
}

/** Smooth, autocorrelated "weather front" signal in [0,1] for a city. */
function frontSignal(cityId: number, hours: number): number {
  const p1 = hash(cityId * 7 + 11) * TWO_PI;
  const p2 = hash(cityId * 13 + 3) * TWO_PI;
  const p3 = hash(cityId * 29 + 17) * TWO_PI;
  // periods ~ 2.8 days, 1.3 days, 8 hours
  const s =
    0.55 * Math.sin((hours / 67) * TWO_PI + p1) +
    0.3 * Math.sin((hours / 31) * TWO_PI + p2) +
    0.15 * Math.sin((hours / 8) * TWO_PI + p3);
  return (s + 1) / 2; // -> [0,1]
}

export function generateReading({ city, cityId, date, isForecast }: SynthInput): SynthReading {
  const { lat, lon } = city;
  const absLat = Math.abs(lat);
  const tz = tzOffsetFor(lon);

  const epochHours = Math.floor(date.getTime() / HOUR);
  const utcHour = date.getUTCHours();
  const localHour = (((utcHour + tz) % 24) + 24) % 24;

  // Day of year for seasonal cycle.
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date.getTime() - start) / 86_400_000;

  // Base climate from latitude.
  const baseTemp = 30 - 0.55 * absLat;

  // Seasonal swing — larger toward the poles, hemisphere-aware.
  const seasonalAmp = Math.min(18, 0.28 * absLat);
  const hemisphereSign = lat >= 0 ? 1 : -1;
  const seasonal =
    seasonalAmp * Math.cos(((doy - 196) / 365.25) * TWO_PI) * hemisphereSign;

  // Diurnal swing — peak mid-afternoon, trough before dawn.
  const diurnalAmp = 4 + 4 * (1 - Math.min(1, absLat / 90));
  const diurnal = -diurnalAmp * Math.cos(((localHour - 15) / 24) * TWO_PI);

  const front = frontSignal(cityId, epochHours);

  // Forecast readings carry slightly more jitter to feel "predicted".
  const noiseScale = isForecast ? 2.4 : 1.4;
  const noise = (hash(cityId * 101 + epochHours) - 0.5) * 2 * noiseScale;

  // Fronts cool things a little when active (more clouds/rain).
  const frontCooling = -3.5 * (front - 0.5);

  const temp_c = round1(baseTemp + seasonal + diurnal + frontCooling + noise);

  // Wind / humidity / cloud / precip driven by the same front signal.
  const wind_kph = round1(6 + front * 38 + hash(cityId * 5 + epochHours) * 6);
  const humidity = clamp(
    round1(45 + front * 45 + (absLat < 25 ? 12 : 0) - diurnal * 1.5),
    8,
    100
  );
  const cloud_pct = clamp(round1(front * 110 - 15 + (hash(cityId + epochHours) - 0.5) * 20), 0, 100);

  let precip_mm = 0;
  if (front > 0.62) {
    precip_mm = round1((front - 0.62) * 26 * (0.5 + hash(cityId * 3 + epochHours)));
  }

  const pressure_hpa = round1(1013 + (0.5 - front) * 28 + (hash(cityId * 19 + epochHours) - 0.5) * 6);

  // Wind chill / heat index style "feels like".
  let feels_like_c = temp_c;
  if (temp_c <= 10 && wind_kph > 8) {
    feels_like_c = temp_c - (wind_kph / 25) * (1 + (10 - temp_c) / 20);
  } else if (temp_c >= 27 && humidity > 50) {
    feels_like_c = temp_c + ((humidity - 50) / 100) * (temp_c - 24);
  }
  feels_like_c = round1(feels_like_c);

  const condition = deriveCondition(temp_c, cloud_pct, precip_mm);

  return { temp_c, feels_like_c, humidity, wind_kph, pressure_hpa, precip_mm, cloud_pct, condition };
}

function deriveCondition(temp: number, cloud: number, precip: number): Condition {
  if (precip > 6) return "storm";
  if (precip > 0.4) return temp <= 0 ? "snow" : "rain";
  if (cloud > 55) return "clouds";
  return "clear";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
