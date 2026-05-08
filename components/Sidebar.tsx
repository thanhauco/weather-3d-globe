"use client";

import { useEffect, useState } from "react";
import type { CitySnapshot, SeriesPoint, DailyPoint } from "@/lib/types";
import { CONDITION_LABEL, weatherEmoji, tempColor, isDaytime } from "@/lib/weatherIcons";
import Sparkline from "./Sparkline";

interface SidebarProps {
  cities: CitySnapshot[];
  selectedId: number | null;
  at: Date;
  onSelect: (id: number | null) => void;
}

interface SeriesResponse {
  series: SeriesPoint[];
  daily: DailyPoint[];
}

export default function Sidebar({ cities, selectedId, at, onSelect }: SidebarProps) {
  const selected = cities.find((c) => c.id === selectedId) ?? null;
  const [data, setData] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedId == null) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/series?cityId=${selectedId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const agg = aggregate(cities);

  return (
    <div className="glass pointer-events-auto flex h-full w-[340px] flex-col rounded-2xl">
      <header className="border-b border-slate-700/40 px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Weatherglobe
        </div>
        <h1 className="mt-1 text-xl font-bold text-white">Global Forecast Predictor</h1>
        <p className="text-xs text-slate-400">
          Tracking {cities.length} cities · TimescaleDB
        </p>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
        {!selected ? (
          <GlobalView agg={agg} />
        ) : (
          <CityView
            city={selected}
            data={data}
            loading={loading}
            onBack={() => onSelect(null)}
            at={at}
          />
        )}
      </div>

      <footer className="border-t border-slate-700/40 px-5 py-3 text-[10px] text-slate-500">
        Live Open-Meteo data · hypertables + continuous aggregates
      </footer>
    </div>
  );
}

