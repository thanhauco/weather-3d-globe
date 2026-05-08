"use client";

import { tempColor } from "@/lib/weatherIcons";

export default function Legend() {
  const stops = [-20, -10, 0, 10, 20, 30, 40];
  const gradient = `linear-gradient(to right, ${stops
    .map((t, i) => `${tempColor(t)} ${(i / (stops.length - 1)) * 100}%`)
    .join(", ")})`;

  return (
    <div className="glass pointer-events-auto rounded-xl px-3 py-2 text-[11px] text-slate-300">
      <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">
        Temperature
      </div>
      <div
        className="h-2 w-44 rounded-full"
        style={{ background: gradient }}
      />
      <div className="mt-1 flex w-44 justify-between text-[10px] text-slate-400">
        <span>-20°</span>
        <span>10°</span>
        <span>40°C</span>
      </div>
    </div>
  );
}
