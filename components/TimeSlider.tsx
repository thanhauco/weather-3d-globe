"use client";

import { useEffect, useRef } from "react";

interface TimeSliderProps {
  minTime: number;
  maxTime: number;
  nowTime: number;
  value: number;
  playing: boolean;
  onChange: (t: number) => void;
  onTogglePlay: () => void;
}

const fmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function TimeSlider({
  minTime,
  maxTime,
  nowTime,
  value,
  playing,
  onChange,
  onTogglePlay,
}: TimeSliderProps) {
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  // Animate the slider forward while playing.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    lastRef.current = performance.now();
    const step = (t: number) => {
      const dt = t - lastRef.current;
      lastRef.current = t;
      // 1 real second ≈ 3 simulated hours
      let next = value + dt * 3 * 3600;
      if (next > maxTime) next = minTime;
      onChange(next);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, value, minTime, maxTime]);

  const isForecast = value > nowTime;
  const nowPct = ((nowTime - minTime) / (maxTime - minTime)) * 100;

  return (
    <div className="glass pointer-events-auto w-[min(760px,92vw)] rounded-2xl px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/90 text-white shadow-md transition hover:bg-sky-400"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <div>
            <div className="text-sm font-semibold text-slate-100">
              {fmt.format(new Date(value))}
            </div>
            <div className="text-[11px] text-slate-400">
              {isForecast ? "Forecast" : "Observed"}
            </div>
          </div>
        </div>
        {isForecast && (
          <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-300 ring-1 ring-violet-400/40">
            Forecast
          </span>
        )}
      </div>

      <div className="relative">
        {/* observed vs forecast track tint */}
        <div className="pointer-events-none absolute inset-0 flex h-1.5 self-center overflow-hidden rounded-full" style={{ top: "50%", transform: "translateY(-50%)" }}>
          <div
            className="h-full bg-sky-500/50"
            style={{ width: `${nowPct}%` }}
          />
          <div
            className="h-full bg-violet-500/40"
            style={{ width: `${100 - nowPct}%` }}
          />
        </div>
        {/* "now" marker */}
        <div
          className="pointer-events-none absolute top-1/2 z-10 h-4 w-[2px] -translate-y-1/2 bg-emerald-300"
          style={{ left: `${nowPct}%` }}
          title="Now"
        />
        <input
          type="range"
          className="timeslider relative z-20 w-full bg-transparent"
          min={minTime}
          max={maxTime}
          step={3600 * 1000}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{new Date(minTime).toLocaleDateString()}</span>
        <span className="text-emerald-300/70">now ↑</span>
        <span>{new Date(maxTime).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