function GlobalView({ agg }: { agg: ReturnType<typeof aggregate> }) {
  const metrics = [
    { label: "Avg Temperature", value: `${agg.temp.toFixed(1)}°C`, icon: "🌡️" },
    { label: "Avg Feels Like", value: `${agg.feels.toFixed(1)}°C`, icon: "🤚" },
    { label: "Avg Wind", value: `${agg.wind.toFixed(0)} kph`, icon: "💨" },
    { label: "Avg Humidity", value: `${agg.humidity.toFixed(0)} %`, icon: "💧" },
    { label: "Avg Pressure", value: `${agg.pressure.toFixed(0)} hPa`, icon: "🧭" },
    { label: "Total Precip", value: `${agg.precip.toFixed(1)} mm`, icon: "🌧️" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex items-center gap-3 rounded-xl bg-slate-800/40 px-3 py-2.5 ring-1 ring-slate-700/40"
          >
            <span className="text-lg">{m.icon}</span>
            <div>
              <div className="text-lg font-semibold leading-tight text-white">
                {m.value}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {m.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-slate-800/40 px-3 py-3 ring-1 ring-slate-700/40">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Conditions worldwide
        </div>
        <div className="space-y-1.5">
          {agg.conditions.map(([cond, count]) => (
            <div key={cond} className="flex items-center gap-2 text-sm">
              <span className="w-5">{weatherEmoji(cond, 12)}</span>
              <span className="w-16 capitalize text-slate-300">
                {CONDITION_LABEL[cond]}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/50">
                <div
                  className="h-full rounded-full bg-sky-400/70"
                  style={{ width: `${(count / agg.total) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right text-xs text-slate-400">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-slate-700/50 px-3 py-3 text-xs text-slate-400">
        Select a city marker on the globe to inspect its hourly trend and 3-day forecast.
      </div>
    </div>
  );
}

function CityView({
  city,
  data,
  loading,
  onBack,
  at,
}: {
  city: CitySnapshot;
  data: SeriesResponse | null;
  loading: boolean;
  onBack: () => void;
  at: Date;
}) {
  const tempSeries = data?.series.map((s) => s.temp_c) ?? [];
  const forecastFrom = data?.series.findIndex((s) => s.is_forecast) ?? -1;

  const futureDaily = (data?.daily ?? []).filter((d) => d.is_forecast).slice(0, 3);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-xs text-sky-400 hover:text-sky-300"
      >
        ← Back to global
      </button>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-bold text-white">{city.name}</div>
          <div className="text-xs text-slate-400">
            {city.country} · {city.lat.toFixed(1)}°, {city.lon.toFixed(1)}°
          </div>
        </div>
        <div className="text-4xl">{weatherEmoji(city.condition, city.local_hour)}</div>
      </div>

      <div
        className="rounded-2xl px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${tempColor(city.temp_c)}33, transparent)`,
          border: `1px solid ${tempColor(city.temp_c)}55`,
        }}
      >
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold text-white">
            {city.temp_c.toFixed(1)}°
          </span>
          <span className="pb-1 text-sm text-slate-300">
            {CONDITION_LABEL[city.condition]}
          </span>
          {city.is_forecast && (
            <span className="ml-auto rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-300">
              forecast
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-slate-300">
          Feels like {city.feels_like_c.toFixed(1)}° ·{" "}
          {isDaytime(city.local_hour) ? "Daytime" : "Night"} (local{" "}
          {Math.floor(city.local_hour).toString().padStart(2, "0")}:00)
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Wind" value={`${city.wind_kph.toFixed(0)}`} unit="kph" />
        <Stat label="Humidity" value={`${city.humidity.toFixed(0)}`} unit="%" />
        <Stat label="Pressure" value={`${city.pressure_hpa.toFixed(0)}`} unit="hPa" />
        <Stat label="Precip" value={`${city.precip_mm.toFixed(1)}`} unit="mm" />
        <Stat label="Cloud" value={`${city.cloud_pct.toFixed(0)}`} unit="%" />
        <Stat label="Pop." value={fmtPop(city.population)} unit="" />
      </div>

      <div className="rounded-xl bg-slate-800/40 px-3 py-3 ring-1 ring-slate-700/40">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <span>Temperature trend</span>
          <span className="text-violet-300/80">— forecast</span>
        </div>
        {loading ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : (
          <Sparkline
            values={tempSeries}
            forecastFrom={forecastFrom >= 0 ? forecastFrom : undefined}
            width={288}
          />
        )}
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          3-day forecast
        </div>
        <div className="grid grid-cols-3 gap-2">
          {futureDaily.length === 0 && (
            <div className="col-span-3 text-xs text-slate-500">No forecast data.</div>
          )}
          {futureDaily.map((d) => (
            <div
              key={d.bucket}
              className="rounded-xl bg-slate-800/50 px-2 py-2 text-center ring-1 ring-slate-700/40"
            >
              <div className="text-[10px] uppercase text-slate-400">
                {new Date(d.bucket).toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {Math.round(d.temp_max)}°
              </div>
              <div className="text-[11px] text-slate-400">{Math.round(d.temp_min)}°</div>
              <div className="mt-1 text-[10px] text-sky-300">
                {d.precip_mm.toFixed(1)}mm
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-slate-800/40 px-2 py-2 ring-1 ring-slate-700/40">
      <div className="text-sm font-semibold text-white">
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-slate-400">{unit}</span>}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function fmtPop(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M`;
  if (p >= 1_000) return `${(p / 1_000).toFixed(0)}K`;
  return `${p}`;
}

function aggregate(cities: CitySnapshot[]) {
  const n = cities.length || 1;
  const sum = (f: (c: CitySnapshot) => number) =>
    cities.reduce((a, c) => a + f(c), 0);
  const conditionCount = new Map<CitySnapshot["condition"], number>();
  for (const c of cities) {
    conditionCount.set(c.condition, (conditionCount.get(c.condition) ?? 0) + 1);
  }
  const conditions = Array.from(conditionCount.entries()).sort((a, b) => b[1] - a[1]);
  return {
    temp: sum((c) => c.temp_c) / n,
    feels: sum((c) => c.feels_like_c) / n,
    wind: sum((c) => c.wind_kph) / n,
    humidity: sum((c) => c.humidity) / n,
    pressure: sum((c) => c.pressure_hpa) / n,
    precip: sum((c) => c.precip_mm),
    conditions,
    total: cities.length || 1,
  };
}
