"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CitySnapshot, GeocodeResult, PlaceSnapshot, StormSummary, StormTrack } from "@/lib/types";
import { sunElevation } from "@/lib/geo";
import { weatherEmoji, tempColor, CONDITION_LABEL } from "@/lib/weatherIcons";
import Sidebar from "./Sidebar";
import SearchBox from "./SearchBox";
import TimeSlider from "./TimeSlider";
import Legend from "./Legend";
import StormPanel from "./StormPanel";
import WeatherAskBox from "./WeatherAskBox";

// Globe pulls in three.js / WebGL → client-only.
const Globe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-slate-500">
      Loading globe…
    </div>
  ),
});

interface Meta {
  minTime: string;
  maxTime: string;
  forecastStart: string | null;
  now: string;
  cityCount: number;
}

export default function Dashboard() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<number>(Date.now());
  const [cities, setCities] = useState<CitySnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [focus, setFocus] = useState<{
    lat: number;
    lon: number;
    distance?: number;
  } | null>(null);
  const [place, setPlace] = useState<PlaceSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  // Storm-tracking state variables
  const [stormView, setStormView] = useState(false);
  const [selectedStorm, setSelectedStorm] = useState<StormSummary | null>(null);
  const [stormTrack, setStormTrack] = useState<StormTrack | null>(null);

  // Wind-flow overlay + shareable-link UI state
  const [windMode, setWindMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchSeq = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeSeq = useRef(0);
  const focusRef = useRef<GeocodeResult | null>(null);
  const autoLocatedRef = useRef(false);
  const urlRestoredRef = useRef(false);

  // Load metadata / time window once.
  useEffect(() => {
    fetch("/api/meta")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Failed to load metadata");
        return j as Meta;
      })
      .then((m) => {
        setMeta(m);
        setValue(new Date(m.now).getTime());
      })
      .catch((e) => setError(e.message));
  }, []);

  // Fetch the globe snapshot for the current time (debounced).
  const loadSnapshot = useCallback((t: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const seq = ++fetchSeq.current;
      try {
        const r = await fetch(`/api/snapshot?at=${new Date(t).toISOString()}`);
        const j = await r.json();
        if (seq !== fetchSeq.current) return; // a newer request superseded this
        if (r.ok) setCities(j.cities);
      } catch {
        /* keep previous frame */
      }
    }, 120);
  }, []);

  useEffect(() => {
    if (meta) loadSnapshot(value);
  }, [value, meta, loadSnapshot]);

  // Keep the browser URL in sync with the current view so it can be shared.
  useEffect(() => {
    if (!meta || !urlRestoredRef.current || typeof window === "undefined") return;
    const p = new URLSearchParams();
    p.set("t", new Date(value).toISOString());
    if (windMode) p.set("wind", "1");
    if (place) {
      p.set("lat", place.lat.toFixed(4));
      p.set("lon", place.lon.toFixed(4));
      if (place.name) p.set("name", place.name);
      if (place.country) p.set("country", place.country);
      if (place.admin1) p.set("admin1", place.admin1);
    } else if (stormView) {
      p.set("storm", "1");
    } else if (selectedId != null) {
      p.set("city", String(selectedId));
    }
    const next = `${window.location.pathname}?${p.toString()}`;
    window.history.replaceState(null, "", next);
  }, [meta, value, windMode, place, stormView, selectedId]);

  // Fetch synthetic live weather for the focused place at the current instant.
  const loadPlace = useCallback((g: GeocodeResult, t: number) => {
    const seq = ++placeSeq.current;
    const params = new URLSearchParams({
      lat: String(g.lat),
      lon: String(g.lon),
      name: g.name,
      country: g.country,
      admin1: g.admin1,
      at: new Date(t).toISOString(),
    });
    fetch(`/api/place?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (seq === placeSeq.current && j.place) setPlace(j.place);
      })
      .catch(() => {
        /* keep previous */
      });
  }, []);

  // Restore view from shareable URL params (runs once, after meta is ready).
  useEffect(() => {
    if (!meta || urlRestoredRef.current) return;
    urlRestoredRef.current = true;
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);

    const t = p.get("t");
    if (t) {
      const ms = Date.parse(t);
      if (!Number.isNaN(ms)) {
        const min = new Date(meta.minTime).getTime();
        const max = new Date(meta.maxTime).getTime();
        setValue(Math.min(max, Math.max(min, ms)));
      }
    }
    if (p.get("wind") === "1") setWindMode(true);

    const lat = parseFloat(p.get("lat") || "");
    const lon = parseFloat(p.get("lon") || "");
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      const g: GeocodeResult = {
        id: 0,
        name: p.get("name") || "Pinned location",
        country: p.get("country") || "",
        admin1: p.get("admin1") || "",
        lat,
        lon,
      };
      autoLocatedRef.current = true; // don't let IP geolocation override a link
      focusRef.current = g;
      setFocus({ lat, lon, distance: 2.6 });
      setAutoRotate(false);
      loadPlace(g, t ? Date.parse(t) : new Date(meta.now).getTime());
    } else if (p.get("storm") === "1") {
      setStormView(true);
    } else {
      const cityId = parseInt(p.get("city") || "", 10);
      if (!Number.isNaN(cityId)) setSelectedId(cityId);
    }
  }, [meta, loadPlace]);

  const handleSelectPlace = useCallback(
    (g: GeocodeResult) => {
      focusRef.current = g;
      setFocus({ lat: g.lat, lon: g.lon });
      setAutoRotate(false);
      setSelectedId(null);
      setStormView(false); // Turn off storm view if user searches/selects a city
      setSelectedStorm(null);
      setStormTrack(null);
      loadPlace(g, value);
    },
    [loadPlace, value]
  );

  const clearFocus = useCallback(() => {
    focusRef.current = null;
    setFocus(null);
    setPlace(null);
  }, []);

  const handleSelectStorm = useCallback((storm: StormSummary | null) => {
    setSelectedStorm(storm);
    if (!storm) {
      setStormTrack(null);
      return;
    }
    // Fetch and set storm track coordinates. Set focus to the storm center.
    fetch(`/api/storms/track?eventId=${storm.eventId}&episodeId=${storm.episodeId}&at=${new Date(value).toISOString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.track) {
          setStormTrack(data.track);
          if (data.track.current) {
            setFocus({
              lat: data.track.current.lat,
              lon: data.track.current.lon,
              distance: 3.2,
            });
            setAutoRotate(false);
          }
        }
      })
      .catch(() => {});
  }, [value]);

  const handleToggleStormView = useCallback(() => {
    setStormView((prev) => {
      const next = !prev;
      if (next) {
        // Clearing focus when enabling storm view or closing standard layouts
        clearFocus();
        setSelectedId(null);
      } else {
        setSelectedStorm(null);
        setStormTrack(null);
      }
      return next;
    });
  }, [clearFocus]);

  // On first load, detect the user's location by IP and gently bring it to the
  // front (keeping the ~70% globe framing) with live weather. Runs once and
  // never overrides an explicit search.
  useEffect(() => {
    if (!meta) return;
    fetch("/api/iploc")
      .then((r) => r.json())
      .then((j) => {
        const g: GeocodeResult | null = j.place;
        // Skip if the lookup failed or the user already searched a place.
        if (!g || focusRef.current || autoLocatedRef.current) return;
        autoLocatedRef.current = true;
        focusRef.current = g;
        setFocus({ lat: g.lat, lon: g.lon, distance: 4.9 });
        setAutoRotate(false);
        setSelectedId(null);
        loadPlace(g, new Date(meta.now).getTime());
      })
      .catch(() => {
        /* geolocation optional */
      });
  }, [meta, loadPlace]);

  // Esc dismisses the focused place.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clearFocus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearFocus]);

  // Keep the focused place's weather in sync as the time slider moves.
  useEffect(() => {
    if (focusRef.current) loadPlace(focusRef.current, value);
  }, [value, loadPlace]);

  // Manually pull the latest Open-Meteo data into the DB, then reload the globe.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/refresh", { method: "POST" });
      const j = await r.json();
      if (r.ok && j.ok) {
        setLastRefresh(new Date(j.at).toLocaleTimeString());
        loadSnapshot(value); // re-render the globe with fresh rows
        if (focusRef.current) loadPlace(focusRef.current, value);
      }
    } catch {
      /* ignore — user can retry */
    } finally {
      setRefreshing(false);
    }
  }, [value, loadSnapshot, loadPlace]);

  // Copy the current shareable URL (already kept in sync) to the clipboard.
  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the URL is still shareable from the address bar */
    }
  }, []);

  if (error) {
    return <SetupNotice message={error} />;
  }
  if (!meta) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Connecting to TimescaleDB…
      </div>
    );
  }

  const minTime = new Date(meta.minTime).getTime();
  const maxTime = new Date(meta.maxTime).getTime();
  const nowTime = new Date(meta.now).getTime();

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* Globe fills the screen */}
      <div className="absolute inset-0">
        <Globe
          cities={cities}
          at={new Date(value)}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          autoRotate={autoRotate && !playing && !focus}
          focus={focus}
          focusPlace={place}
          stormMode={stormView}
          selectedStorm={selectedStorm}
          stormTrack={stormTrack}
          windMode={windMode}
        />
      </div>

      {/* Search and natural-language weather Q&A — top center */}
      <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-col items-center">
        <SearchBox
          onSelect={handleSelectPlace}
          activeName={
            place ? `${place.name}${place.country ? ", " + place.country : ""}` : null
          }
          onClear={clearFocus}
        />
        <WeatherAskBox at={new Date(value)} place={place} />
      </div>

      {/* Live weather panel for the focused place — right side */}
      {place && (
        <div className="pointer-events-none absolute right-4 top-20 z-10">
          <PlacePanel place={place} at={new Date(value)} onClose={clearFocus} />
        </div>
      )}

      {/* Extreme storms panel / tracker - right side */}
      {stormView && (
        <div className="pointer-events-none absolute right-4 top-20 z-40">
          <StormPanel
            at={new Date(value)}
            onSelectStorm={handleSelectStorm}
            selectedStorm={selectedStorm}
            onClose={() => setStormView(false)}
          />
        </div>
      )}

      {/* Left sidebar - hidden when stormView is active to maximize visibility */}
      {!stormView && (
        <div className="pointer-events-none absolute left-4 top-4 bottom-24 z-10">
          <Sidebar
            cities={cities}
            selectedId={selectedId}
            at={new Date(value)}
            onSelect={setSelectedId}
          />
        </div>
      )}

      {/* Top-right controls */}
      <div className="pointer-events-none absolute right-4 top-4 z-30 flex items-center gap-2">
        <button
          onClick={handleToggleStormView}
          className={`glass pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
            stormView
              ? "bg-amber-500/20 text-amber-200 border border-amber-500/30 font-bold"
              : "text-slate-200 hover:text-white"
          }`}
        >
          <span>🌪️</span>
          Storm View
        </button>
        <button
          onClick={() => setWindMode((v) => !v)}
          title="Toggle the animated wind-flow overlay"
          className={`glass pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
            windMode
              ? "bg-sky-500/20 text-sky-200 border border-sky-500/30 font-bold"
              : "text-slate-200 hover:text-white"
          }`}
        >
          <span>💨</span>
          Wind
        </button>
        <button
          onClick={handleShare}
          title="Copy a shareable link to this exact view"
          className="glass pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-200 hover:text-white"
        >
          <span>{copied ? "✓" : "🔗"}</span>
          {copied ? "Copied!" : "Share"}
        </button>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title={
            lastRefresh
              ? `Last updated ${lastRefresh}`
              : "Fetch the latest Open-Meteo data"
          }
          className="glass pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-200 hover:text-white disabled:opacity-60"
        >
          <span className={refreshing ? "inline-block animate-spin" : ""}>⟳</span>
          {refreshing ? "Updating…" : "Refresh data"}
        </button>
        <button
          onClick={() => setAutoRotate((v) => !v)}
          className="glass pointer-events-auto rounded-full px-3 py-1.5 text-xs text-slate-200 hover:text-white"
        >
          {autoRotate ? "⏸ Rotation" : "▶ Rotation"}
        </button>
        <div className="glass pointer-events-auto rounded-full px-3 py-1.5 text-xs text-slate-300">
          Tracking <span className="font-semibold text-white">{meta.cityCount}</span> cities
        </div>
      </div>

      {/* Legend bottom-left */}
      <div className="pointer-events-none absolute bottom-24 right-4 z-10">
        <Legend />
      </div>

      {/* Time-travel slider bottom-center */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <TimeSlider
          minTime={minTime}
          maxTime={maxTime}
          nowTime={nowTime}
          value={value}
          playing={playing}
          onChange={setValue}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
      </div>
    </main>
  );
}

