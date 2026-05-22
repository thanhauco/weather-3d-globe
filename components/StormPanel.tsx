"use client";

import { useEffect, useState } from "react";
import type { StormSummary, StormTrack } from "@/lib/types";

interface StormPanelProps {
  at: Date;
  onSelectStorm: (storm: StormSummary | null) => void;
  selectedStorm: StormSummary | null;
  onClose: () => void;
}

export default function StormPanel({
  at,
  onSelectStorm,
  selectedStorm,
  onClose,
}: StormPanelProps) {
  const [storms, setStorms] = useState<StormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [track, setTrack] = useState<StormTrack | null>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);

  // Fetch all active storms
  useEffect(() => {
    setLoading(true);
    fetch(`/api/storms?at=${at.toISOString()}`)
      .then((r) => r.json())
      .then((data) => {
        setStorms(data.storms || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [at]);

  // Fetch detailed track for the selected storm
  useEffect(() => {
    if (!selectedStorm) {
      setTrack(null);
      return;
    }
    setLoadingTrack(true);
    fetch(
      `/api/storms/track?eventId=${selectedStorm.eventId}&episodeId=${selectedStorm.episodeId}&at=${at.toISOString()}`
    )
      .then((r) => r.json())
      .then((data) => {
        setTrack(data.track || null);
        setLoadingTrack(false);
      })
      .catch(() => setLoadingTrack(false));
  }, [selectedStorm, at]);

  const alertColor = (level: string) => {
    switch (level) {
      case "Red":
        return "text-red-400 border-red-500/30 bg-red-950/20";
      case "Orange":
        return "text-amber-400 border-amber-500/30 bg-amber-950/20";
      default:
        return "text-emerald-400 border-emerald-500/30 bg-emerald-950/20";
    }
  };

  return (
    <div className="glass pointer-events-auto flex h-[580px] w-80 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 text-white backdrop-blur-md shadow-2xl">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-slate-900 px-4 py-3 bg-slate-950/40">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
            🌪️ Storm Intelligence
          </h2>
          <p className="text-[10px] text-slate-400">
            Realtime Global Cyclones & Tracks
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-slate-900/60 p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          ✕
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-white"></span>
          Scanning planetary feeds…
        </div>
      ) : storms.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs text-slate-500">
          <span>🌀</span>
          <span className="mt-1">Planetary skies are currently calm</span>
          <span className="text-[10px] mt-1 text-slate-600">No active tropical cyclones detected.</span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Active storms list (top half) */}
          <div className="flex-1 overflow-y-auto border-b border-slate-900/60 p-3 space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
              Active Cyclones ({storms.length})
            </p>
            {storms.map((s) => {
              const isSelected =
                selectedStorm?.eventId === s.eventId &&
                selectedStorm?.episodeId === s.episodeId;
              return (
                <button
                  key={`${s.eventId}-${s.episodeId}`}
                  onClick={() => onSelectStorm(isSelected ? null : s)}
                  className={`w-full text-left rounded-xl border p-2.5 transition-all outline-none ${
                    isSelected
                      ? "border-amber-400/60 bg-amber-550/10 shadow-lg shadow-amber-500/5 scale-[0.99]"
                      : "border-slate-800/40 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-700/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100">
                      🌀 {s.name}
                    </span>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider uppercase ${alertColor(
                        s.alert
                      )}`}
                    >
                      {s.alert} Alert
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{s.category}</span>
                    <span className="font-semibold text-slate-300">
                      Max {s.maxWindKph} km/h
                    </span>
                  </div>
                  {s.countries.length > 0 && (
                    <div className="mt-1 text-[9px] text-slate-500 truncate">
                      Threatening: {s.countries.join(", ")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Details & Forecast path (bottom half) */}
          <div className="h-[250px] bg-slate-950/60 p-3 overflow-y-auto">
            {!selectedStorm ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-[11px] text-slate-500">
                <span>👈 Select an active cyclone</span>
                <span>to chart track predictions on the globe</span>
              </div>
            ) : loadingTrack ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                <span className="mr-2 h-3.5 w-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-white"></span>
                Reconstructing track & forecast cones…
              </div>
            ) : track ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-xs font-bold text-slate-200">
                    📊 Predictive Diagnostics
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    Source: {selectedStorm.source}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-900/50 p-2">
                    <div className="text-[10px] text-slate-500">Heading</div>
                    <div className="font-bold text-slate-200">
                      {track.headingDeg !== null ? `${track.headingDeg}°` : "N/A"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900/50 p-2">
                    <div className="text-[10px] text-slate-500">Forward Speed</div>
                    <div className="font-bold text-slate-200">
                      {track.speedKph !== null ? `${track.speedKph} km/h` : "Stationary"}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Movement & Forecast Path
                  </div>
                  <div className="space-y-1.5 pl-1 max-h-[105px] overflow-y-auto text-[10px]">
                    {track.points.map((pt, i) => {
                      const dateObj = new Date(pt.time);
                      const isCurrent = track.current === pt;
                      const isDay = dateObj.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "numeric",
                        day: "numeric",
                      });
                      const isHour = dateObj.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });

                      return (
                        <div
                          key={i}
                          className={`flex items-center justify-between py-0.5 px-1 rounded ${
                            isCurrent
                              ? "bg-amber-400/10 border border-amber-400/20 text-amber-200 font-bold"
                              : pt.forecast
                              ? "text-slate-300"
                              : "text-slate-400"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{
                              backgroundColor: isCurrent ? "#fbbf24" : pt.forecast ? "#60a5fa" : "#94a3b8"
                            }} />
                            <span>
                              {isDay} {isHour}
                            </span>
                          </div>
                          <div className="font-mono text-[9px] text-slate-400">
                            ({pt.lat.toFixed(1)}°, {pt.lon.toFixed(1)}°)
                            {pt.forecast && " [FC]"}
                            {isCurrent && " [LIVE]"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Failed to reconstruct storm path.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
