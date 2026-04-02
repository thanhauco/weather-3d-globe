import type { Condition } from "./types";

export function isDaytime(localHour: number): boolean {
  return localHour >= 6 && localHour < 18.5;
}

/** Emoji icon for a condition, switching sun/moon by local time of day.
 *  Pass `dayOverride` to force day/night (e.g. from true sun elevation). */
export function weatherEmoji(
  condition: Condition,
  localHour: number,
  dayOverride?: boolean
): string {
  const day = dayOverride ?? isDaytime(localHour);
  switch (condition) {
    case "clear":
      return day ? "☀️" : "🌙";
    case "clouds":
      return day ? "⛅" : "☁️";
    case "rain":
      return "🌧️";
    case "snow":
      return "❄️";
    case "storm":
      return "⛈️";
    default:
      return day ? "☀️" : "🌙";
  }
}

export const CONDITION_LABEL: Record<Condition, string> = {
  clear: "Clear",
  clouds: "Cloudy",
  rain: "Rain",
  snow: "Snow",
  storm: "Storm",
};

/** Map a temperature (°C) to a color on a cool→warm gradient. */
export function tempColor(temp: number): string {
  const stops: Array<[number, [number, number, number]]> = [
    [-25, [49, 54, 149]],
    [-10, [69, 117, 180]],
    [0, [116, 173, 209]],
    [10, [171, 217, 233]],
    [18, [255, 255, 191]],
    [26, [253, 174, 97]],
    [34, [244, 109, 67]],
    [42, [165, 0, 38]],
  ];
  if (temp <= stops[0][0]) return rgb(stops[0][1]);
  if (temp >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (temp >= t0 && temp <= t1) {
      const f = (temp - t0) / (t1 - t0);
      return rgb([
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ]);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}