function PlacePanel({
  place,
  at,
  onClose,
}: {
  place: PlaceSnapshot;
  at: Date;
  onClose: () => void;
}) {
  const color = tempColor(place.temp_c);
  const elevation = sunElevation(place.lat, place.lon, at);
  const isDay = elevation > 0;
  const hh = Math.floor(place.local_hour).toString().padStart(2, "0");
  const mm = Math.round((place.local_hour % 1) * 60)
    .toString()
    .padStart(2, "0");

  const stats: Array<[string, string]> = [
    ["Feels like", `${Math.round(place.feels_like_c)}°C`],
    ["Humidity", `${Math.round(place.humidity)}%`],
    ["Wind", `${Math.round(place.wind_kph)} km/h`],
    ["Cloud", `${Math.round(place.cloud_pct)}%`],
    ["Precip", `${place.precip_mm.toFixed(1)} mm`],
    ["Pressure", `${Math.round(place.pressure_hpa)} hPa`],
  ];

  return (
    <div className="glass pointer-events-auto w-72 rounded-2xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-white">{place.name}</h2>
          <p className="text-xs text-slate-400">
            {[place.admin1, place.country].filter(Boolean).join(", ")}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full px-2 text-slate-400 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span style={{ fontSize: 40 }}>
          {weatherEmoji(place.condition, place.local_hour, isDay)}
        </span>
        <div>
          <div className="text-3xl font-bold" style={{ color }}>
            {Math.round(place.temp_c)}°C
          </div>
          <div className="text-xs text-slate-300">
            {CONDITION_LABEL[place.condition]}
            {place.is_forecast && (
              <span className="ml-1 rounded bg-sky-500/20 px-1 text-sky-300">
                forecast
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-black/30 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Local time</span>
          <span className="font-semibold text-white">
            {hh}:{mm}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-slate-400">Sunlight</span>
          <span className="font-semibold text-amber-200">
            {isDay ? "☀ Day" : "🌙 Night"} · sun {elevation > 0 ? "+" : ""}
            {elevation.toFixed(0)}°
          </span>
        </div>
        {/* sun elevation bar (horizon at center) */}
        <div className="relative mt-2 h-1.5 w-full rounded-full bg-slate-700/60">
          <div className="absolute left-1/2 top-0 h-full w-px bg-slate-500" />
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
            style={{
              left: `${Math.max(2, Math.min(98, 50 + (elevation / 90) * 48))}%`,
              background: isDay ? "#ffd76a" : "#7aa2ff",
              boxShadow: `0 0 8px ${isDay ? "#ffd76a" : "#7aa2ff"}`,
            }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {stats.map(([label, val]) => (
          <div key={label} className="rounded-lg bg-black/25 px-2 py-1.5">
            <div className="text-slate-400">{label}</div>
            <div className="font-semibold text-white">{val}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] text-slate-500">
        {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°
      </div>
    </div>
  );
}

function SetupNotice({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="glass max-w-lg rounded-2xl p-8">
        <h1 className="text-xl font-bold text-white">Global Forecast Predictor</h1>
        <p className="mt-2 text-sm text-rose-300">{message}</p>
        <div className="mt-4 space-y-2 text-sm text-slate-300">
          <p>To bring the dashboard online:</p>
          <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-slate-200">
{`docker compose up -d        # start TimescaleDB
npm run db:setup            # migrate + seed weather data
npm run dev                 # launch the dashboard`}
          </pre>
          <p className="text-xs text-slate-400">
            Or point <code>DATABASE_URL</code> in <code>.env.local</code> at your Tiger
            Cloud service and re-run <code>npm run db:setup</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
