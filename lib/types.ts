export type Condition = "clear" | "clouds" | "rain" | "snow" | "storm";

export interface City {
  id: number;
  name: string;
  country: string;
  lat: number;
  lon: number;
  population: number;
  tz_offset: number;
}

export interface Reading {
  time: string; // ISO
  city_id: number;
  temp_c: number;
  feels_like_c: number;
  humidity: number;
  wind_kph: number;
  pressure_hpa: number;
  precip_mm: number;
  cloud_pct: number;
  condition: Condition;
  is_forecast: boolean;
}

/** A city plus its reading at a particular instant — what the globe renders. */
export interface CitySnapshot {
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
  condition: Condition;
  is_forecast: boolean;
  /** local hour 0-23 at this city for the snapshot instant */
  local_hour: number;
}

export interface SeriesPoint {
  bucket: string; // ISO
  temp_c: number;
  humidity: number;
  wind_kph: number;
  precip_mm: number;
  is_forecast: boolean;
}

export interface DailyPoint {
  bucket: string; // ISO
  temp_min: number;
  temp_avg: number;
  temp_max: number;
  precip_mm: number;
  is_forecast: boolean;
}

/** A geocoding match returned by /api/geocode. */
export interface GeocodeResult {
  id: number;
  name: string;
  country: string;
  admin1: string;
  lat: number;
  lon: number;
}

/** Live weather for an arbitrary searched/located place (real data from
 *  Open-Meteo, with a synthetic fallback). */
export interface PlaceSnapshot {
  name: string;
  country: string;
  admin1: string;
  lat: number;
  lon: number;
  tz_offset: number;
  local_hour: number;
  is_forecast: boolean;
  temp_c: number;
  feels_like_c: number;
  humidity: number;
  wind_kph: number;
  pressure_hpa: number;
  precip_mm: number;
  cloud_pct: number;
  condition: Condition;
}

/** GDACS alert severity for a tropical cyclone. */
export type StormAlert = "Red" | "Orange" | "Green";

/** Summary of one tropical cyclone (from GDACS), for the Storm View list. */
export interface StormSummary {
  eventId: number;
  episodeId: number;
  name: string; // e.g. "SINLAKU-26"
  alert: StormAlert;
  /** Whether GDACS still considers the storm active right now. */
  active: boolean;
  /** Max sustained wind in km/h. */
  maxWindKph: number;
  /** Human category, e.g. "Tropical Storm", "Category 3". */
  category: string;
  source: string; // reporting centre, e.g. JTWC / NHC
  fromDate: string; // ISO
  toDate: string; // ISO
  countries: string[];
  reportUrl: string;
  /** Representative current/last position [lon, lat]. */
  position: [number, number] | null;
}

/** One position along a cyclone track. */
export interface TrackPoint {
  lon: number;
  lat: number;
  time: string; // ISO
  /** true if this position is a forecast (after "now"). */
  forecast: boolean;
}

/** Full reconstructed track + movement for one cyclone. */
export interface StormTrack {
  eventId: number;
  episodeId: number;
  name: string;
  alert: StormAlert;
  points: TrackPoint[];
  current: TrackPoint | null;
  /** Compass bearing the storm is moving toward, degrees (0 = N). */
  headingDeg: number | null;
  /** Forward speed in km/h. */
  speedKph: number | null;
  maxWindKph: number;
}

