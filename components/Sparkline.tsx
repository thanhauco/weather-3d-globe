"use client";

interface SparklineProps {
  values: number[];
  /** index at which forecast begins (values >= this are dashed/lighter) */
  forecastFrom?: number;
  width?: number;
  height?: number;
  color?: string;
  forecastColor?: string;
  fill?: boolean;
}

export default function Sparkline({
  values,
  forecastFrom,
  width = 240,
  height = 56,
  color = "#38bdf8",
  forecastColor = "#a78bfa",
  fill = true,
}: SparklineProps) {
  if (values.length < 2) {
    return <div className="text-xs text-slate-500">No data</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const split = forecastFrom ?? values.length;
  const histPts = values.slice(0, Math.max(2, split)).map((v, i) => `${x(i)},${y(v)}`);
  const fcPts = values
    .slice(Math.max(0, split - 1))
    .map((v, i) => `${x(i + Math.max(0, split - 1))},${y(v)}`);

  const areaPath =
    `M ${x(0)},${height - pad} ` +
    values.map((v, i) => `L ${x(i)},${y(v)}`).join(" ") +
    ` L ${x(values.length - 1)},${height - pad} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {fill && (
        <>
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#spark-fill)" stroke="none" />
        </>
      )}
      <polyline
        points={histPts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {split < values.length && (
        <polyline
          points={fcPts.join(" ")}
          fill="none"
          stroke={forecastColor}
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
